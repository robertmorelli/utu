import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertManagedTestModule, expectValue, getRepoRoot } from './test-helpers.mjs';

assertManagedTestModule(import.meta.url);

const repoRoot = getRepoRoot(import.meta.url);
const stubPackageRoot = resolve(repoRoot, 'node_modules/vscode');

await main();

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'utu-vscode-web-smoke-'));
  const programPath = join(tempRoot, 'web-smoke.utu');
  const runtimeGlobals = Function('return this')();
  const originalFetch = runtimeGlobals.fetch;
  const originalWindow = runtimeGlobals.window;
  const originalSelf = runtimeGlobals.self;
  const originalProcessType = process.type;
  const state = {
    commandCalls: [],
    commands: {},
    contentProviders: {},
    generatedDocuments: [],
    findFilesCalls: 0,
    outputLines: [],
    shownDocuments: [],
    sourceFiles: [pathToFileURL(programPath).toString()],
    statusMessages: [],
    warningMessages: [],
  };
  const programDocument = createProgramDocument(programPath);

  await writeFile(programPath, 'fun main() i32 {\n    7;\n}\n', 'utf8');

  try {
    runtimeGlobals.__utuWebSmokeState = state;
    runtimeGlobals.window = runtimeGlobals;
    runtimeGlobals.self = runtimeGlobals;
    process.type = 'renderer';
    await writeFakeVscodePackage();
    runtimeGlobals.fetch = createAssetFetch(originalFetch);

    const bundle = await import(pathToFileURL(resolve(repoRoot, 'dist/web/extension.js')).href);
    const activate = bundle.activate ?? bundle.default?.activate;
    if (typeof activate !== 'function') {
      throw new Error('Expected built web extension bundle to export activate().');
    }

    const context = {
      extensionUri: 'https://example.test/extensions/utu/',
      subscriptions: [],
    };
    await activate(context);

    await invokeCommand('utu.compileCurrentFile', programDocument);
    await invokeCommand('utu.showGeneratedJavaScript', programDocument);
    await invokeCommand('utu.showGeneratedWat', programDocument);

    assertRegisteredCommands(state.commands);
    assertGeneratedOutputs(state.generatedDocuments);
    assertCompileOutput(state.outputLines);
    expectValue(state.warningMessages.length, 0);

    console.log('PASS vscode web extension smoke');
  } finally {
    runtimeGlobals.fetch = originalFetch;
    runtimeGlobals.window = originalWindow;
    runtimeGlobals.self = originalSelf;
    process.type = originalProcessType;
    delete runtimeGlobals.__utuWebSmokeState;
    await rm(stubPackageRoot, { recursive: true, force: true });
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function assertRegisteredCommands(commands) {
  for (const name of [
    'utu.compileCurrentFile',
    'utu.runMain',
    'utu.showGeneratedJavaScript',
    'utu.showGeneratedWat',
    'utu.showSyntaxTree',
  ]) {
    if (typeof commands[name] !== 'function') {
      throw new Error(`Expected ${name} to be registered.`);
    }
  }
}

function assertGeneratedOutputs(generatedDocuments) {
  if (generatedDocuments.length < 2) {
    throw new Error(`Expected generated documents for JS and WAT, received ${generatedDocuments.length}.`);
  }
  const jsDoc = generatedDocuments.find((document) => document.kind === 'js');
  const watDoc = generatedDocuments.find((document) => document.kind === 'wat');
  if (!jsDoc?.content?.includes('instantiate')) {
    throw new Error('Expected generated JavaScript view to contain the runtime shim.');
  }
  if (!watDoc?.content?.includes('(module')) {
    throw new Error('Expected generated WAT view to contain a Wasm module.');
  }
}

function assertCompileOutput(outputLines) {
  const joined = outputLines.join('\n');
  if (!joined.includes('[utu] Compiled')) {
    throw new Error(`Expected compile output, received:\n${joined || '(no output)'}`);
  }
}

async function invokeCommand(name, ...args) {
  const state = Function('return this')().__utuWebSmokeState;
  const command = state?.commands?.[name];
  if (typeof command !== 'function') {
    throw new Error(`Command ${name} was not registered.`);
  }
  await command(...args);
}

function createAssetFetch(originalFetch) {
  const assetMap = new Map([
    ['https://example.test/extensions/utu/dist/compiler.web.mjs', new URL('../dist/compiler.web.mjs', import.meta.url)],
    ['https://example.test/extensions/utu/tree-sitter-utu.wasm', new URL('../tree-sitter-utu.wasm', import.meta.url)],
    ['https://example.test/extensions/utu/web-tree-sitter.wasm', new URL('../web-tree-sitter.wasm', import.meta.url)],
  ]);

  return async (input, init) => {
    const href = String(typeof input === 'string' ? input : input?.url ?? input);
    const assetUrl = assetMap.get(href);
    if (!assetUrl) {
      if (typeof originalFetch === 'function') return originalFetch(input, init);
      throw new Error(`Unexpected fetch in web smoke test: ${href}`);
    }
    const body = await readFile(assetUrl);
    return new Response(body, { status: 200 });
  };
}

async function writeFakeVscodePackage() {
  const packageJson = {
    name: 'vscode',
    type: 'module',
    exports: './index.js',
  };

  const source = `
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const state = Function('return this')().__utuWebSmokeState;

function disposable(fn = () => {}) {
  return { dispose: fn };
}

function ensureState() {
  if (!state) throw new Error('Missing __utuWebSmokeState.');
  return state;
}

function normalizeUri(value) {
  if (value instanceof Uri) return value;
  if (value && typeof value === 'object' && typeof value.toString === 'function') return Uri.parse(value.toString());
  return Uri.parse(String(value));
}

function createDocument(uri, text, languageId = inferLanguageId(uri)) {
  const normalized = normalizeUri(uri);
  const source = String(text);
  const lines = source.split(/\\r?\\n/);
  return {
    uri: normalized,
    fileName: normalized.scheme === 'file' ? fileURLToPath(normalized.toString()) : normalized.path,
    version: 1,
    languageId,
    getText() { return source; },
    get lineCount() { return lines.length; },
    lineAt(line) { return { text: lines[line] ?? '' }; },
    positionAt(offset) {
      const before = source.slice(0, offset).split(/\\r?\\n/);
      return new Position(before.length - 1, before.at(-1)?.length ?? 0);
    },
    offsetAt(position) {
      const segments = source.split(/\\r?\\n/);
      let offset = 0;
      for (let index = 0; index < position.line; index += 1) offset += (segments[index] ?? '').length + 1;
      return offset + position.character;
    },
  };
}

function inferLanguageId(uri) {
  const normalized = normalizeUri(uri);
  if (normalized.scheme === 'utu-generated') return 'plaintext';
  return normalized.path.endsWith('.utu') ? 'utu' : 'plaintext';
}

export class Uri {
  constructor(href) {
    this.value = new URL(String(href));
  }
  get scheme() { return this.value.protocol.slice(0, -1); }
  get path() { return this.value.pathname; }
  get fsPath() { return this.scheme === 'file' ? fileURLToPath(this.value) : this.value.pathname; }
  get query() { return this.value.search.length > 0 ? this.value.search.slice(1) : ''; }
  toString() { return this.value.href; }
  static parse(value) { return new Uri(value); }
  static joinPath(base, ...segments) {
    const baseUri = normalizeUri(base);
    const normalizedPath = [baseUri.path.replace(/\\/$/u, ''), ...segments.map((segment) => String(segment).replace(/^\\/+|\\/+$/gu, ''))]
      .filter(Boolean)
      .join('/');
    return new Uri(\`\${baseUri.scheme}://\${baseUri.value.host}\${normalizedPath.startsWith('/') ? normalizedPath : '/' + normalizedPath}\`);
  }
  static from({ scheme = 'file', authority = '', path = '/', query = '' }) {
    const suffix = query ? \`?\${query}\` : '';
    const authorityPart = authority ? \`//\${authority}\` : scheme === 'file' ? '//' : '';
    return new Uri(\`\${scheme}:\${authorityPart}\${path}\${suffix}\`);
  }
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

export class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
export class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
export class DocumentHighlight { constructor(range, kind) { this.range = range; this.kind = kind; } }
export class DocumentSymbol { constructor(name, detail, kind, range, selectionRange) { this.name = name; this.detail = detail; this.kind = kind; this.range = range; this.selectionRange = selectionRange; } }
export class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
export class Location { constructor(uri, range) { this.uri = uri; this.range = range; } }
export class MarkdownString { constructor(value = '') { this.value = value; } appendMarkdown(value) { this.value += value; return this; } appendCodeblock(value) { this.value += value; return this; } }
export class SymbolInformation { constructor(name, kind, containerName, location) { this.name = name; this.kind = kind; this.containerName = containerName; this.location = location; } }
export class CodeLens { constructor(range, command) { this.range = range; this.command = command; } }
export class SemanticTokensLegend { constructor(types = [], modifiers = []) { this.tokenTypes = types; this.tokenModifiers = modifiers; } }
export class SemanticTokensBuilder {
  constructor() { this.tokens = []; }
  push(range, type, modifiers = []) { this.tokens.push({ range, type, modifiers }); }
  build() { return { data: this.tokens }; }
}
export class TestTag { constructor(id) { this.id = id; } }
export class TestMessage { constructor(message) { this.message = message; } }
export class EventEmitter {
  constructor() {
    this.listeners = new Set();
    this.event = (listener) => {
      this.listeners.add(listener);
      return disposable(() => this.listeners.delete(listener));
    };
  }
  fire(value) {
    for (const listener of this.listeners) listener(value);
  }
  dispose() {
    this.listeners.clear();
  }
}
export class Disposable {
  constructor(fn = () => {}) {
    this.dispose = fn;
  }
  static from(...values) {
    return new Disposable(() => values.forEach((value) => value?.dispose?.()));
  }
}

export const StatusBarAlignment = { Left: 1 };
export const CompletionItemKind = { Class: 6, Function: 2, Keyword: 13, Method: 1, Module: 8, Variable: 5 };
export const SymbolKind = { Class: 4, Function: 11, Field: 7, Variable: 12, Module: 1, Struct: 22 };
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
export const DocumentHighlightKind = { Text: 0, Read: 1, Write: 2 };
export const TestRunProfileKind = { Run: 1 };
export const ProgressLocation = { Notification: 15 };
export const ViewColumn = { Beside: 2 };

export const window = {
  activeTextEditor: undefined,
  createOutputChannel() {
    return {
      appendLine(value) { ensureState().outputLines.push(String(value)); },
      show() {},
      dispose() {},
    };
  },
  createStatusBarItem() {
    return { show() {}, hide() {}, dispose() {}, text: '', tooltip: '', name: '', command: undefined };
  },
  onDidChangeActiveTextEditor() { return disposable(); },
  async showWarningMessage(message) {
    ensureState().warningMessages.push(String(message));
    return undefined;
  },
  async showErrorMessage(message) {
    throw new Error(\`Unexpected showErrorMessage during web smoke test: \${message}\`);
  },
  async showTextDocument(document) {
    const target = document?.getText ? document : await workspace.openTextDocument(document);
    ensureState().shownDocuments.push({
      languageId: target.languageId,
      text: target.getText(),
      uri: target.uri.toString(),
    });
    return { document: target };
  },
  async withProgress(_options, task) {
    return task();
  },
  setStatusBarMessage(message) {
    ensureState().statusMessages.push(String(message));
    return disposable();
  },
};

export const commands = {
  async executeCommand(name, ...args) {
    if (name === 'setContext') return undefined;
    const command = ensureState().commands[name];
    return typeof command === 'function' ? command(...args) : undefined;
  },
  registerCommand(name, fn) {
    ensureState().commands[name] = fn;
    return disposable(() => { delete ensureState().commands[name]; });
  },
};

export const workspace = {
  workspaceFolders: [{ uri: Uri.parse(${JSON.stringify(pathToFileURL(repoRoot).toString())}) }],
  textDocuments: [],
  fs: {
    async readFile(uri) {
      const href = normalizeUri(uri).toString();
      if (href === 'https://example.test/extensions/utu/dist/compiler.web.mjs') {
        return readFile(new URL(${JSON.stringify(new URL('../dist/compiler.web.mjs', import.meta.url).href)}));
      }
      if (href === 'https://example.test/extensions/utu/tree-sitter-utu.wasm') {
        return readFile(new URL(${JSON.stringify(new URL('../tree-sitter-utu.wasm', import.meta.url).href)}));
      }
      if (href === 'https://example.test/extensions/utu/web-tree-sitter.wasm') {
        return readFile(new URL(${JSON.stringify(new URL('../web-tree-sitter.wasm', import.meta.url).href)}));
      }
      const normalized = normalizeUri(uri);
      if (normalized.scheme !== 'file') throw new Error(\`Unexpected workspace.fs.readFile target: \${href}\`);
      return readFile(normalized.value);
    },
  },
  async findFiles() {
    const currentState = ensureState();
    currentState.findFilesCalls += 1;
    if (currentState.findFilesCalls === 1) return [];
    return currentState.sourceFiles.map((uri) => Uri.parse(uri));
  },
  async openTextDocument(target) {
    const normalized = normalizeUri(target);
    if (normalized.scheme === 'utu-generated') {
      const provider = ensureState().contentProviders['utu-generated'];
      if (!provider) throw new Error('Missing utu-generated content provider.');
      const text = provider.provideTextDocumentContent(normalized);
      const document = createDocument(normalized, text, 'plaintext');
      this.textDocuments.push(document);
      return document;
    }
    const text = await readFile(normalized.value, 'utf8');
    const document = createDocument(normalized, text);
    this.textDocuments.push(document);
    if (!window.activeTextEditor) window.activeTextEditor = { document };
    return document;
  },
  getConfiguration() {
    return { get(_key, fallback) { return fallback; } };
  },
  createFileSystemWatcher() {
    return {
      onDidCreate() { return disposable(); },
      onDidChange() { return disposable(); },
      onDidDelete() { return disposable(); },
      dispose() {},
    };
  },
  onDidChangeTextDocument() { return disposable(); },
  onDidCloseTextDocument() { return disposable(); },
  registerTextDocumentContentProvider(scheme, provider) {
    ensureState().contentProviders[scheme] = provider;
    return disposable(() => { delete ensureState().contentProviders[scheme]; });
  },
  onDidChangeWorkspaceFolders() { return disposable(); },
  onDidOpenTextDocument() { return disposable(); },
  onDidSaveTextDocument() { return disposable(); },
  onDidChangeConfiguration() { return disposable(); },
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
  async setTextDocumentLanguage(document, languageId) {
    document.languageId = languageId;
    if (document.uri.scheme === 'utu-generated') {
      ensureState().generatedDocuments.push({
        kind: new URLSearchParams(document.uri.query).get('kind'),
        content: document.getText(),
        languageId: document.languageId,
        uri: document.uri.toString(),
      });
    }
    return document;
  },
};

export const tests = {
  createTestController() {
    const items = new Map();
    return {
      items: {
        add(item) { items.set(item.id, item); },
        delete(id) { items.delete(id); },
        get(id) { return items.get(id); },
        forEach(callback) { items.forEach(callback); },
        [Symbol.iterator]: function* () { yield* items.values(); },
      },
      createTestItem(id, label, uri) {
        const children = new Map();
        return {
          id,
          label,
          uri,
          children: {
            get size() { return children.size; },
            replace(values) {
              children.clear();
              for (const value of values) children.set(value.id, value);
            },
            [Symbol.iterator]: function* () { yield* children.values(); },
          },
        };
      },
      createRunProfile() { return disposable(); },
      createTestRun() {
        return {
          started() {},
          appendOutput() {},
          failed() {},
          passed() {},
          errored() {},
          end() {},
        };
      },
      invalidateTestResults() {},
      resolveHandler: undefined,
      dispose() {},
    };
  },
};
`;

  await mkdir(stubPackageRoot, { recursive: true });
  await writeFile(resolve(stubPackageRoot, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
  await writeFile(resolve(stubPackageRoot, 'index.js'), source, 'utf8');
}

function createProgramDocument(programPath) {
  const uri = pathToFileURL(programPath);
  const source = 'fun main() i32 {\n    7;\n}\n';
  const lines = source.split(/\r?\n/);
  return {
    uri: {
      scheme: uri.protocol.slice(0, -1),
      path: uri.pathname,
      toString() {
        return uri.toString();
      },
      fsPath: programPath,
    },
    fileName: programPath,
    version: 1,
    languageId: 'utu',
    getText() {
      return source;
    },
    get lineCount() {
      return lines.length;
    },
    lineAt(line) {
      return { text: lines[line] ?? '' };
    },
  };
}
