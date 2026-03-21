import type { Node } from 'web-tree-sitter';
import {
  BUILTIN_METHODS,
  CORE_TYPE_COMPLETIONS,
  KEYWORD_COMPLETIONS,
  LITERAL_COMPLETIONS,
  getBuiltinNamespaceHover,
  getBuiltinHover,
  getBuiltinReturnType,
  getCoreTypeHover,
  getKeywordHover,
  getLiteralHover,
  isBuiltinNamespace,
} from './hoverDocs';
import {
  collectDiagnostics,
  rangeFromNode,
  rangeFromOffsets,
  UtuParserService,
} from './parser';
import {
  clamp,
  comparePositions,
  copyRange,
  getDocumentUri,
  rangeContains,
  rangeKey,
  rangeLength,
  type UtuCompletionItem,
  type UtuDiagnostic,
  type UtuDocumentHighlight,
  type UtuDocumentSymbol,
  type UtuDocumentSymbolKind,
  type UtuHover,
  type UtuLocation,
  type UtuMarkupContent,
  type UtuPositionLike,
  type UtuRange,
  type UtuSemanticToken,
  type UtuTextDocument,
  type UtuWorkspaceSymbol,
} from './types';

export type UtuSymbolKind =
  | 'function'
  | 'importFunction'
  | 'importValue'
  | 'global'
  | 'test'
  | 'bench'
  | 'parameter'
  | 'binding'
  | 'capture'
  | 'matchBinding'
  | 'struct'
  | 'sumType'
  | 'variant'
  | 'field';

export interface UtuSymbol {
  key: string;
  name: string;
  kind: UtuSymbolKind;
  uri: string;
  range: UtuRange;
  detail: string;
  signature: string;
  typeText?: string;
  returnTypeText?: string;
  containerName?: string;
  exported?: boolean;
  topLevel: boolean;
}

export interface UtuOccurrence {
  name: string;
  range: UtuRange;
  role: 'value' | 'type' | 'field' | 'builtin';
  symbolKey?: string;
  builtinKey?: string;
  isDefinition: boolean;
}

export interface UtuDocumentIndex {
  uri: string;
  version: number;
  diagnostics: UtuDiagnostic[];
  symbols: UtuSymbol[];
  symbolByKey: Map<string, UtuSymbol>;
  occurrences: UtuOccurrence[];
  topLevelSymbols: UtuSymbol[];
}

interface CachedIndex {
  version: number;
  index: UtuDocumentIndex;
}

interface SymbolMetadata {
  role: UtuOccurrence['role'];
  completionKind: UtuCompletionItem['kind'];
  documentSymbolKind: UtuDocumentSymbolKind;
  semanticTokenType?: string;
}

interface TopLevelHandler {
  collect(node: Node): void;
  walk(node: Node): void;
}

const SYMBOL_METADATA: Record<UtuSymbolKind, SymbolMetadata> = {
  function: {
    role: 'value',
    completionKind: 'function',
    documentSymbolKind: 'function',
    semanticTokenType: 'function',
  },
  importFunction: {
    role: 'value',
    completionKind: 'function',
    documentSymbolKind: 'function',
    semanticTokenType: 'function',
  },
  importValue: {
    role: 'value',
    completionKind: 'variable',
    documentSymbolKind: 'variable',
    semanticTokenType: 'variable',
  },
  global: {
    role: 'value',
    completionKind: 'variable',
    documentSymbolKind: 'variable',
    semanticTokenType: 'variable',
  },
  test: {
    role: 'value',
    completionKind: 'text',
    documentSymbolKind: 'method',
  },
  bench: {
    role: 'value',
    completionKind: 'text',
    documentSymbolKind: 'event',
  },
  parameter: {
    role: 'value',
    completionKind: 'text',
    documentSymbolKind: 'object',
    semanticTokenType: 'parameter',
  },
  binding: {
    role: 'value',
    completionKind: 'text',
    documentSymbolKind: 'object',
    semanticTokenType: 'variable',
  },
  capture: {
    role: 'value',
    completionKind: 'text',
    documentSymbolKind: 'object',
    semanticTokenType: 'variable',
  },
  matchBinding: {
    role: 'value',
    completionKind: 'text',
    documentSymbolKind: 'object',
    semanticTokenType: 'variable',
  },
  struct: {
    role: 'type',
    completionKind: 'class',
    documentSymbolKind: 'struct',
    semanticTokenType: 'type',
  },
  sumType: {
    role: 'type',
    completionKind: 'class',
    documentSymbolKind: 'enum',
    semanticTokenType: 'type',
  },
  variant: {
    role: 'type',
    completionKind: 'enumMember',
    documentSymbolKind: 'enumMember',
    semanticTokenType: 'enumMember',
  },
  field: {
    role: 'field',
    completionKind: 'text',
    documentSymbolKind: 'object',
    semanticTokenType: 'property',
  },
};

const STATIC_COMPLETION_ITEMS: UtuCompletionItem[] = [
  ...createCompletionItems(KEYWORD_COMPLETIONS, 'keyword'),
  ...createCompletionItems(Object.keys(BUILTIN_METHODS), 'module'),
  ...createCompletionItems(CORE_TYPE_COMPLETIONS, 'class'),
  ...createCompletionItems(LITERAL_COMPLETIONS, 'keyword'),
];

function createCompletionItems(
  labels: readonly string[],
  kind: UtuCompletionItem['kind'],
): UtuCompletionItem[] {
  return labels.map((label) => ({ label, kind }));
}

const RECURSIVE_EXPRESSION_TYPES = new Set([
  'if_expr',
  'binary_expr',
  'tuple_expr',
  'else_expr',
  'index_expr',
  'unary_expr',
  'paren_expr',
  'assign_expr',
]);

