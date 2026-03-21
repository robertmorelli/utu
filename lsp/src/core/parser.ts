import type { Node, Parser, Tree } from 'web-tree-sitter';
import {
  copyPosition,
  type UtuDiagnostic,
  type UtuPositionLike,
  type UtuRange,
  type UtuTextDocument,
} from './types';

type TreeSitterModule = typeof import('web-tree-sitter');

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
    return this.withParsedTree(document.getText(), (tree) => collectDiagnostics(tree.rootNode, document));
  }

  async getTreeString(source: string): Promise<string> {
    return this.withParsedTree(source, (tree) => tree.rootNode.toString());
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
    if (!this.parserPromise) {
      this.parserPromise = this.loadParser();
    }

    return this.parserPromise;
  }

  private async loadParser(): Promise<Parser> {
    const treeSitter = (await import('web-tree-sitter')) as TreeSitterModule;
    const runtimeWasm = normalizeWasmSource(this.options.runtimeWasmPath);
    const grammarWasm = normalizeWasmSource(this.options.grammarWasmPath);

    try {
      await treeSitter.Parser.init(
        runtimeWasm instanceof Uint8Array
          ? createTreeSitterModuleOptions(runtimeWasm) as unknown as Parameters<typeof treeSitter.Parser.init>[0]
          : {
              locateFile(scriptName: string) {
                if (scriptName === 'web-tree-sitter.wasm') {
                  return runtimeWasm;
                }

                return scriptName;
              },
            },
      );

      const parser = new treeSitter.Parser();
      const language = await treeSitter.Language.load(grammarWasm);
      parser.setLanguage(language);
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

  if (start.line === end.line && end.character <= start.character) {
    const lineLength = getLineText(document, end.line).length;
    return {
      start,
      end: {
        line: end.line,
        character: Math.min(start.character + 1, lineLength),
      },
    };
  }

  return { start, end };
}

function collectDiagnostics(rootNode: Node, document: UtuTextDocument): UtuDiagnostic[] {
  const diagnostics: UtuDiagnostic[] = [];
  const seen = new Set<string>();

  visit(rootNode);

  diagnostics.sort((left, right) => {
    if (left.range.start.line !== right.range.start.line) {
      return left.range.start.line - right.range.start.line;
    }

    return left.range.start.character - right.range.start.character;
  });

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
    const key = `${message}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
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
  const lastLine = Math.max(document.lineCount - 1, 0);
  const safeLine = clamp(line, 0, lastLine);
  return document.lineAt(safeLine).text;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeWasmSource(source: string | Uint8Array): string | Uint8Array {
  const binary = toWasmBinary(source);
  if (binary) {
    return binary;
  }

  return source.startsWith('file://') ? decodeURIComponent(source.slice('file://'.length)) : source;
}

function toWasmBinary(source: string | Uint8Array): Uint8Array | undefined {
  if (ArrayBuffer.isView(source)) {
    return source instanceof Uint8Array
      ? source
      : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  }

  return source instanceof ArrayBuffer ? new Uint8Array(source) : undefined;
}

function createTreeSitterModuleOptions(runtimeWasm: Uint8Array) {
  return {
    wasmBinary: runtimeWasm,
    instantiateWasm(
      imports: WebAssembly.Imports,
      successCallback: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ) {
      void WebAssembly.instantiate(runtimeWasm, imports).then(({ instance, module }) => {
        successCallback(instance, module);
      });
      return {};
    },
  };
}
