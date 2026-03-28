import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createSourceDocument, UtuParserService } from '../packages/document/index.js';
import { UtuLanguageService, UtuWorkspaceSymbolIndex } from '../packages/language-platform/index.js';
import { assertManagedTestModule } from './test-helpers.mjs';

assertManagedTestModule(import.meta.url);

const source = 'export fun main() i32 { 0; }';

async function main() {
  const packageMetadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  if (packageMetadata.main !== './dist/node/extension.cjs') {
    throw new Error(`Expected package.json main entry to target ./dist/node/extension.cjs, received ${JSON.stringify(packageMetadata.main)}`);
  }
  if (packageMetadata.browser !== './dist/web/extension.js') {
    throw new Error(`Expected package.json browser entry to target ./dist/web/extension.js, received ${JSON.stringify(packageMetadata.browser)}`);
  }
  await access(new URL('../dist/node/extension.cjs', import.meta.url));
  await access(new URL('../dist/web/extension.js', import.meta.url));

  const compiler = await import('../dist/compiler.web.mjs');
  const metadata = await compiler.get_metadata(source);
  if (!metadata.hasMain) {
    throw new Error('Web compiler self-check failed: expected built compiler bundle to report a runnable main.');
  }

  await assertBuiltExtensionBundleLoads();

  const [grammarWasmPath, runtimeWasmPath] = await Promise.all([
    readFile(new URL('../tree-sitter-utu.wasm', import.meta.url)),
    readFile(new URL('../web-tree-sitter.wasm', import.meta.url)),
  ]);
  const parserService = new UtuParserService({ grammarWasmPath, runtimeWasmPath });
  const languageService = new UtuLanguageService(parserService);
  const workspaceSymbols = new UtuWorkspaceSymbolIndex(languageService);

  try {
    await workspaceSymbols.syncDocuments([
      Object.assign(
        createSourceDocument(source, { uri: 'file:///activation-selfcheck.utu', version: 1 }),
        { languageId: 'utu' },
      ),
    ], { replace: true });
  } finally {
    languageService.dispose();
    parserService.dispose();
  }

  console.log('PASS vscode activation selfcheck');
}