export class UtuLanguageService {
  private readonly cache = new Map<string, CachedIndex>();

  constructor(private readonly parserService: UtuParserService) {}

  dispose(): void {
    this.clear();
  }

  invalidate(uri: string): void {
    this.cache.delete(uri);
  }

  clear(): void {
    this.cache.clear();
  }

  async getDiagnostics(document: UtuTextDocument): Promise<UtuDiagnostic[]> {
    const index = await this.getDocumentIndex(document);
    return index.diagnostics.map(cloneDiagnostic);
  }

  async getDocumentIndex(document: UtuTextDocument): Promise<UtuDocumentIndex> {
    const cacheKey = getDocumentUri(document);
    const cached = this.cache.get(cacheKey);

    if (cached && cached.version === document.version) {
      return cached.index;
    }

    const parsedTree = await this.parserService.parseSource(document.getText());

    try {
      const diagnostics = collectDiagnostics(parsedTree.tree.rootNode, document);
      const index = buildDocumentIndex(document, parsedTree.tree.rootNode, diagnostics);
      this.cache.set(cacheKey, {
        version: document.version,
        index,
      });
      return index;
    } finally {
      parsedTree.dispose();
    }
  }

  async getHover(
    document: UtuTextDocument,
    position: UtuPositionLike,
  ): Promise<UtuHover | undefined> {
    const index = await this.getDocumentIndex(document);
    const occurrence = findOccurrenceAtPosition(index, position);

    if (occurrence?.builtinKey) {
      const builtinHover = getBuiltinHover(occurrence.builtinKey);
      if (builtinHover) {
        return {
          contents: builtinHover,
          range: copyRange(occurrence.range),
        };
      }
    }

    const symbol = occurrence?.symbolKey
      ? index.symbolByKey.get(occurrence.symbolKey)
      : findSymbolAtPosition(index, position);

    if (symbol) {
      return {
        contents: symbolToMarkup(symbol),
        range: copyRange(occurrence?.range ?? symbol.range),
      };
    }

    const word = getWordAtPosition(document, position);
    if (!word) return undefined;

    const fallbackHover = getFallbackHover(word.text);
    if (!fallbackHover) return undefined;

    return {
      contents: fallbackHover,
      range: word.range,
    };
  }

  async getDefinition(
    document: UtuTextDocument,
    position: UtuPositionLike,
  ): Promise<UtuLocation | undefined> {
    return this.withResolvedSymbol<UtuLocation | undefined>(
      document,
      position,
      undefined,
      (_index, symbol) => ({
        uri: symbol.uri,
        range: copyRange(symbol.range),
      }),
    );
  }

  async getReferences(
    document: UtuTextDocument,
    position: UtuPositionLike,
    includeDeclaration: boolean,
  ): Promise<UtuLocation[]> {
    return this.withResolvedSymbol<UtuLocation[]>(
      document,
      position,
      [],
      (index, symbol) =>
        getOccurrencesForSymbol(index, symbol.key)
          .filter((occurrence) => includeDeclaration || !occurrence.isDefinition)
          .map((occurrence) => ({
            uri: index.uri,
            range: copyRange(occurrence.range),
          })),
    );
  }

  async getDocumentHighlights(
    document: UtuTextDocument,
    position: UtuPositionLike,
  ): Promise<UtuDocumentHighlight[]> {
    return this.withResolvedSymbol<UtuDocumentHighlight[]>(
      document,
      position,
      [],
      (index, symbol) =>
        getOccurrencesForSymbol(index, symbol.key)
          .map((occurrence) => ({
            range: copyRange(occurrence.range),
            kind: occurrence.isDefinition ? 'write' : 'read',
          })),
    );
  }

  async getCompletionItems(
    document: UtuTextDocument,
    position: UtuPositionLike,
  ): Promise<UtuCompletionItem[]> {
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    const namespaceMatch = linePrefix.match(/\b([a-z0-9_]+)\.$/i);

    if (namespaceMatch) {
      return (BUILTIN_METHODS[namespaceMatch[1]] ?? []).map((method) => ({
        label: method,
        kind: 'method',
        detail: `${namespaceMatch[1]}.${method}`,
      }));
    }

    const index = await this.getDocumentIndex(document);
    return [
      ...STATIC_COMPLETION_ITEMS,
      ...index.topLevelSymbols
        .filter((symbol) => symbol.kind !== 'test' && symbol.kind !== 'bench')
        .map((symbol) => ({
          label: symbol.name,
          kind: SYMBOL_METADATA[symbol.kind].completionKind,
          detail: symbol.signature,
        })),
    ];
  }

  async getDocumentSemanticTokens(document: UtuTextDocument): Promise<UtuSemanticToken[]> {
    const index = await this.getDocumentIndex(document);
    const seen = new Set<string>();
    const tokens: UtuSemanticToken[] = [];

    for (const occurrence of index.occurrences) {
      if (!occurrence.symbolKey) continue;

      const symbol = index.symbolByKey.get(occurrence.symbolKey);
      if (!symbol) continue;

      const tokenType = getSemanticTokenType(symbol);
      if (!tokenType) continue;

      const key = `${rangeKey(occurrence.range)}:${tokenType}`;
      if (seen.has(key)) continue;
      seen.add(key);

      tokens.push({
        range: copyRange(occurrence.range),
        type: tokenType,
        modifiers: occurrence.isDefinition ? ['declaration'] : [],
      });
    }

    return tokens;
  }

  async getDocumentSymbols(document: UtuTextDocument): Promise<UtuDocumentSymbol[]> {
    const index = await this.getDocumentIndex(document);

    return index.topLevelSymbols.map((symbol) => ({
      name: symbol.name,
      detail: symbol.detail,
      kind: SYMBOL_METADATA[symbol.kind].documentSymbolKind,
      range: copyRange(symbol.range),
      selectionRange: copyRange(symbol.range),
    }));
  }

