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
import { rangeFromNode, rangeFromOffsets, UtuParserService } from './parser';
import {
  copyRange,
  getDocumentUri,
  rangeContains,
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

const SEMANTIC_TOKEN_TYPES: Partial<Record<UtuSymbolKind, string>> = {
  struct: 'type',
  sumType: 'type',
  variant: 'enumMember',
  function: 'function',
  importFunction: 'function',
  parameter: 'parameter',
  field: 'property',
  importValue: 'variable',
  global: 'variable',
  binding: 'variable',
  capture: 'variable',
  matchBinding: 'variable',
};

const COMPLETION_KINDS: Record<UtuSymbolKind, UtuCompletionItem['kind']> = {
  function: 'function',
  importFunction: 'function',
  importValue: 'variable',
  global: 'variable',
  test: 'text',
  bench: 'text',
  parameter: 'text',
  binding: 'text',
  capture: 'text',
  matchBinding: 'text',
  struct: 'class',
  sumType: 'class',
  variant: 'enumMember',
  field: 'text',
};

const DOCUMENT_SYMBOL_KINDS: Record<UtuSymbolKind, UtuDocumentSymbolKind> = {
  function: 'function',
  importFunction: 'function',
  importValue: 'variable',
  global: 'variable',
  test: 'method',
  bench: 'event',
  parameter: 'object',
  binding: 'object',
  capture: 'object',
  matchBinding: 'object',
  struct: 'struct',
  sumType: 'enum',
  variant: 'enumMember',
  field: 'object',
};

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

    const diagnostics = await this.parserService.getDiagnostics(document);
    const parsedTree = await this.parserService.parseSource(document.getText());

    try {
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

    const fallbackHover = getCoreTypeHover(word.text)
      ?? getLiteralHover(word.text)
      ?? getKeywordHover(word.text)
      ?? getBuiltinNamespaceHover(word.text);
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
    const index = await this.getDocumentIndex(document);
    const symbol = resolveSymbol(index, position);
    if (!symbol) return undefined;

    return {
      uri: symbol.uri,
      range: copyRange(symbol.range),
    };
  }

  async getReferences(
    document: UtuTextDocument,
    position: UtuPositionLike,
    includeDeclaration: boolean,
  ): Promise<UtuLocation[]> {
    const index = await this.getDocumentIndex(document);
    const symbol = resolveSymbol(index, position);
    if (!symbol) return [];

    return index.occurrences
      .filter((occurrence) => occurrence.symbolKey === symbol.key)
      .filter((occurrence) => includeDeclaration || !occurrence.isDefinition)
      .map((occurrence) => ({
        uri: index.uri,
        range: copyRange(occurrence.range),
      }));
  }

  async getDocumentHighlights(
    document: UtuTextDocument,
    position: UtuPositionLike,
  ): Promise<UtuDocumentHighlight[]> {
    const index = await this.getDocumentIndex(document);
    const symbol = resolveSymbol(index, position);
    if (!symbol) return [];

    return index.occurrences
      .filter((occurrence) => occurrence.symbolKey === symbol.key)
      .map((occurrence) => ({
        range: copyRange(occurrence.range),
        kind: occurrence.isDefinition ? 'write' : 'read',
      }));
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
    const items: UtuCompletionItem[] = [];

    for (const keyword of KEYWORD_COMPLETIONS) {
      items.push({
        label: keyword,
        kind: 'keyword',
      });
    }

    for (const builtinNamespace of Object.keys(BUILTIN_METHODS)) {
      items.push({
        label: builtinNamespace,
        kind: 'module',
      });
    }

    for (const coreType of CORE_TYPE_COMPLETIONS) {
      items.push({
        label: coreType,
        kind: 'class',
      });
    }

    for (const literal of LITERAL_COMPLETIONS) {
      items.push({
        label: literal,
        kind: 'keyword',
      });
    }

    for (const symbol of index.topLevelSymbols) {
      if (symbol.kind === 'test' || symbol.kind === 'bench') continue;
      items.push({
        label: symbol.name,
        kind: COMPLETION_KINDS[symbol.kind],
        detail: symbol.signature,
      });
    }

    return items;
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

      const key = `${occurrence.range.start.line}:${occurrence.range.start.character}:${occurrence.range.end.line}:${occurrence.range.end.character}:${tokenType}`;
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
      kind: DOCUMENT_SYMBOL_KINDS[symbol.kind],
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
          kind: DOCUMENT_SYMBOL_KINDS[symbol.kind],
          location: {
            uri: symbol.uri,
            range: copyRange(symbol.range),
          },
        })),
    );
  }
}

