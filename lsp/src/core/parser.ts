import type { Node, Parser, Tree } from 'web-tree-sitter';
import {
  clamp,
  comparePositions,
  copyPosition,
  rangeKey,
  type UtuDiagnostic,
  type UtuPositionLike,
  type UtuRange,
  type UtuTextDocument,
} from './types';

type TreeSitterModule = typeof import('web-tree-sitter');
declare const WebAssembly: {
  instantiate(
    source: Uint8Array,
    imports: object,
  ): Promise<{ instance: unknown; module: unknown }>;
};

export interface ParsedTree {
  tree: Tree;
  dispose(): void;
}

export interface ParserServiceOptions {
  grammarWasmPath: string | Uint8Array;
  runtimeWasmPath: string | Uint8Array;
}

export class UtuParserService {
  private parserPromise?: Promise<Parser>;
  private parserInstance?: Parser;

  constructor(private readonly options: ParserServiceOptions) {}

  async getDiagnostics(document: UtuTextDocument): Promise<UtuDiagnostic[]> {
    return this.withParsedTree(document.getText(), ({ rootNode }) =>
      collectDiagnostics(rootNode, document),
    );
  }

  async getTreeString(source: string): Promise<string> {
    return this.withParsedTree(source, ({ rootNode }) => rootNode.toString());
  }

  async parseSource(source: string): Promise<ParsedTree> {
    const parser = await this.getParser();
    const tree = parser.parse(source);

    if (!tree) {
      throw new Error('Tree-sitter returned no syntax tree for the document.');
    }

    return {
      tree,
      dispose() {
        tree.delete();
      },
    };
  }

  dispose(): void {
    this.parserInstance?.delete();
    this.parserInstance = undefined;
    this.parserPromise = undefined;
  }

  private async getParser(): Promise<Parser> {
    return this.parserPromise ??= this.loadParser();
  }

  private async loadParser(): Promise<Parser> {
    const treeSitter = (await import('web-tree-sitter')) as TreeSitterModule;
    const runtimeWasm = normalizeWasmSource(this.options.runtimeWasmPath);
    const grammarWasm = normalizeWasmSource(this.options.grammarWasmPath);
    const initOptions = runtimeWasm instanceof Uint8Array
      ? createTreeSitterModuleOptions(runtimeWasm)
      : {
          locateFile(scriptName: string) {
            return scriptName === 'web-tree-sitter.wasm' ? runtimeWasm : scriptName;
          },
        };

    try {
      await treeSitter.Parser.init(
        initOptions as Parameters<typeof treeSitter.Parser.init>[0],
      );

      const parser = new treeSitter.Parser();
      parser.setLanguage(await treeSitter.Language.load(grammarWasm));
      this.parserInstance = parser;
      return parser;
    } catch (error) {
      this.parserPromise = undefined;
      throw error;
    }
  }

  private async withParsedTree<T>(source: string, callback: (tree: Tree) => T): Promise<T> {
    const parsedTree = await this.parseSource(source);

    try {
      return callback(parsedTree.tree);
    } finally {
      parsedTree.dispose();
    }
  }
}

export function rangeFromNode(document: UtuTextDocument, node: Node): UtuRange {
  return rangeFromOffsets(document, node.startIndex, node.endIndex);
}

export function rangeFromOffsets(
  document: UtuTextDocument,
  startOffset: number,
  endOffset: number,
): UtuRange {
  const start = clampPosition(document, copyPosition(document.positionAt(startOffset)));
  const end = clampPosition(document, copyPosition(document.positionAt(endOffset)));

  return comparePositions(start, end) < 0
    ? { start, end }
    : { start, end: widenEmptyRange(document, start) };
}

export function collectDiagnostics(rootNode: Node, document: UtuTextDocument): UtuDiagnostic[] {
  const diagnostics: UtuDiagnostic[] = [];
  const seen = new Set<string>();

  visit(rootNode);

  diagnostics.sort((left, right) => comparePositions(left.range.start, right.range.start));

  return diagnostics;

  function visit(node: Node): void {
    if (node.isError) {
      pushDiagnostic('Unexpected token', node);
    }

    if (node.isMissing) {
      pushDiagnostic(`Missing ${node.type}`, node);
    }

    for (const child of node.children) {
      visit(child);
    }
  }

  function pushDiagnostic(message: string, node: Node): void {
    const range = rangeFromNode(document, node);
    const key = `${message}:${rangeKey(range)}`;
    if (seen.has(key)) return;

    seen.add(key);
    diagnostics.push({
      message,
      range,
      severity: 'error',
      source: 'utu',
    });
  }
}

function clampPosition(document: UtuTextDocument, position: UtuPositionLike) {
  const lastLine = Math.max(document.lineCount - 1, 0);
  const line = clamp(position.line, 0, lastLine);
  const lineLength = getLineText(document, line).length;

  return {
    line,
    character: clamp(position.character, 0, lineLength),
  };
}

function getLineText(document: UtuTextDocument, line: number): string {
  return document.lineAt(clamp(line, 0, Math.max(document.lineCount - 1, 0))).text;
}

function widenEmptyRange(document: UtuTextDocument, position: UtuPositionLike) {
  return {
    line: position.line,
    character: Math.min(position.character + 1, getLineText(document, position.line).length),
  };
}

function normalizeWasmSource(source: string | Uint8Array): string | Uint8Array {
  return typeof source === 'string' && source.startsWith('file://')
    ? decodeURIComponent(source.slice('file://'.length))
    : source;
}

function createTreeSitterModuleOptions(runtimeWasm: Uint8Array) {
  return {
    wasmBinary: runtimeWasm,
    instantiateWasm(
      imports: object,
      successCallback: (instance: unknown, module: unknown) => void,
    ) {
      void WebAssembly.instantiate(runtimeWasm, imports)
        .then(({ instance, module }) => {
          successCallback(instance, module);
        });

      return {};
    },
  };
}