  async getWorkspaceSymbols(
    query: string,
    documents: readonly UtuTextDocument[],
  ): Promise<UtuWorkspaceSymbol[]> {
    const indices = await Promise.all(documents.map((document) => this.getDocumentIndex(document)));
    const loweredQuery = query.trim().toLowerCase();

    return indices.flatMap((index) =>
      index.topLevelSymbols
        .filter((symbol) => !loweredQuery || symbol.name.toLowerCase().includes(loweredQuery))
        .map((symbol) => ({
          name: symbol.name,
          detail: symbol.detail,
          kind: SYMBOL_METADATA[symbol.kind].documentSymbolKind,
          location: {
            uri: symbol.uri,
            range: copyRange(symbol.range),
          },
        })),
    );
  }

  private async withResolvedSymbol<T>(
    document: UtuTextDocument,
    position: UtuPositionLike,
    fallback: T,
    action: (index: UtuDocumentIndex, symbol: UtuSymbol) => T | Promise<T>,
  ): Promise<T> {
    const index = await this.getDocumentIndex(document);
    const symbol = resolveSymbol(index, position);
    return symbol ? action(index, symbol) : fallback;
  }
}

export function findOccurrenceAtPosition(
  index: UtuDocumentIndex,
  position: UtuPositionLike,
): UtuOccurrence | undefined {
  return findBestRangeMatch(index.occurrences, position);
}

export function findSymbolAtPosition(
  index: UtuDocumentIndex,
  position: UtuPositionLike,
): UtuSymbol | undefined {
  const occurrence = findOccurrenceAtPosition(index, position);
  if (occurrence?.symbolKey) {
    return index.symbolByKey.get(occurrence.symbolKey);
  }

  return findBestRangeMatch(index.symbols, position);
}

export function getSemanticTokenType(symbol: UtuSymbol): string | undefined {
  return SYMBOL_METADATA[symbol.kind].semanticTokenType;
}