export function findOccurrenceAtPosition(
  index: UtuDocumentIndex,
  position: UtuPositionLike,
): UtuOccurrence | undefined {
  let bestMatch: UtuOccurrence | undefined;

  for (const occurrence of index.occurrences) {
    if (!rangeContains(occurrence.range, position)) continue;
    if (!bestMatch || rangeLength(occurrence.range) < rangeLength(bestMatch.range)) {
      bestMatch = occurrence;
    }
  }

  return bestMatch;
}

export function findSymbolAtPosition(
  index: UtuDocumentIndex,
  position: UtuPositionLike,
): UtuSymbol | undefined {
  const occurrence = findOccurrenceAtPosition(index, position);
  if (occurrence?.symbolKey) {
    return index.symbolByKey.get(occurrence.symbolKey);
  }

  return index.symbols.find((symbol) => rangeContains(symbol.range, position));
}

export function getSemanticTokenType(symbol: UtuSymbol): string | undefined {
  return SEMANTIC_TOKEN_TYPES[symbol.kind];
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

  const registerTopLevelValue = (symbol: UtuSymbol) => {
    if (!topLevelValueKeys.has(symbol.name)) {
      topLevelValueKeys.set(symbol.name, symbol.key);
    }
  };

  const registerTopLevelType = (symbol: UtuSymbol) => {
    if (!topLevelTypeKeys.has(symbol.name)) {
      topLevelTypeKeys.set(symbol.name, symbol.key);
    }
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
      role: symbolRole(symbol.kind),
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

  for (const item of rootNode.namedChildren) {
    collectTopLevelDeclarations(item);
  }

  for (const item of rootNode.namedChildren) {
    walkTopLevelItem(item);
  }

  occurrences.sort((left, right) => {
    if (left.range.start.line !== right.range.start.line) {
      return left.range.start.line - right.range.start.line;
    }

    return left.range.start.character - right.range.start.character;
  });

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

    switch (item.type) {
      case 'struct_decl':
        collectStructDeclaration(item);
        break;
      case 'type_decl':
        collectTypeDeclaration(item);
        break;
      case 'fn_decl':
        collectFunctionDeclaration(item, false);
        break;
      case 'global_decl':
        collectGlobalDeclaration(item);
        break;
      case 'test_decl':
        collectTestDeclaration(item);
        break;
      case 'bench_decl':
        collectBenchDeclaration(item);
        break;
      case 'import_decl':
        collectImportDeclaration(item);
        break;
      default:
        break;
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

    for (const fieldNode of findNamedChildren(findNamedChild(structDecl, 'field_list'), 'field')) {
      const fieldNameNode = findNamedChild(fieldNode, 'identifier');
      const fieldTypeNode = fieldNode.namedChildren.at(-1);
      if (!fieldNameNode || !fieldTypeNode) continue;

      const fieldSymbol = createSymbol(fieldNameNode, 'field', {
        detail: `field of ${structSymbol.name}`,
        signature: `${fieldNameNode.text}: ${fieldTypeNode.text}`,
        typeText: fieldTypeNode.text,
        containerName: structSymbol.name,
      });

      registerField(structSymbol.name, fieldSymbol);
    }
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

      for (const fieldNode of findNamedChildren(findNamedChild(variantNode, 'field_list'), 'field')) {
        const fieldNameNode = findNamedChild(fieldNode, 'identifier');
        const fieldTypeNode = fieldNode.namedChildren.at(-1);
        if (!fieldNameNode || !fieldTypeNode) continue;

        const fieldSymbol = createSymbol(fieldNameNode, 'field', {
          detail: `field of ${variantSymbol.name}`,
          signature: `${fieldNameNode.text}: ${fieldTypeNode.text}`,
          typeText: fieldTypeNode.text,
          containerName: variantSymbol.name,
        });

        registerField(variantSymbol.name, fieldSymbol);
      }
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

    switch (item.type) {
      case 'struct_decl':
        walkStruct(item);
        break;
      case 'type_decl':
        walkTypeDeclaration(item);
        break;
      case 'fn_decl':
        walkFunction(item);
        break;
      case 'global_decl':
        walkGlobal(item);
        break;
      case 'test_decl':
        walkTest(item);
        break;
      case 'bench_decl':
        walkBench(item);
        break;
      case 'import_decl':
        walkImport(item);
        break;
      default:
        break;
    }
  }

  function walkStruct(structDecl: Node): void {
    for (const fieldNode of findNamedChildren(findNamedChild(structDecl, 'field_list'), 'field')) {
      const typeNode = fieldNode.namedChildren.at(-1);
      if (typeNode) walkTypeAnnotation(typeNode);
    }
  }

  function walkTypeDeclaration(typeDecl: Node): void {
    for (const variantNode of findNamedChildren(findNamedChild(typeDecl, 'variant_list'), 'variant')) {
      for (const fieldNode of findNamedChildren(findNamedChild(variantNode, 'field_list'), 'field')) {
        const typeNode = fieldNode.namedChildren.at(-1);
        if (typeNode) walkTypeAnnotation(typeNode);
      }
    }
  }

  function walkFunction(fnDecl: Node): void {
    pushScope(localScopes);

    for (const paramNode of findNamedChildren(findNamedChild(fnDecl, 'param_list'), 'param')) {
      const nameNode = findNamedChild(paramNode, 'identifier');
      const typeNode = paramNode.namedChildren.at(-1);
      if (!nameNode || !typeNode) continue;

      walkTypeAnnotation(typeNode);
      const symbol = createSymbol(nameNode, 'parameter', {
        detail: 'parameter',
        signature: `${nameNode.text}: ${typeNode.text}`,
        typeText: typeNode.text,
      });

      declareLocal(symbol);
    }

    const returnType = findNamedChild(fnDecl, 'return_type');
    if (returnType) walkTypeAnnotation(returnType);

    const block = findNamedChild(fnDecl, 'block');
    if (block) walkBlock(block);

    popScope(localScopes);
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

    pushScope(localScopes);

    const captureNode = findNamedChild(findNamedChild(benchDecl, 'bench_capture'), 'identifier');
    if (captureNode) {
      const symbol = createSymbol(captureNode, 'capture', {
        detail: 'benchmark iteration capture',
        signature: captureNode.text,
      });
      declareLocal(symbol);
    }

    for (const child of setupDecl.namedChildren) {
      if (child.type === 'measure_decl') {
        const block = findNamedChild(child, 'block');
        if (block) walkBlock(block);
        continue;
      }

      walkExpression(child);
    }

    popScope(localScopes);
  }

  function walkBlock(block: Node): void {
    pushScope(localScopes);

    for (const statement of block.namedChildren) {
      walkExpression(statement);
    }

    popScope(localScopes);
  }

  function walkExpression(node: Node): void {
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
      case 'if_expr':
      case 'binary_expr':
      case 'tuple_expr':
      case 'else_expr':
      case 'index_expr':
      case 'unary_expr':
      case 'paren_expr':
      case 'assign_expr':
        for (const child of node.namedChildren) {
          walkExpression(child);
        }
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
        for (const child of node.namedChildren) {
          walkExpression(child);
        }
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
    addResolvedOccurrence(fieldNameNode, 'field', baseType ? resolveFieldKey(baseType, fieldNameNode.text) : undefined);
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

      walkTypeAnnotation(typeNode);
      const symbol = createSymbol(nameNode, 'binding', {
        detail: 'local binding',
        signature: `${nameNode.text}: ${typeNode.text}`,
        typeText: typeNode.text,
      });
      declareLocal(symbol);
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
    pushScope(localScopes);

    const patternNode = node.namedChildren[0]?.type === 'identifier' ? node.namedChildren[0] : undefined;
    const typeNode = findNamedChild(node, 'type_ident');
    const expressionNode = node.namedChildren.at(-1);

    if (typeNode) {
      addResolvedOccurrence(typeNode, 'type', resolveTypeKey(typeNode.text));
    }

    if (patternNode) {
      const symbol = createSymbol(patternNode, 'matchBinding', {
        detail: 'alt binding',
        signature: typeNode ? `${patternNode.text}: ${typeNode.text}` : patternNode.text,
        typeText: typeNode?.text,
      });
      declareLocal(symbol);
    }

    if (expressionNode) {
      walkExpression(expressionNode);
    }

    popScope(localScopes);
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

    pushScope(localScopes);

    const captureNode = findNamedChild(node, 'capture');
    if (captureNode) {
      for (const captureIdentifier of findNamedChildren(captureNode, 'identifier')) {
        const symbol = createSymbol(captureIdentifier, 'capture', {
          detail: 'loop capture',
          signature: captureIdentifier.text,
        });
        declareLocal(symbol);
      }
    }

    const blockNode = findNamedChild(node, 'block');
    if (blockNode) {
      for (const statement of blockNode.namedChildren) {
        walkExpression(statement);
      }
    }

    popScope(localScopes);
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

  function inferExpressionType(node: Node): string | undefined {
    switch (node.type) {
      case 'identifier': {
        const symbol = symbolByKey.get(resolveValueKey(node.text) ?? '');
        return symbol?.typeText ?? symbol?.returnTypeText;
      }
      case 'field_expr': {
        const [baseNode, fieldNode] = node.namedChildren;
        if (!baseNode || !fieldNode) return undefined;
        const baseType = inferExpressionType(baseNode);
        if (!baseType) return undefined;
        const fieldSymbol = symbolByKey.get(resolveFieldKey(baseType, fieldNode.text) ?? '');
        return fieldSymbol?.typeText;
      }
      case 'call_expr': {
        const calleeNode = node.namedChildren[0];
        if (!calleeNode) return undefined;

        if (calleeNode.type === 'identifier') {
          const symbol = symbolByKey.get(resolveValueKey(calleeNode.text) ?? '');
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
        return node.namedChildren[0] ? inferExpressionType(node.namedChildren[0]) : undefined;
      case 'literal':
        return inferLiteralType(node);
      case 'binary_expr':
      case 'else_expr':
      case 'tuple_expr':
      case 'index_expr':
      case 'assign_expr':
      case 'unary_expr':
        return node.namedChildren[0] ? inferExpressionType(node.namedChildren[0]) : undefined;
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
      const symbol = symbolByKey.get(resolveValueKey(first.text) ?? '');
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
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(word)) {
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
  return /[A-Za-z0-9_]/.test(value);
}

function symbolRole(kind: UtuSymbolKind): UtuOccurrence['role'] {
  switch (kind) {
    case 'struct':
    case 'sumType':
    case 'variant':
      return 'type';
    case 'field':
      return 'field';
    default:
      return 'value';
  }
}

function findNamedChild(node: Node | undefined, type: string): Node | undefined {
  return node?.namedChildren.find((child) => child.type === type);
}

function findNamedChildren(node: Node | undefined, type: string): Node[] {
  return node ? node.namedChildren.filter((child) => child.type === type) : [];
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

function pushScope(scopes: Array<Map<string, string>>): void {
  scopes.push(new Map<string, string>());
}

function popScope(scopes: Array<Map<string, string>>): void {
  scopes.pop();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function cloneDiagnostic(diagnostic: UtuDiagnostic): UtuDiagnostic {
  return {
    ...diagnostic,
    range: copyRange(diagnostic.range),
  };
}
