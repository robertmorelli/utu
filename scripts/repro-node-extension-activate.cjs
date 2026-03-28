const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');

async function main() {
  const root = path.resolve(__dirname, '..');
  const stubRoot = path.resolve(root, 'node_modules/vscode');
  const extensionUri = pathToFileURL(path.resolve(root, 'dist/web-dev-extension'));

  await fsp.mkdir(stubRoot, { recursive: true });
  try {
    await fsp.writeFile(path.resolve(stubRoot, 'package.json'), JSON.stringify({
      name: 'vscode',
      main: './index.js',
    }, null, 2), 'utf8');
    await fsp.writeFile(path.resolve(stubRoot, 'index.js'), createVscodeStubSource(), 'utf8');

    const extension = require(path.resolve(root, 'dist/node/extension.cjs'));
    const activate = extension.activate ?? extension.default?.activate;
    if (typeof activate !== 'function') throw new Error('Missing activate export');

    const context = {
      extensionUri: wrapUrl(extensionUri),
      subscriptions: [],
    };

    await activate(context);
    console.log('PASS activate');
  } finally {
    await fsp.rm(stubRoot, { recursive: true, force: true });
  }
}

function wrapUrl(url) {
  return {
    toString(skipEncoding) {
      return skipEncoding ? decodeURIComponent(url.toString()) : url.toString();
    },
    fsPath: fileURLToPath(url),
    scheme: url.protocol.slice(0, -1),
    path: url.pathname,
  };
}

function createVscodeStubSource() {
  return `
const fsp = require('node:fs/promises');
const { fileURLToPath } = require('node:url');

function disposable() { return { dispose() {} }; }
function wrapUrl(url) {
  return {
    toString(skipEncoding) { return skipEncoding ? decodeURIComponent(url.toString()) : url.toString(); },
    fsPath: fileURLToPath(url),
    scheme: url.protocol.slice(0, -1),
    path: url.pathname,
  };
}

class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range { constructor(start, end) { this.start = start; this.end = end; } }
class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
class DocumentHighlight { constructor(range, kind) { this.range = range; this.kind = kind; } }
class DocumentSymbol { constructor(name, detail, kind, range, selectionRange) { this.name = name; this.detail = detail; this.kind = kind; this.range = range; this.selectionRange = selectionRange; } }
class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
class Location { constructor(uri, range) { this.uri = uri; this.range = range; } }
class MarkdownString {
  constructor(value = '') { this.value = value; }
  appendMarkdown(value) { this.value += value; return this; }
  appendCodeblock(value) { this.value += value; return this; }
}
class SymbolInformation { constructor(name, kind, containerName, location) { this.name = name; this.kind = kind; this.containerName = containerName; this.location = location; } }
class EventEmitter {
  constructor() {
    this.listeners = new Set();
    this.event = (listener) => { this.listeners.add(listener); return { dispose: () => this.listeners.delete(listener) }; };
  }
  fire(value) { for (const listener of this.listeners) listener(value); }
  dispose() { this.listeners.clear(); }
}
class Disposable {
  constructor(fn = () => {}) { this.dispose = fn; }
  static from(...values) { return new Disposable(() => values.forEach((value) => value?.dispose?.())); }
}
class CodeLens { constructor(range, command) { this.range = range; this.command = command; } }
class SemanticTokensLegend { constructor(types = [], modifiers = []) { this.tokenTypes = types; this.tokenModifiers = modifiers; } }
class SemanticTokensBuilder { constructor() { this.tokens = []; } push(range, type, modifiers = []) { this.tokens.push({ range, type, modifiers }); } build() { return { data: this.tokens }; } }
class TestTag { constructor(id) { this.id = id; } }
class TestMessage { constructor(message) { this.message = message; } }

const Uri = {
  joinPath(base, ...segments) {
    let current = new URL(String(base));
    for (const segment of segments) {
      const normalized = String(segment).replace(/^[/]+/, '');
      current = new URL(normalized, current.href.endsWith('/') ? current.href : current.href + '/');
    }
    return wrapUrl(current);
  },
  parse(value) { return wrapUrl(new URL(String(value))); },
};

const workspace = {
  workspaceFolders: [],
  textDocuments: [],
  fs: {
    async readFile(uri) { return fsp.readFile(uri.fsPath); },
  },
  async findFiles() { return []; },
  async openTextDocument(uri) {
    const text = await fsp.readFile(uri.fsPath, 'utf8');
    return {
      uri,
      version: 1,
      languageId: uri.fsPath.endsWith('.utu') ? 'utu' : 'plaintext',
      getText() { return text; },
      lineAt() { return { text: '' }; },
      positionAt() { return new Position(0, 0); },
    };
  },
  getConfiguration() { return { get(_key, fallback) { return fallback; } }; },
  createFileSystemWatcher() { return { onDidCreate() { return disposable(); }, onDidChange() { return disposable(); }, onDidDelete() { return disposable(); }, dispose() {} }; },
  onDidChangeTextDocument() { return disposable(); },
  onDidCloseTextDocument() { return disposable(); },
  onDidChangeWorkspaceFolders() { return disposable(); },
  onDidChangeConfiguration() { return disposable(); },
  onDidOpenTextDocument() { return disposable(); },
  onDidSaveTextDocument() { return disposable(); },
  registerTextDocumentContentProvider() { return disposable(); },
};

module.exports = {
  Position,
  Range,
  CompletionItem,
  Diagnostic,
  DocumentHighlight,
  DocumentSymbol,
  Hover,
  Location,
  MarkdownString,
  SymbolInformation,
  EventEmitter,
  Disposable,
  CodeLens,
  SemanticTokensLegend,
  SemanticTokensBuilder,
  TestTag,
  TestMessage,
  Uri,
  workspace,
  window: {
    activeTextEditor: undefined,
    createOutputChannel() { return { appendLine(value) { console.log('[out]', String(value)); }, show() {}, dispose() {} }; },
    createStatusBarItem() { return { show() {}, hide() {}, dispose() {}, text: '', tooltip: '', name: '', command: undefined }; },
    onDidChangeActiveTextEditor() { return disposable(); },
    showErrorMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    setStatusBarMessage() {},
    showTextDocument: async () => undefined,
    withProgress: async (_options, task) => task(),
  },
  commands: {
    executeCommand: async () => undefined,
    registerCommand() { return disposable(); },
  },
  languages: {
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
    setTextDocumentLanguage: async () => undefined,
  },
  tests: {
    createTestController() {
      return {
        createRunProfile() { return disposable(); },
        createTestItem(id, label, uri) { return { id, label, uri, children: { replace() {}, size: 0, [Symbol.iterator]: function* () {} } }; },
        items: { replace() {}, add() {}, delete() {}, get() { return undefined; }, forEach() {}, [Symbol.iterator]: function* () {} },
        invalidateTestResults() {},
        dispose() {},
      };
    },
  },
  StatusBarAlignment: { Left: 1 },
  CompletionItemKind: { Class: 6, Function: 2, Keyword: 13, Method: 1, Module: 8, Variable: 5 },
  SymbolKind: { Class: 4, Function: 11, Field: 7, Variable: 12, Module: 1, Struct: 22 },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  DocumentHighlightKind: { Text: 0, Read: 1, Write: 2 },
  TestRunProfileKind: { Run: 1 },
  ProgressLocation: { Notification: 15 },
  ViewColumn: { Beside: 2 },
};
`;
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