function buildDocumentIndex(
  document: UtuTextDocument,
  rootNode: Node,
  diagnostics: UtuDiagnostic[],
): UtuDocumentIndex {
  const uri = getDocumentUri(document);
  const symbols: UtuSymbol[] = [];
  const symbolByKey = new Map<string, UtuSymbol>();
  const occurrences: UtuOccurrence[] = [];
  const topLevelSymbols: UtuSymbol[] = [];
  const topLevelValueKeys = new Map<string, string>();
  const topLevelTypeKeys = new Map<string, string>();
  const fieldsByOwner = new Map<string, Map<string, string>>();
  const localScopes: Array<Map<string, string>> = [];
  let symbolCounter = 0;

  const rememberSymbolKey = (
    symbolsByName: Map<string, string>,
    { name, key }: Pick<UtuSymbol, 'name' | 'key'>,
  ) => {
    if (!symbolsByName.has(name)) {
      symbolsByName.set(name, key);
    }
  };

  const registerTopLevelValue = (symbol: UtuSymbol) => {
    rememberSymbolKey(topLevelValueKeys, symbol);
  };

  const registerTopLevelType = (symbol: UtuSymbol) => {
    rememberSymbolKey(topLevelTypeKeys, symbol);
  };

  const registerField = (ownerName: string, fieldSymbol: UtuSymbol) => {
    let ownerFields = fieldsByOwner.get(ownerName);
    if (!ownerFields) {
      ownerFields = new Map<string, string>();
      fieldsByOwner.set(ownerName, ownerFields);
    }

    if (!ownerFields.has(fieldSymbol.name)) {
      ownerFields.set(fieldSymbol.name, fieldSymbol.key);
    }
  };

  const createSymbol = (
    nameNode: Node,
    kind: UtuSymbolKind,
    options: {
      detail: string;
      signature: string;
      typeText?: string;
      returnTypeText?: string;
      containerName?: string;
      exported?: boolean;
      name?: string;
      topLevel?: boolean;
    },
  ): UtuSymbol => {
    const symbol: UtuSymbol = {
      key: `${uri}#${symbolCounter}`,
      name: options.name ?? nameNode.text,
      kind,
      uri,
      range: rangeFromNode(document, nameNode),
      detail: options.detail,
      signature: options.signature,
      typeText: options.typeText,
      returnTypeText: options.returnTypeText,
      containerName: options.containerName,
      exported: options.exported,
      topLevel: options.topLevel ?? false,
    };

    symbolCounter += 1;
    symbols.push(symbol);
    symbolByKey.set(symbol.key, symbol);

    if (symbol.topLevel) {
      topLevelSymbols.push(symbol);
    }

    addOccurrence({
      name: symbol.name,
      range: symbol.range,
      role: SYMBOL_METADATA[symbol.kind].role,
      symbolKey: symbol.key,
      isDefinition: true,
    });

    return symbol;
  };

  const addOccurrence = (occurrence: UtuOccurrence) => {
    occurrences.push(occurrence);
  };

  const addResolvedOccurrence = (
    nameNode: Node,
    role: UtuOccurrence['role'],
    symbolKey?: string,
  ) => {
    addOccurrence({
      name: nameNode.text,
      range: rangeFromNode(document, nameNode),
      role,
      symbolKey,
      isDefinition: false,
    });
  };

  const addBuiltinOccurrence = (range: UtuRange, key: string, label?: string) => {
    addOccurrence({
      name: label ?? key,
      range,
      role: 'builtin',
      builtinKey: key,
      isDefinition: false,
    });
  };

  const lookupSymbol = (key?: string) => (key ? symbolByKey.get(key) : undefined);

  const declareLocalSymbol = (
    nameNode: Node,
    kind: UtuSymbolKind,
    detail: string,
    typeNode?: Node,
    signature = typeNode ? `${nameNode.text}: ${typeNode.text}` : nameNode.text,
  ) => {
    if (typeNode) {
      walkTypeAnnotation(typeNode);
    }

    const symbol = createSymbol(nameNode, kind, {
      detail,
      signature,
      typeText: typeNode?.text,
    });

    declareLocal(symbol);
    return symbol;
  };

  const topLevelHandlers: Partial<Record<string, TopLevelHandler>> = {
    struct_decl: { collect: collectStructDeclaration, walk: walkStruct },
    type_decl: { collect: collectTypeDeclaration, walk: walkTypeDeclaration },
    fn_decl: {
      collect(item) {
        collectFunctionDeclaration(item, false);
      },
      walk: walkFunction,
    },
    global_decl: { collect: collectGlobalDeclaration, walk: walkGlobal },
    test_decl: { collect: collectTestDeclaration, walk: walkTest },
    bench_decl: { collect: collectBenchDeclaration, walk: walkBench },
    import_decl: { collect: collectImportDeclaration, walk: walkImport },
  };

  for (const item of rootNode.namedChildren) {
    collectTopLevelDeclarations(item);
  }

  for (const item of rootNode.namedChildren) {
    walkTopLevelItem(item);
  }

  occurrences.sort((left, right) => comparePositions(left.range.start, right.range.start));

  return {
    uri,
    version: document.version,
    diagnostics,
    symbols,
    symbolByKey,
    occurrences,
    topLevelSymbols,
  };

  function collectTopLevelDeclarations(item: Node): void {
    if (item.type === 'export_decl') {
      const fnDecl = findNamedChild(item, 'fn_decl');
      if (fnDecl) collectFunctionDeclaration(fnDecl, true);
      return;
    }

    topLevelHandlers[item.type]?.collect(item);
  }

  function collectFieldSymbols(ownerSymbol: UtuSymbol, fieldList: Node | undefined): void {
    for (const fieldNode of findNamedChildren(fieldList, 'field')) {
      const fieldNameNode = findNamedChild(fieldNode, 'identifier');
      const fieldTypeNode = fieldNode.namedChildren.at(-1);
      if (!fieldNameNode || !fieldTypeNode) continue;

      const fieldSymbol = createSymbol(fieldNameNode, 'field', {
        detail: `field of ${ownerSymbol.name}`,
        signature: `${fieldNameNode.text}: ${fieldTypeNode.text}`,
        typeText: fieldTypeNode.text,
        containerName: ownerSymbol.name,
      });

      registerField(ownerSymbol.name, fieldSymbol);
    }
  }

  function collectStructDeclaration(structDecl: Node): void {
    const nameNode = findNamedChild(structDecl, 'type_ident');
    if (!nameNode) return;

    const structSymbol = createSymbol(nameNode, 'struct', {
      detail: 'struct',
      signature: `struct ${nameNode.text}`,
      topLevel: true,
    });

    registerTopLevelType(structSymbol);
    collectFieldSymbols(structSymbol, findNamedChild(structDecl, 'field_list'));
  }

  function collectTypeDeclaration(typeDecl: Node): void {
    const nameNode = findNamedChild(typeDecl, 'type_ident');
    if (!nameNode) return;

    const typeSymbol = createSymbol(nameNode, 'sumType', {
      detail: 'sum type',
      signature: `type ${nameNode.text}`,
      topLevel: true,
    });

    registerTopLevelType(typeSymbol);

    for (const variantNode of findNamedChildren(findNamedChild(typeDecl, 'variant_list'), 'variant')) {
      const variantNameNode = findNamedChild(variantNode, 'type_ident');
      if (!variantNameNode) continue;

      const variantSymbol = createSymbol(variantNameNode, 'variant', {
        detail: `variant of ${typeSymbol.name}`,
        signature: `variant ${variantNameNode.text} of ${typeSymbol.name}`,
        containerName: typeSymbol.name,
        topLevel: true,
      });

      registerTopLevelType(variantSymbol);
      collectFieldSymbols(variantSymbol, findNamedChild(variantNode, 'field_list'));
    }
  }

  function collectFunctionDeclaration(fnDecl: Node, exported: boolean): void {
    const nameNode = findNamedChild(fnDecl, 'identifier');
    if (!nameNode) return;

    const paramList = findNamedChild(fnDecl, 'param_list');
    const returnType = findNamedChild(fnDecl, 'return_type');
    const signature = `${exported ? 'export ' : ''}fn ${nameNode.text}(${paramList?.text ?? ''})${returnType ? ` ${returnType.text}` : ''}`;
    const functionSymbol = createSymbol(nameNode, 'function', {
      detail: exported ? 'exported function' : 'function',
      exported,
      signature,
      returnTypeText: returnType?.text,
      topLevel: true,
    });

    registerTopLevelValue(functionSymbol);
  }

  function collectGlobalDeclaration(globalDecl: Node): void {
    const nameNode = findNamedChild(globalDecl, 'identifier');
    const typeNode = globalDecl.namedChildren[1];
    if (!nameNode || !typeNode) return;

    const globalSymbol = createSymbol(nameNode, 'global', {
      detail: 'global binding',
      signature: `let ${nameNode.text}: ${typeNode.text}`,
      typeText: typeNode.text,
      topLevel: true,
    });

    registerTopLevelValue(globalSymbol);
  }

  function collectTestDeclaration(testDecl: Node): void {
    const nameNode = findNamedChild(testDecl, 'string_lit');
    if (!nameNode) return;

    createSymbol(nameNode, 'test', {
      detail: 'test case',
      name: stringLiteralName(nameNode),
      signature: `test ${nameNode.text}`,
      topLevel: true,
    });
  }

  function collectBenchDeclaration(benchDecl: Node): void {
    const nameNode = findNamedChild(benchDecl, 'string_lit');
    const captureNode = findNamedChild(findNamedChild(benchDecl, 'bench_capture'), 'identifier');
    if (!nameNode) return;

    createSymbol(nameNode, 'bench', {
      detail: 'benchmark',
      name: stringLiteralName(nameNode),
      signature: `bench ${nameNode.text}${captureNode ? ` |${captureNode.text}|` : ''}`,
      topLevel: true,
    });
  }

  function collectImportDeclaration(importDecl: Node): void {
    const moduleNode = findNamedChild(importDecl, 'string_lit');
    const nameNode = findNamedChild(importDecl, 'identifier');
    if (!moduleNode || !nameNode) return;

    const importParamList = findNamedChild(importDecl, 'import_param_list');
    const returnType = findNamedChild(importDecl, 'return_type');

    if (importParamList) {
      const importSymbol = createSymbol(nameNode, 'importFunction', {
        detail: `import from ${moduleNode.text}`,
        signature: `import extern ${moduleNode.text} ${nameNode.text}(${importParamList.text})${returnType ? ` ${returnType.text}` : ''}`,
        returnTypeText: returnType?.text,
        topLevel: true,
      });

      registerTopLevelValue(importSymbol);
      return;
    }

    const typeNode = importDecl.namedChildren.at(-1);
    const importSymbol = createSymbol(nameNode, 'importValue', {
      detail: `import from ${moduleNode.text}`,
      signature: `import extern ${moduleNode.text} ${nameNode.text}: ${typeNode?.text ?? 'unknown'}`,
      typeText: typeNode?.text,
      topLevel: true,
    });

    registerTopLevelValue(importSymbol);
  }

  function walkTopLevelItem(item: Node): void {
    if (item.type === 'export_decl') {
      const fnDecl = findNamedChild(item, 'fn_decl');
      if (fnDecl) walkFunction(fnDecl);
      return;
    }

    topLevelHandlers[item.type]?.walk(item);
  }

  function walkFieldTypeAnnotations(fieldList: Node | undefined): void {
    for (const fieldNode of findNamedChildren(fieldList, 'field')) {
      const typeNode = fieldNode.namedChildren.at(-1);
      if (typeNode) {
        walkTypeAnnotation(typeNode);
      }
    }
  }

  function walkStruct(structDecl: Node): void {
    walkFieldTypeAnnotations(findNamedChild(structDecl, 'field_list'));
  }

  function walkTypeDeclaration(typeDecl: Node): void {
    for (const variantNode of findNamedChildren(findNamedChild(typeDecl, 'variant_list'), 'variant')) {
      walkFieldTypeAnnotations(findNamedChild(variantNode, 'field_list'));
    }
  }

  function walkFunction(fnDecl: Node): void {
    withScope(localScopes, () => {
      for (const paramNode of findNamedChildren(findNamedChild(fnDecl, 'param_list'), 'param')) {
        const nameNode = findNamedChild(paramNode, 'identifier');
        const typeNode = paramNode.namedChildren.at(-1);
        if (!nameNode || !typeNode) continue;

        declareLocalSymbol(nameNode, 'parameter', 'parameter', typeNode);
      }

      const returnType = findNamedChild(fnDecl, 'return_type');
      if (returnType) walkTypeAnnotation(returnType);

      const block = findNamedChild(fnDecl, 'block');
      if (block) walkBlock(block);
    });
  }

  function walkGlobal(globalDecl: Node): void {
    const typeNode = globalDecl.namedChildren[1];
    const valueNode = globalDecl.namedChildren[2];
    if (typeNode) walkTypeAnnotation(typeNode);
    if (valueNode) walkExpression(valueNode);
  }

  function walkImport(importDecl: Node): void {
    const importParamList = findNamedChild(importDecl, 'import_param_list');
    if (importParamList) {
      for (const param of importParamList.namedChildren) {
        if (param.type === 'param') {
          const typeNode = param.namedChildren.at(-1);
          if (typeNode) walkTypeAnnotation(typeNode);
        } else {
          walkTypeAnnotation(param);
        }
      }
    }

    const returnType = findNamedChild(importDecl, 'return_type');
    if (returnType) walkTypeAnnotation(returnType);
  }

  function walkTest(testDecl: Node): void {
    const block = findNamedChild(testDecl, 'block');
    if (block) walkBlock(block);
  }

  function walkBench(benchDecl: Node): void {
    const setupDecl = findNamedChild(benchDecl, 'setup_decl');
    if (!setupDecl) return;

    withScope(localScopes, () => {
      const captureNode = findNamedChild(findNamedChild(benchDecl, 'bench_capture'), 'identifier');
      if (captureNode) {
        declareLocalSymbol(captureNode, 'capture', 'benchmark iteration capture');
      }

      for (const child of setupDecl.namedChildren) {
        if (child.type === 'measure_decl') {
          const block = findNamedChild(child, 'block');
          if (block) walkBlock(block);
          continue;
        }

        walkExpression(child);
      }
    });
  }

  function walkBlock(block: Node): void {
    withScope(localScopes, () => {
      for (const statement of block.namedChildren) {
        walkExpression(statement);
      }
    });
  }

  function walkExpression(node: Node): void {
    if (RECURSIVE_EXPRESSION_TYPES.has(node.type)) {
      walkNamedChildren(node, walkExpression);
      return;
    }

    switch (node.type) {
      case 'identifier':
        addResolvedOccurrence(node, 'value', resolveValueKey(node.text));
        return;
      case 'struct_init':
        walkStructInit(node);
        return;
      case 'field_expr':
        walkFieldExpression(node);
        return;
      case 'call_expr':
        walkCallExpression(node);
        return;
      case 'namespace_call_expr':
        addBuiltinOccurrence(rangeForBuiltinNode(document, node), builtinKeyFromNamespaceCall(node), node.text);
        return;
      case 'array_init':
        walkArrayInit(node);
        return;
      case 'ref_null_expr':
        walkRefNullExpression(node);
        return;
      case 'pipe_expr':
        walkPipeExpression(node);
        return;
      case 'bind_expr':
        walkBindExpression(node);
        return;
      case 'block_expr': {
        const block = findNamedChild(node, 'block');
        if (block) walkBlock(block);
        return;
      }
      case 'block':
        walkBlock(node);
        return;
      case 'match_expr':
        walkMatchExpression(node);
        return;
      case 'alt_expr':
        walkAltExpression(node);
        return;
      case 'for_expr':
        walkForExpression(node);
        return;
      case 'break_expr':
        for (const child of node.namedChildren) {
          if (child.type === 'identifier') {
            addResolvedOccurrence(child, 'value', resolveValueKey(child.text));
          } else {
            walkExpression(child);
          }
        }
        return;
      case 'literal':
        return;
      default:
        walkNamedChildren(node, walkExpression);
    }
  }

  function walkStructInit(node: Node): void {
    const typeNode = findNamedChild(node, 'type_ident');
    if (!typeNode) return;

    addResolvedOccurrence(typeNode, 'type', resolveTypeKey(typeNode.text));
    const ownerType = typeNode.text;

    for (const fieldInit of findNamedChildren(node, 'field_init')) {
      const fieldNameNode = findNamedChild(fieldInit, 'identifier');
      const valueNode = fieldInit.namedChildren.at(-1);

      if (fieldNameNode) {
        addResolvedOccurrence(fieldNameNode, 'field', resolveFieldKey(ownerType, fieldNameNode.text));
      }

      if (valueNode) {
        walkExpression(valueNode);
      }
    }
  }

  function walkFieldExpression(node: Node): void {
    const [baseNode, fieldNameNode] = node.namedChildren;
    if (!baseNode || !fieldNameNode) return;

    walkExpression(baseNode);
    const baseType = inferExpressionType(baseNode);
    addResolvedOccurrence(
      fieldNameNode,
      'field',
      baseType ? resolveFieldKey(baseType, fieldNameNode.text) : undefined,
    );
  }

  function walkCallExpression(node: Node): void {
    const [calleeNode, argListNode] = node.namedChildren;
    if (!calleeNode) return;

    walkExpression(calleeNode);

    if (argListNode?.type === 'arg_list') {
      for (const arg of argListNode.namedChildren) {
        walkExpression(arg);
      }
    }
  }

  function walkArrayInit(node: Node): void {
    const typeNode = node.namedChildren[0];
    const methodNode = findNamedChild(node, 'identifier');
    const argListNode = findNamedChild(node, 'arg_list');

    if (typeNode) walkTypeAnnotation(typeNode);

    if (methodNode) {
      addBuiltinOccurrence(
        rangeFromOffsets(document, node.startIndex, methodNode.endIndex),
        `array.${methodNode.text}`,
        `array.${methodNode.text}`,
      );
    }

    if (argListNode) {
      for (const arg of argListNode.namedChildren) {
        walkExpression(arg);
      }
    }
  }

  function walkRefNullExpression(node: Node): void {
    const typeNode = findNamedChild(node, 'type_ident');

    addBuiltinOccurrence(
      rangeFromOffsets(document, node.startIndex, node.startIndex + 'ref.null'.length),
      'ref.null',
    );

    if (typeNode) {
      addResolvedOccurrence(typeNode, 'type', resolveTypeKey(typeNode.text));
    }
  }

  function walkPipeExpression(node: Node): void {
    const [valueNode, targetNode] = node.namedChildren;
    if (valueNode) walkExpression(valueNode);
    if (targetNode) walkPipeTarget(targetNode);
  }

  function walkPipeTarget(node: Node): void {
    const namedChildren = node.namedChildren;
    if (namedChildren.length === 0) return;

    const first = namedChildren[0];
    const second = namedChildren[1];

    if (first.type === 'identifier' && second?.type === 'identifier' && isBuiltinNamespace(first.text)) {
      const builtinKey = `${first.text}.${second.text}`;
      addBuiltinOccurrence(
        rangeFromOffsets(document, node.startIndex, second.endIndex),
        builtinKey,
        builtinKey,
      );
    } else if (first.type === 'identifier') {
      addResolvedOccurrence(first, 'value', resolveValueKey(first.text));
    }

    const pipeArgs = findNamedChild(node, 'pipe_args');
    if (pipeArgs) {
      for (const pipeArg of pipeArgs.namedChildren) {
        const valueNode = pipeArg.namedChildren.at(0);
        if (valueNode) walkExpression(valueNode);
      }
    }
  }

  function walkBindExpression(node: Node): void {
    const namedChildren = node.namedChildren;
    const valueNode = namedChildren.at(-1);

    if (valueNode) {
      walkExpression(valueNode);
    }

    for (const bindTarget of namedChildren.slice(0, -1)) {
      if (bindTarget.type !== 'bind_target') continue;
      const nameNode = findNamedChild(bindTarget, 'identifier');
      const typeNode = bindTarget.namedChildren.at(-1);
      if (!nameNode || !typeNode) continue;

      declareLocalSymbol(nameNode, 'binding', 'local binding', typeNode);
    }
  }

  function walkMatchExpression(node: Node): void {
    const [subjectNode, ...arms] = node.namedChildren;
    if (subjectNode) walkExpression(subjectNode);

    for (const armNode of arms) {
      const expressionNode = armNode.namedChildren.at(-1);
      if (expressionNode) {
        walkExpression(expressionNode);
      }
    }
  }

  function walkAltExpression(node: Node): void {
    const [subjectNode, ...arms] = node.namedChildren;
    if (subjectNode) walkExpression(subjectNode);

    for (const armNode of arms) {
      walkAltArm(armNode);
    }
  }

  function walkAltArm(node: Node): void {
    withScope(localScopes, () => {
      const patternNode = node.namedChildren[0]?.type === 'identifier' ? node.namedChildren[0] : undefined;
      const typeNode = findNamedChild(node, 'type_ident');
      const expressionNode = node.namedChildren.at(-1);

      if (typeNode) {
        addResolvedOccurrence(typeNode, 'type', resolveTypeKey(typeNode.text));
      }

      if (patternNode) {
        declareLocalSymbol(
          patternNode,
          'matchBinding',
          'alt binding',
          typeNode,
          typeNode ? `${patternNode.text}: ${typeNode.text}` : patternNode.text,
        );
      }

      if (expressionNode) {
        walkExpression(expressionNode);
      }
    });
  }

  function walkForExpression(node: Node): void {
    const forSources = findNamedChild(node, 'for_sources');
    if (forSources) {
      for (const sourceNode of forSources.namedChildren) {
        for (const child of sourceNode.namedChildren) {
          walkExpression(child);
        }
      }
    }

    withScope(localScopes, () => {
      const captureNode = findNamedChild(node, 'capture');
      if (captureNode) {
        for (const captureIdentifier of findNamedChildren(captureNode, 'identifier')) {
          declareLocalSymbol(captureIdentifier, 'capture', 'loop capture');
        }
      }

      const blockNode = findNamedChild(node, 'block');
      if (blockNode) {
        for (const statement of blockNode.namedChildren) {
          walkExpression(statement);
        }
      }
    });
  }

  function walkTypeAnnotation(node: Node): void {
    if (node.type === 'type_ident') {
      addResolvedOccurrence(node, 'type', resolveTypeKey(node.text));
      return;
    }

    for (const child of node.namedChildren) {
      walkTypeAnnotation(child);
    }
  }

  function declareLocal(symbol: UtuSymbol): void {
    const scope = localScopes.at(-1);
    if (scope) {
      scope.set(symbol.name, symbol.key);
    }
  }

  function resolveValueKey(name: string): string | undefined {
    for (let index = localScopes.length - 1; index >= 0; index -= 1) {
      const key = localScopes[index].get(name);
      if (key) return key;
    }

    return topLevelValueKeys.get(name);
  }

  function resolveTypeKey(name: string): string | undefined {
    return topLevelTypeKeys.get(name);
  }

  function resolveFieldKey(ownerTypeText: string, fieldName: string): string | undefined {
    for (const candidateType of expandTypeCandidates(ownerTypeText)) {
      const fieldKey = fieldsByOwner.get(candidateType)?.get(fieldName);
      if (fieldKey) return fieldKey;
    }

    return undefined;
  }

  function inferFirstChildType(node: Node): string | undefined {
    return node.namedChildren[0] ? inferExpressionType(node.namedChildren[0]) : undefined;
  }

  function inferExpressionType(node: Node): string | undefined {
    switch (node.type) {
      case 'identifier': {
        const symbol = lookupSymbol(resolveValueKey(node.text));
        return symbol?.typeText ?? symbol?.returnTypeText;
      }
      case 'field_expr': {
        const [baseNode, fieldNode] = node.namedChildren;
        if (!baseNode || !fieldNode) return undefined;
        const baseType = inferExpressionType(baseNode);
        if (!baseType) return undefined;
        const fieldSymbol = lookupSymbol(resolveFieldKey(baseType, fieldNode.text));
        return fieldSymbol?.typeText;
      }
      case 'call_expr': {
        const calleeNode = node.namedChildren[0];
        if (!calleeNode) return undefined;

        if (calleeNode.type === 'identifier') {
          const symbol = lookupSymbol(resolveValueKey(calleeNode.text));
          return symbol?.returnTypeText ?? symbol?.typeText;
        }

        if (calleeNode.type === 'namespace_call_expr') {
          return getBuiltinReturnType(builtinKeyFromNamespaceCall(calleeNode));
        }

        return undefined;
      }
      case 'namespace_call_expr':
        return getBuiltinReturnType(builtinKeyFromNamespaceCall(node));
      case 'pipe_expr': {
        const targetNode = node.namedChildren.at(-1);
        return targetNode ? inferPipeTargetType(targetNode) : undefined;
      }
      case 'pipe_target':
        return inferPipeTargetType(node);
      case 'struct_init': {
        const typeNode = findNamedChild(node, 'type_ident');
        return typeNode?.text;
      }
      case 'array_init': {
        const elementTypeNode = node.namedChildren[0];
        return elementTypeNode ? `array[${elementTypeNode.text}]` : 'array[T]';
      }
      case 'ref_null_expr': {
        const typeNode = findNamedChild(node, 'type_ident');
        return typeNode ? `${typeNode.text} # null` : undefined;
      }
      case 'paren_expr':
      case 'block_expr':
        return inferFirstChildType(node);
      case 'literal':
        return inferLiteralType(node);
      case 'binary_expr':
      case 'else_expr':
      case 'tuple_expr':
      case 'index_expr':
      case 'assign_expr':
      case 'unary_expr':
        return inferFirstChildType(node);
      default:
        return undefined;
    }
  }

  function inferPipeTargetType(node: Node): string | undefined {
    const namedChildren = node.namedChildren;
    if (namedChildren.length === 0) return undefined;

    const first = namedChildren[0];
    const second = namedChildren[1];

    if (first.type === 'identifier' && second?.type === 'identifier' && isBuiltinNamespace(first.text)) {
      return getBuiltinReturnType(`${first.text}.${second.text}`);
    }

    if (first.type === 'identifier') {
      const symbol = lookupSymbol(resolveValueKey(first.text));
      return symbol?.returnTypeText ?? symbol?.typeText;
    }

    return undefined;
  }
}

