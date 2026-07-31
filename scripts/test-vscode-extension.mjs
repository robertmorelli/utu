import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const vscodeDir = path.join(ROOT, 'node_modules', 'vscode');
const packageFile = path.join(vscodeDir, 'package.json');
const stubFile = path.join(vscodeDir, 'index.cjs');

await assertManifest();
await fs.access(path.join(ROOT, 'dist', 'utu.js'));
await fs.access(path.join(ROOT, 'dist', 'node', 'extension.cjs'));
await fs.access(path.join(ROOT, 'dist', 'web', 'extension.cjs'));
await fs.access(path.join(ROOT, 'jsondata', 'utu.tmLanguage.json'));

try {
  await fs.access(packageFile);
  throw new Error('test:vscode refuses to overwrite an installed vscode module');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await fs.mkdir(vscodeDir, { recursive: true });
await fs.writeFile(packageFile, JSON.stringify({ name: 'vscode', version: '0.0.0-test', main: './index.cjs' }));
await fs.writeFile(stubFile, vscodeStub());

try {
  const vscode = await import(pathToFileURL(stubFile).href);
  const nodeBundle = await import(`${pathToFileURL(path.join(ROOT, 'dist', 'node', 'extension.cjs')).href}?test=${Date.now()}`);
  const webBundle = await import(`${pathToFileURL(path.join(ROOT, 'dist', 'web', 'extension.cjs')).href}?test=${Date.now()}`);
  const nodeActivate = nodeBundle.activate ?? nodeBundle.default?.activate;
  const webActivate = webBundle.activate ?? webBundle.default?.activate;
  if (typeof nodeActivate !== 'function' || typeof webActivate !== 'function') {
    throw new Error('desktop and web bundles must export activate()');
  }

  const context = { subscriptions: [], extensionUri: vscode.Uri.parse(`${pathToFileURL(ROOT).href}/`) };
  await nodeActivate(context);
  const commands = globalThis.__utuVscodeStub.commands;
  for (const name of ['utu.compileCurrentFile', 'utu.runMain', 'utu.showGeneratedWat', 'utu.showSyntaxTree', 'utu.showCompilerIR', 'utu.showSemanticXray', 'utu.showCompilerGraphs']) {
    if (!commands.has(name)) throw new Error(`activation did not register ${name}`);
  }

  const source = 'export main() I32 { let x: I32 = 41; x + 1; }';
  const document = makeDocument(vscode.Uri.parse('file:///activation.utu'), source);
  globalThis.__utuVscodeStub.textDocuments.push(document);
  const providers = globalThis.__utuVscodeStub.providers;
  const hover = await providers.hover.provideHover(document, document.positionAt(source.indexOf('x +')));
  if (!hover?.contents?.value?.includes('I32')) throw new Error('semantic hover did not expose the inferred type');
  const definition = await providers.definition.provideDefinition(document, document.positionAt(source.indexOf('x +')));
  if (!definition?.range) throw new Error('go to definition did not resolve a local');
  const references = await providers.references.provideReferences(document, document.positionAt(source.indexOf('x +')), { includeDeclaration: true });
  if (references.length !== 2) throw new Error(`find references returned ${references.length} entries instead of 2`);
  const hierarchy = await providers.calls.prepareCallHierarchy(document, document.positionAt(source.indexOf('main')));
  if (hierarchy?.name !== 'main') throw new Error('call hierarchy did not resolve main');
  const binary = await commands.get('utu.compileCurrentFile')(document);
  if (!(binary instanceof Uint8Array) || binary.length === 0) throw new Error('compile command did not return Wasm');
  const result = await commands.get('utu.runMain')(document);
  if (result !== 42) throw new Error(`runMain returned ${String(result)} instead of 42`);

  (nodeBundle.deactivate ?? nodeBundle.default?.deactivate)?.();
  for (const disposable of context.subscriptions.reverse()) disposable?.dispose?.();
  globalThis.__utuVscodeStub.textDocuments.length = 0;

  const webContext = { subscriptions: [], extensionUri: vscode.Uri.parse(`${pathToFileURL(ROOT).href}/`) };
  await webActivate(webContext);
  const webDocument = makeDocument(vscode.Uri.parse('file:///web-activation.utu'), 'export main() I32 { 43; }');
  globalThis.__utuVscodeStub.textDocuments.push(webDocument);
  const webBinary = await commands.get('utu.compileCurrentFile')(webDocument);
  if (!(webBinary instanceof Uint8Array) || webBinary.length === 0) throw new Error('web compile command did not return Wasm');
  const webResult = await commands.get('utu.runMain')(webDocument);
  if (webResult !== 43) throw new Error(`web runMain returned ${String(webResult)} instead of 43`);
  (webBundle.deactivate ?? webBundle.default?.deactivate)?.();
  for (const disposable of webContext.subscriptions.reverse()) disposable?.dispose?.();

  console.log('PASS vscode desktop/web activation and current-compiler command smoke test');
} finally {
  delete globalThis.__utuVscodeStub;
  await fs.rm(vscodeDir, { recursive: true, force: true });
}

async function assertManifest() {
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  if (manifest.main !== './dist/node/extension.cjs') throw new Error('package main is not the desktop extension');
  if (manifest.browser !== './dist/web/extension.cjs') throw new Error('package browser is not the web extension');
  if (!manifest.contributes?.languages?.some(language => language.id === 'utu')) throw new Error('manifest does not contribute the utu language');
  if (!manifest.contributes?.grammars?.some(grammar => grammar.language === 'utu')) throw new Error('manifest does not contribute the utu grammar');
}

function makeDocument(uri, source) {
  return {
    uri,
    languageId: 'utu',
    version: 1,
    fileName: uri.fsPath,
    getText: () => source,
    offsetAt(position) {
      const lines = source.split('\n');
      let offset = 0;
      for (let i = 0; i < position.line; i++) offset += lines[i].length + 1;
      return offset + position.character;
    },
    positionAt(offset) {
      const prefix = source.slice(0, Math.max(0, offset));
      const lines = prefix.split('\n');
      return new globalThis.__utuVscodeStub.Position(lines.length - 1, lines.at(-1).length);
    },
  };
}

function vscodeStub() {
  return String.raw`
class Disposable { constructor(dispose = () => {}) { this.dispose = dispose; } }
class EventEmitter { constructor() { this.listeners = new Set(); this.event = listener => { this.listeners.add(listener); return new Disposable(() => this.listeners.delete(listener)); }; } fire(value) { for (const listener of this.listeners) listener(value); } dispose() { this.listeners.clear(); } }
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range { constructor(start, end) { this.start = start; this.end = end; } }
class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
class DiagnosticRelatedInformation { constructor(location, message) { this.location = location; this.message = message; } }
class Location { constructor(uri, range) { this.uri = uri; this.range = range; } }
class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
class MarkdownString { constructor(value = '') { this.value = value; } }
class InlayHint { constructor(position, label, kind) { this.position = position; this.label = label; this.kind = kind; } }
class CallHierarchyItem { constructor(kind, name, detail, uri, range, selectionRange) { Object.assign(this, { kind, name, detail, uri, range, selectionRange }); } }
class CallHierarchyIncomingCall { constructor(from, fromRanges) { Object.assign(this, { from, fromRanges }); } }
class CallHierarchyOutgoingCall { constructor(to, fromRanges) { Object.assign(this, { to, fromRanges }); } }
class Uri {
  constructor(value) { this.value = String(value); const url = new URL(this.value); this.scheme = url.protocol.slice(0, -1); this.fsPath = decodeURIComponent(url.pathname); }
  toString() { return this.value; }
  static parse(value) { return new Uri(value); }
  static joinPath(base, ...parts) { const url = new URL(base.toString()); url.pathname = [url.pathname.replace(/\/$/, ''), ...parts].join('/'); return new Uri(url.toString()); }
}
const state = globalThis.__utuVscodeStub = { commands: new Map(), providers: {}, textDocuments: [], Position };
const event = () => new Disposable();
const output = { lines: [], appendLine(line) { this.lines.push(line); }, show() {}, dispose() {} };
const workspace = {
  get textDocuments() { return state.textDocuments; },
  fs: { async readFile() { throw new Error('unexpected workspace file read'); } },
  registerTextDocumentContentProvider: event,
  onDidOpenTextDocument: event, onDidChangeTextDocument: event, onDidSaveTextDocument: event,
  onDidCloseTextDocument: event, onDidChangeConfiguration: event,
  getConfiguration() { return { get(_key, fallback) { return fallback; } }; },
  async openTextDocument() { throw new Error('unexpected openTextDocument'); },
};
const window = {
  activeTextEditor: undefined,
  createOutputChannel() { return output; },
  onDidChangeActiveTextEditor: event, onDidChangeTextEditorSelection: event,
  setStatusBarMessage() {},
  async showErrorMessage(message) { throw new Error(message); },
  async showWarningMessage() {},
  async showTextDocument() {},
};
const commands = {
  registerCommand(name, callback) { state.commands.set(name, callback); return new Disposable(() => state.commands.delete(name)); },
  async executeCommand() {},
};
const provider = key => (_selector, value) => { state.providers[key] = value; return new Disposable(() => delete state.providers[key]); };
const languages = {
  createDiagnosticCollection() { return { set() {}, delete() {}, clear() {}, dispose() {} }; },
  registerHoverProvider: provider('hover'), registerDefinitionProvider: provider('definition'), registerReferenceProvider: provider('references'),
  registerInlayHintsProvider: provider('inlays'), registerCallHierarchyProvider: provider('calls'),
  async setTextDocumentLanguage(document) { return document; },
};
module.exports = {
  Disposable, EventEmitter, Position, Range, Diagnostic, DiagnosticRelatedInformation, Location,
  Hover, MarkdownString, InlayHint, CallHierarchyItem, CallHierarchyIncomingCall, CallHierarchyOutgoingCall, Uri,
  workspace, window, commands, languages,
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
  InlayHintKind: { Type: 1, Parameter: 2 }, SymbolKind: { Function: 11 },
  ViewColumn: { Beside: 2 },
};
`;
}