async function assertBuiltExtensionBundleLoads() {
  const stubPackageRoot = resolve(new URL('../node_modules', import.meta.url).pathname, 'vscode');
  const packageJson = {
    name: 'vscode',
    type: 'module',
    exports: './index.js',
  };
  const compilerBundleUrl = new URL('../dist/compiler.web.mjs', import.meta.url).href;
  const grammarWasmUrl = new URL('../tree-sitter-utu.wasm', import.meta.url).href;
  const runtimeWasmUrl = new URL('../web-tree-sitter.wasm', import.meta.url).href;
  const source = `
export class Position { constructor(line, character) { this.line = line; this.character = character; } }
export class Range { constructor(start, end) { this.start = start; this.end = end; } }
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
export const StatusBarAlignment = { Left: 1 };
export const CompletionItemKind = { Class: 6, Function: 2, Keyword: 13, Method: 1, Module: 8, Variable: 5 };
export const SymbolKind = { Class: 4, Function: 11, Field: 7, Variable: 12, Module: 1, Struct: 22 };
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
export const DocumentHighlightKind = { Text: 0, Read: 1, Write: 2 };
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
  createOutputChannel() { return { appendLine() {}, dispose() {} }; },
  createStatusBarItem() { return { show() {}, hide() {}, dispose() {}, text: '', tooltip: '', name: '', command: undefined }; },
  onDidChangeActiveTextEditor() { return { dispose() {} }; },
  showErrorMessage: async () => undefined,
};
export const commands = {
  executeCommand: async () => undefined,
  registerCommand() { return { dispose() {} }; },
};
export const workspace = {
  workspaceFolders: [],
  textDocuments: [],
  fs: {
    async readFile(uri) {
      const href = String(uri);
      if (href.endsWith('/dist/compiler.web.mjs')) {
        return readFile(new URL(${JSON.stringify(compilerBundleUrl)}));
      }
      if (href.endsWith('/tree-sitter-utu.wasm')) {
        return readFile(new URL(${JSON.stringify(grammarWasmUrl)}));
      }
      if (href.endsWith('/web-tree-sitter.wasm')) {
        return readFile(new URL(${JSON.stringify(runtimeWasmUrl)}));
      }
      return new Uint8Array();
    },
  },
  onDidChangeTextDocument() { return { dispose() {} }; },
  onDidCloseTextDocument() { return { dispose() {} }; },
  registerTextDocumentContentProvider() { return { dispose() {} }; },
  onDidChangeWorkspaceFolders() { return { dispose() {} }; },
  createFileSystemWatcher() { return { onDidCreate() { return { dispose() {} }; }, onDidChange() { return { dispose() {} }; }, onDidDelete() { return { dispose() {} }; }, dispose() {} }; },
  onDidOpenTextDocument() { return { dispose() {} }; },
  onDidSaveTextDocument() { return { dispose() {} }; },
  onDidChangeConfiguration() { return { dispose() {} }; },
  getConfiguration() { return { get(_key, fallback) { return fallback; } }; },
  findFiles: async () => [],
};
export const languages = {
  createDiagnosticCollection() { return { set() {}, clear() {}, delete() {}, dispose() {} }; },
  registerHoverProvider() { return { dispose() {} }; },
  registerDefinitionProvider() { return { dispose() {} }; },
  registerReferenceProvider() { return { dispose() {} }; },
  registerDocumentHighlightProvider() { return { dispose() {} }; },
  registerCompletionItemProvider() { return { dispose() {} }; },
  registerDocumentSemanticTokensProvider() { return { dispose() {} }; },
  registerDocumentSymbolProvider() { return { dispose() {} }; },
  registerCodeLensProvider() { return { dispose() {} }; },
  registerWorkspaceSymbolProvider() { return { dispose() {} }; },
};
export const tests = {
  createTestController() {
    return {
      createRunProfile() { return { dispose() {} }; },
      createTestItem(id, label, uri) { return { id, label, uri, children: { replace() {}, size: 0, [Symbol.iterator]: function* () {} } }; },
      items: { replace() {}, add() {}, delete() {}, get() { return undefined; }, forEach() {}, [Symbol.iterator]: function* () {} },
      invalidateTestResults() {},
      dispose() {},
    };
  },
};
`;

  await mkdir(stubPackageRoot, { recursive: true });
  try {
    await writeFile(resolve(stubPackageRoot, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
    await writeFile(resolve(stubPackageRoot, 'index.js'), source, 'utf8');
    const runtimeGlobals = Function('return this')();
    const originalFetch = runtimeGlobals.fetch;
    try {
      runtimeGlobals.fetch = async (input) => {
        const href = String(input);
        const assetHref = href.endsWith('/dist/compiler.web.mjs')
          ? compilerBundleUrl
          : href.endsWith('/tree-sitter-utu.wasm')
          ? grammarWasmUrl
          : href.endsWith('/web-tree-sitter.wasm')
          ? runtimeWasmUrl
          : null;
        if (!assetHref) {
          if (typeof originalFetch === 'function') return originalFetch(input);
          throw new Error(`Unexpected fetch in activation self-check: ${href}`);
        }
        const body = await readFile(new URL(assetHref));
        return new Response(body, { status: 200 });
      };
      const bundles = await Promise.all([
        import(pathToFileURL(resolve(new URL('../dist/node/extension.cjs', import.meta.url).pathname)).href),
        import(pathToFileURL(resolve(new URL('../dist/web/extension.js', import.meta.url).pathname)).href),
      ]);
      for (const [label, bundle] of [['node', bundles[0]], ['web', bundles[1]]]) {
        const activate = bundle.activate ?? bundle.default?.activate;
        if (typeof activate !== 'function') {
          throw new Error(`Expected built ${label} extension bundle to export an activate() function.`);
        }
      }
      const webActivate = bundles[1].activate ?? bundles[1].default?.activate;
      await webActivate({
        extensionUri: new URL('https://example.test/extensions/utu/'),
        subscriptions: [],
      });
    } finally {
      runtimeGlobals.fetch = originalFetch;
    }
  } finally {
    await rm(stubPackageRoot, { recursive: true, force: true });
  }
}

await main();