function resolveSymbol(
  index: UtuDocumentIndex,
  position: UtuPositionLike,
): UtuSymbol | undefined {
  const occurrence = findOccurrenceAtPosition(index, position);
  if (occurrence?.builtinKey) {
    return undefined;
  }

  if (occurrence?.symbolKey) {
    return index.symbolByKey.get(occurrence.symbolKey);
  }

  return findSymbolAtPosition(index, position);
}

function getFallbackHover(word: string): UtuMarkupContent | undefined {
  return getCoreTypeHover(word)
    ?? getLiteralHover(word)
    ?? getKeywordHover(word)
    ?? getBuiltinNamespaceHover(word);
}

function getOccurrencesForSymbol(
  index: UtuDocumentIndex,
  symbolKey: string,
): UtuOccurrence[] {
  return index.occurrences.filter((occurrence) => occurrence.symbolKey === symbolKey);
}

function findBestRangeMatch<T extends { range: UtuRange }>(
  values: readonly T[],
  position: UtuPositionLike,
): T | undefined {
  let bestMatch: T | undefined;

  for (const value of values) {
    if (!rangeContains(value.range, position)) continue;
    if (!bestMatch || rangeLength(value.range) < rangeLength(bestMatch.range)) {
      bestMatch = value;
    }
  }

  return bestMatch;
}

