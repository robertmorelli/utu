import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as treeSitter from 'web-tree-sitter';

import { getRepoRoot } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const stubPackageRoot = resolve(repoRoot, 'node_modules/vscode');
const expectedMessage = 'Incompatible language version 0. Compatibility range 13 through 15.';

async function main() {
  const outputLines = [];
  const originalLoad = treeSitter.Language.load;

  try {
    await writeFakeVscodePackage(outputLines);

    const { activateUtuExtension } = await import(pathToFileURL(resolve(repoRoot, 'extension/activate.js')).href);
    const [grammarWasmPath, runtimeWasmPath] = await Promise.all([
      readFile(new URL('../tree-sitter-utu.wasm', import.meta.url)),
      readFile(new URL('../web-tree-sitter.wasm', import.meta.url)),
    ]);

    treeSitter.Language.load = async (...args) => {
      const language = await originalLoad.apply(treeSitter.Language, args);
      language[0] = 0;
      return language;
    };

    const context = createFakeContext();
    activateUtuExtension(context, {
      compilerHost: undefined,
      runtimeHost: { getRunMainBlocker: async () => undefined },
      grammarWasmPath,
      parserRuntimeWasmPath: runtimeWasmPath,
      showCompileStatusBar: false,
    });

    await flushAsyncWork();

    const joined = outputLines.join('\n');
    if (!joined.includes('[workspace symbols] sync workspace')) {
      throw new Error(`Expected activation log to include workspace sync label, received:\n${joined || '(no output)'}`);
    }
    if (!joined.includes(expectedMessage)) {
      throw new Error(`Expected activation log to include "${expectedMessage}", received:\n${joined || '(no output)'}`);
    }

    console.log(`PASS vscode activation log repro (verified workspace log contains expected error: ${expectedMessage})`);
  } finally {
    treeSitter.Language.load = originalLoad;
    await rm(stubPackageRoot, { recursive: true, force: true });
  }
}

function createFakeContext() {
  return {
    subscriptions: [],
  };
}

