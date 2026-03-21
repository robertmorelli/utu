import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Node, Parser, Tree } from 'web-tree-sitter';

type TreeSitterModule = typeof import('web-tree-sitter');
export interface ParsedTree {
  tree: Tree;
  dispose(): void;
}

export class UtuParserService implements vscode.Disposable {
  private parserPromise?: Promise<Parser>;
  private parserInstance?: Parser;

  constructor(private readonly extensionUri: vscode.Uri) {}

  async getDiagnostics(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
    const parsedTree = await this.parseSource(document.getText());

    try {
      return collectDiagnostics(parsedTree.tree.rootNode, document);
    } finally {
      parsedTree.dispose();
    }
  }

  async getTreeString(source: string): Promise<string> {
    const parsedTree = await this.parseSource(source);

    try {
      return parsedTree.tree.rootNode.toString();
    } finally {
      parsedTree.dispose();
    }
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
    const runtimeWasmPath = require.resolve('web-tree-sitter/web-tree-sitter.wasm');
    const grammarWasmPath = path.join(this.extensionUri.fsPath, 'tree-sitter-utu.wasm');

    try {
      await treeSitter.Parser.init({
        locateFile(scriptName) {
          if (scriptName === 'web-tree-sitter.wasm') {
            return runtimeWasmPath;
          }

          return scriptName;
        },
      });

      const parser = new treeSitter.Parser();
      const language = await treeSitter.Language.load(grammarWasmPath);
      parser.setLanguage(language);
      this.parserInstance = parser;
      return parser;
    } catch (error) {
      this.parserPromise = undefined;
      throw error;
    }
  }
}

function collectDiagnostics(rootNode: Node, document: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
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
    const range = toRange(document, node);
    const key = `${message}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
    if (seen.has(key)) return;

    seen.add(key);
    const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
    diagnostic.source = 'utu';
    diagnostics.push(diagnostic);
  }
}

function toRange(document: vscode.TextDocument, node: Node): vscode.Range {
  const lastLine = Math.max(document.lineCount - 1, 0);
  const startLine = clamp(node.startPosition.row, 0, lastLine);
  const endLine = clamp(node.endPosition.row, 0, lastLine);
  const startLineLength = document.lineAt(startLine).text.length;
  const endLineLength = document.lineAt(endLine).text.length;

  const startCharacter = clamp(node.startPosition.column, 0, startLineLength);
  let endCharacter = clamp(node.endPosition.column, 0, endLineLength);

  if (startLine === endLine && endCharacter <= startCharacter) {
    endCharacter = Math.min(startCharacter + 1, endLineLength);
  }

  const start = new vscode.Position(startLine, startCharacter);
  const end = new vscode.Position(endLine, endCharacter);
  return new vscode.Range(start, end);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