function symbolToMarkup(symbol: UtuSymbol): UtuMarkupContent {
  const sections = [`\`\`\`utu\n${symbol.signature}\n\`\`\``, symbol.detail];

  if (symbol.typeText) {
    sections.push(`Type: \`${symbol.typeText}\``);
  }

  if (symbol.returnTypeText) {
    sections.push(`Returns: \`${symbol.returnTypeText}\``);
  }

  if (symbol.containerName) {
    sections.push(`Container: \`${symbol.containerName}\``);
  }

  return {
    kind: 'markdown',
    value: sections.join('\n\n'),
  };
}

function stringLiteralName(node: Node): string {
  return node.text.startsWith('"') && node.text.endsWith('"')
    ? node.text.slice(1, -1)
    : node.text;
}

function getWordAtPosition(
  document: UtuTextDocument,
  position: UtuPositionLike,
): { text: string; range: UtuRange } | undefined {
  if (position.line < 0 || position.line >= document.lineCount) {
    return undefined;
  }

  const lineText = document.lineAt(position.line).text;
  if (!lineText) return undefined;

  const clampedCharacter = clamp(position.character, 0, lineText.length);
  let start = clampedCharacter;
  let end = clampedCharacter;

  if (start > 0 && !isWordChar(lineText[start] ?? '') && isWordChar(lineText[start - 1] ?? '')) {
    start -= 1;
    end = start + 1;
  }

  while (start > 0 && isWordChar(lineText[start - 1] ?? '')) {
    start -= 1;
  }

  while (end < lineText.length && isWordChar(lineText[end] ?? '')) {
    end += 1;
  }

  if (start === end) return undefined;

  const word = lineText.slice(start, end);
  if (!WORD_PATTERN.test(word)) {
    return undefined;
  }

  return {
    text: word,
    range: {
      start: {
        line: position.line,
        character: start,
      },
      end: {
        line: position.line,
        character: end,
      },
    },
  };
}