async function writeFakeVscodePackage(outputLines) {
  const fixtureUris = [
    'examples/hello.utu',
    'examples/hello_name.utu',
    'examples/ci/codegen_globals.utu',
  ].map((relativePath) => pathToFileURL(resolve(repoRoot, relativePath)).toString());

  const packageJson = {
    name: 'vscode',
    type: 'module',
    exports: './index.js',
  };

const source = `
import { readFile } from 'node:fs/promises';

const fixtureUris = ${JSON.stringify(fixtureUris)};
const outputLines = global.__utuActivationLogLines ?? [];
let findFilesCalls = 0;

function disposable() {
  return { dispose() {} };
}

export class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

export class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

export const StatusBarAlignment = { Left: 1 };
export const CompletionItemKind = { Class: 6, Function: 2, Keyword: 13, Method: 1, Module: 8, Variable: 5 };
export const SymbolKind = { Class: 4, Function: 11, Field: 7, Variable: 12, Module: 1, Struct: 22 };
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
export const DocumentHighlightKind = { Text: 0, Read: 1, Write: 2 };

export class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
export class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
export class DocumentHighlight { constructor(range, kind) { this.range = range; this.kind = kind; } }
export class DocumentSymbol { constructor(name, detail, kind, range, selectionRange) { this.name = name; this.detail = detail; this.kind = kind; this.range = range; this.selectionRange = selectionRange; } }
export class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
export class Location { constructor(uri, range) { this.uri = uri; this.range = range; } }
export class MarkdownString { constructor(value = '') { this.value = value; } appendMarkdown(value) { this.value += value; return this; } appendCodeblock(value) { this.value += value; return this; } }
export class SymbolInformation { constructor(name, kind, containerName, location) { this.name = name; this.kind = kind; this.containerName = containerName; this.location = location; } }
export class EventEmitter { constructor() { this.listeners = new Set(); this.event = (listener) => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; }; } fire(value) { for (const listener of this.listeners) listener(value); } dispose() { this.listeners.clear(); } }
export class Disposable { constructor(fn = () => {}) { this.dispose = fn; } static from(...values) { return new Disposable(() => values.forEach((value) => value?.dispose?.())); } }
export class CodeLens { constructor(range, command) { this.range = range; this.command = command; } }
export class SemanticTokensLegend { constructor(types = [], modifiers = []) { this.tokenTypes = types; this.tokenModifiers = modifiers; } }
export class SemanticTokensBuilder { constructor() { this.tokens = []; } push(range, type, modifiers = []) { this.tokens.push({ range, type, modifiers }); } build() { return { data: this.tokens }; } }
export class TestTag { constructor(id) { this.id = id; } }
export class TestMessage { constructor(message) { this.message = message; } }
export const TestRunProfileKind = { Run: 1 };
export const ProgressLocation = { Notification: 15 };
export const ViewColumn = { Beside: 2 };

export const Uri = {
  joinPath(base, ...segments) {
    const normalized = String(base);
    return new URL(segments.map((segment) => String(segment).replace(/^\\/+/, '')).join('/'), normalized.endsWith('/') ? normalized : normalized + '/');
  },
  parse(value) {
    return new URL(String(value));
  },
};

export const window = {
  activeTextEditor: undefined,
  createOutputChannel() {
    return {
      appendLine(value) { outputLines.push(String(value)); },
      dispose() {},
    };
  },
  createStatusBarItem() { return { show() {}, hide() {}, dispose() {}, text: '', tooltip: '', name: '', command: undefined }; },
  onDidChangeActiveTextEditor() { return disposable(); },
  showErrorMessage: async () => undefined,
};

export const commands = {
  executeCommand: async () => undefined,
  registerCommand() { return disposable(); },
};

export const workspace = {
  textDocuments: [],
  fs: {
    async readFile(uri) {
      return readFile(uri);
    },
  },
  async findFiles() {
    findFilesCalls += 1;
    if (findFilesCalls === 1) return [];
    return fixtureUris.map((uri) => new URL(uri));
  },
  async openTextDocument(uri) {
    const target = new URL(String(uri));
    const text = await readFile(target, 'utf8');
    const lines = text.split(/\\r?\\n/);
    const document = {
      uri: target,
      version: 1,
      languageId: 'utu',
      getText() { return text; },
      get lineCount() { return lines.length; },
      lineAt(line) { return { text: lines[line] ?? '' }; },
      positionAt(offset) {
        const before = text.slice(0, offset).split(/\\r?\\n/);
        return new Position(before.length - 1, before.at(-1)?.length ?? 0);
      },
    };
    this.textDocuments.push(document);
    return document;
  },
  getConfiguration() {
    return { get(_key, fallback) { return fallback; } };
  },
  createFileSystemWatcher() { return { onDidCreate() { return disposable(); }, onDidChange() { return disposable(); }, onDidDelete() { return disposable(); }, dispose() {} }; },
  onDidChangeTextDocument() { return disposable(); },
  onDidCloseTextDocument() { return disposable(); },
  onDidChangeWorkspaceFolders() { return disposable(); },
  onDidOpenTextDocument() { return disposable(); },
  onDidSaveTextDocument() { return disposable(); },
  onDidChangeConfiguration() { return disposable(); },
  registerTextDocumentContentProvider() { return disposable(); },
};

export const languages = {
  createDiagnosticCollection() { return { set() {}, clear() {}, delete() {}, dispose() {} }; },
  registerHoverProvider() { return disposable(); },
  registerDefinitionProvider() { return disposable(); },
  registerReferenceProvider() { return disposable(); },
  registerDocumentHighlightProvider() { return disposable(); },
  registerCompletionItemProvider() { return disposable(); },
  registerDocumentSemanticTokensProvider() { return disposable(); },
  registerDocumentSymbolProvider() { return disposable(); },
  registerCodeLensProvider() { return disposable(); },
  registerWorkspaceSymbolProvider() { return disposable(); },
};

export const tests = {
  createTestController() {
    const items = new Map();
    return {
      createRunProfile() { return disposable(); },
      createTestItem(id, label, uri) { return { id, label, uri, children: { replace() {}, size: 0, [Symbol.iterator]: function* () {} } }; },
      items: {
        replace(values = []) { items.clear(); for (const value of values) items.set(value.id, value); },
        add(value) { items.set(value.id, value); },
        delete(id) { items.delete(id); },
        get(id) { return items.get(id); },
        forEach(callback) { items.forEach(callback); },
        [Symbol.iterator]: function* () { yield* items.values(); },
      },
      invalidateTestResults() {},
      dispose() {},
    };
  },
};
`;

  global.__utuActivationLogLines = outputLines;
  await mkdir(stubPackageRoot, { recursive: true });
  await writeFile(resolve(stubPackageRoot, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
  await writeFile(resolve(stubPackageRoot, 'index.js'), source, 'utf8');
}

async function flushAsyncWork() {
  for (let index = 0; index < 10; index += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  }
}

await main();