function isWordChar(value: string): boolean {
  return WORD_CHAR_PATTERN.test(value);
}

function findNamedChild(node: Node | undefined, type: string): Node | undefined {
  return node?.namedChildren.find((child) => child.type === type);
}

function findNamedChildren(node: Node | undefined, type: string): Node[] {
  return node ? node.namedChildren.filter((child) => child.type === type) : [];
}

function walkNamedChildren(node: Node, visit: (child: Node) => void): void {
  for (const child of node.namedChildren) {
    visit(child);
  }
}

function expandTypeCandidates(typeText: string): string[] {
  const normalized = normalizeTypeText(typeText);
  return normalized ? [normalized] : [];
}

function normalizeTypeText(typeText: string): string {
  let value = typeText.trim();

  while (value.startsWith('(') && value.endsWith(')')) {
    value = value.slice(1, -1).trim();
  }

  value = value.replace(/\s*#\s*null\s*$/, '').trim();
  return value;
}

function builtinKeyFromNamespaceCall(node: Node): string {
  const methodNode = findNamedChild(node, 'identifier');
  const namespace = node.children[0]?.text ?? 'builtin';
  return `${namespace}.${methodNode?.text ?? 'unknown'}`;
}

function rangeForBuiltinNode(document: UtuTextDocument, node: Node): UtuRange {
  const methodNode = findNamedChild(node, 'identifier');

  if (!methodNode) {
    return rangeFromNode(document, node);
  }

  return rangeFromOffsets(document, node.startIndex, methodNode.endIndex);
}

function inferLiteralType(node: Node): string | undefined {
  if (node.text === 'true' || node.text === 'false') {
    return 'bool';
  }

  if (node.text === 'null') {
    return 'null';
  }

  const literalChild = node.namedChildren[0];
  if (!literalChild) return undefined;

  switch (literalChild.type) {
    case 'int_lit':
      return 'i64';
    case 'float_lit':
      return 'f64';
    case 'string_lit':
    case 'multiline_string_lit':
      return 'str';
    default:
      return undefined;
  }
}

function withScope<T>(scopes: Array<Map<string, string>>, action: () => T): T {
  scopes.push(new Map<string, string>());
  try {
    return action();
  } finally {
    scopes.pop();
  }
}

function cloneDiagnostic(diagnostic: UtuDiagnostic): UtuDiagnostic {
  return {
    ...diagnostic,
    range: copyRange(diagnostic.range),
  };
}

const WORD_CHAR_PATTERN = /[A-Za-z0-9_]/;
const WORD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
