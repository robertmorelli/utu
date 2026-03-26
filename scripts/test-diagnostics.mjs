import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { UtuParserService, createSourceDocument } from '../parser.js';
import { UtuLanguageService } from '../lsp_core/languageService.js';
import {
  expectDeepEqual,
  getRepoRoot,
  runNamedCases,
} from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const fixture = buildDiagnosticFixture();
const failed = await runNamedCases([
  ['language service surfaces targeted diagnostics with tight ranges', testLanguageServiceDiagnostics],
  ['lsp publishes the same targeted diagnostics', testLspDiagnostics],
  ['vs code diagnostics controller surfaces the same targeted diagnostics', testExtensionDiagnostics],
]);
if (failed)
  process.exit(1);

async function testLanguageServiceDiagnostics() {
  const parserService = createParserService();
  const languageService = new UtuLanguageService(parserService);
  try {
    const diagnostics = await languageService.getDiagnostics(createDocument(fixture.source));
    expectDeepEqual(toComparableDiagnostics(diagnostics), fixture.expectedDiagnostics);
  } finally {
    languageService.dispose();
    parserService.dispose();
  }
}

async function testLspDiagnostics() {
  const lspPath = resolve(repoRoot, 'lsp.mjs');
  const proc = spawn('bun', [lspPath], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const session = createJsonRpcSession(proc);
  try {
    session.sendRequest('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(repoRoot).toString(),
      capabilities: {},
      workspaceFolders: [{ uri: pathToFileURL(repoRoot).toString(), name: 'utu' }],
    });
    await session.waitFor((message) => message.id === 1);
    session.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: fixture.uri,
        languageId: 'utu',
        version: 1,
        text: fixture.source,
      },
    });
    const publish = await session.waitFor((message) => message.method === 'textDocument/publishDiagnostics');
    expectDeepEqual(
      toComparableDiagnostics(publish.params?.diagnostics ?? []),
      fixture.expectedDiagnostics,
    );
  } finally {
    proc.kill('SIGTERM');
  }
}

async function testExtensionDiagnostics() {
  const stubPackageRoot = resolve(repoRoot, 'node_modules/vscode');
  globalThis.__utuVscodeTestState = { textDocuments: [], diagnosticsByUri: new Map() };
  await writeFakeVscodePackage(stubPackageRoot);
  const parserService = createParserService();
  const languageService = new UtuLanguageService(parserService);
  let controller;
  try {
    const { DiagnosticsController } = await import(pathToFileURL(resolve(repoRoot, 'extension/diagnostics.js')).href);
    const document = Object.assign(createDocument(fixture.source), { languageId: 'utu' });
    globalThis.__utuVscodeTestState.textDocuments.push(document);
    controller = new DiagnosticsController(languageService, { appendLine() {}, show() {} }, undefined);
    await waitFor(() => globalThis.__utuVscodeTestState.diagnosticsByUri.has(fixture.uri));
    expectDeepEqual(
      toComparableDiagnostics(globalThis.__utuVscodeTestState.diagnosticsByUri.get(fixture.uri) ?? []),
      fixture.expectedDiagnostics,
    );
  } finally {
    controller?.dispose?.();
    languageService.dispose();
    parserService.dispose();
    delete globalThis.__utuVscodeTestState;
    await rm(stubPackageRoot, { recursive: true, force: true });
  }
}

function createParserService() {
  return new UtuParserService({
    grammarWasmPath: resolve(repoRoot, 'tree-sitter-utu.wasm'),
    runtimeWasmPath: resolve(repoRoot, 'web-tree-sitter.wasm'),
  });
}

function createDocument(text) {
  return createSourceDocument(text, { uri: fixture.uri, version: 1 });
}

function buildDiagnosticFixture() {
  const annotatedSource = `mod math {
    struct Pair {
        left: i32,
        right: i32,
    }

    fun Pair.new(left: i32, right: i32) Pair {
        Pair { left: left, right: right };
    }

    fun Pair.sum(self: Pair) i32 {
        self.left + self.right;
    }

    fun inc(value: i32) i32 {
        value + 1;
    }
}

fun undefined_value() i32 {
    [[undefined_value|missing_value]];
}

fun undefined_function() i32 {
    [[undefined_function|missing_fn]]();
}

fun undefined_type(value: [[undefined_type|MissingType]]) i32 {
    0;
}

fun unknown_namespace() i32 {
    let pair: [[unknown_namespace|missing_mod]].Pair = 0;
    0;
}

fun unknown_qualified_type() i32 {
    let pair: math.[[unknown_qualified_type|Missing]] = 0;
    0;
}

fun unknown_namespace_member() i32 {
    math.[[unknown_namespace_member|nope]](1);
}

fun unknown_field_access(pair: math.Pair) i32 {
    pair.[[unknown_field_access|nope]];
}

fun unknown_field_init() math.Pair {
    math.Pair { left: 1, [[unknown_field_init|nope]]: 2 };
}

fun unknown_value_method(pair: math.Pair) i32 {
    pair.[[unknown_value_method|nope]]();
}

fun unknown_type_assoc() math.Pair {
    math.Pair.[[unknown_type_assoc|nope]](1, 2);
}
`;
  const { source, ranges } = parseAnnotatedSource(annotatedSource);
  return {
    uri: 'file:///diagnostics.utu',
    source,
    expectedDiagnostics: [
      createExpectedDiagnostic('undefined_value', 'Undefined value "missing_value".', ranges),
      createExpectedDiagnostic('undefined_function', 'Undefined function or import "missing_fn".', ranges),
      createExpectedDiagnostic('undefined_type', 'Undefined type "MissingType".', ranges),
      createExpectedDiagnostic('unknown_namespace', 'Unknown module or construct alias "missing_mod".', ranges),
      createExpectedDiagnostic('unknown_qualified_type', 'Unknown type "Missing" in namespace "math".', ranges),
      createExpectedDiagnostic('unknown_namespace_member', 'Unknown member "nope" in namespace "math".', ranges),
      createExpectedDiagnostic('unknown_field_access', 'Unknown field "nope" on type "math.Pair".', ranges),
      createExpectedDiagnostic('unknown_field_init', 'Unknown field "nope" in struct initializer for "math.Pair".', ranges),
      createExpectedDiagnostic('unknown_value_method', 'Unknown method "nope" on type "math.Pair".', ranges),
      createExpectedDiagnostic('unknown_type_assoc', 'Unknown associated function "nope" on type "math.Pair".', ranges),
    ],
  };
}

function parseAnnotatedSource(annotatedSource) {
  const ranges = new Map();
  let source = '';
  let index = 0;
  while (index < annotatedSource.length) {
    const markerStart = annotatedSource.indexOf('[[', index);
    if (markerStart < 0) {
      source += annotatedSource.slice(index);
      break;
    }
    source += annotatedSource.slice(index, markerStart);
    const markerEnd = annotatedSource.indexOf(']]', markerStart);
    if (markerEnd < 0)
      throw new Error('Unclosed diagnostics marker.');
    const marker = annotatedSource.slice(markerStart + 2, markerEnd);
    const separator = marker.indexOf('|');
    if (separator < 0)
      throw new Error(`Invalid diagnostics marker: ${marker}`);
    const label = marker.slice(0, separator);
    const text = marker.slice(separator + 1);
    const startOffset = source.length;
    source += text;
    ranges.set(label, { startOffset, endOffset: startOffset + text.length });
    index = markerEnd + 2;
  }
  const document = createSourceDocument(source, { uri: 'file:///diagnostics.utu', version: 1 });
  return {
    source,
    ranges: new Map([...ranges.entries()].map(([label, { startOffset, endOffset }]) => [
      label,
      {
        start: document.positionAt(startOffset),
        end: document.positionAt(endOffset),
      },
    ])),
  };
}

function createExpectedDiagnostic(label, message, ranges) {
  const range = ranges.get(label);
  if (!range)
    throw new Error(`Missing expected range for ${label}.`);
  return { message, range, source: 'utu' };
}

function toComparableDiagnostics(diagnostics) {
  return diagnostics.map((diagnostic) => ({
    message: diagnostic.message,
    range: simplifyRange(diagnostic.range),
    source: diagnostic.source,
  }));
}

function simplifyRange(range) {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

function createJsonRpcSession(proc) {
  let nextRequestId = 1;
  let stdoutBuffer = Buffer.alloc(0);
  let stderrBuffer = '';
  const queuedMessages = [];
  const waiters = [];
  proc.stdout.on('data', (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    drainStdout();
  });
  proc.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString('utf8');
  });
  proc.on('exit', (code, signal) => {
    if (!waiters.length)
      return;
    const error = new Error(`LSP exited before the expected message arrived (code=${code}, signal=${signal}).${stderrBuffer ? `\n${stderrBuffer}` : ''}`);
    while (waiters.length)
      waiters.shift()?.reject(error);
  });
  return {
    sendRequest(method, params) {
      const id = nextRequestId;
      nextRequestId += 1;
      writeJsonRpcMessage(proc.stdin, { jsonrpc: '2.0', id, method, params });
      return id;
    },
    sendNotification(method, params) {
      writeJsonRpcMessage(proc.stdin, { jsonrpc: '2.0', method, params });
    },
    waitFor(predicate, timeoutMs = 5000) {
      const queuedIndex = queuedMessages.findIndex(predicate);
      if (queuedIndex >= 0)
        return Promise.resolve(queuedMessages.splice(queuedIndex, 1)[0]);
      return new Promise((resolvePromise, rejectPromise) => {
        const timeout = setTimeout(() => {
          const waiterIndex = waiters.findIndex((waiter) => waiter.resolve === resolvePromise);
          if (waiterIndex >= 0)
            waiters.splice(waiterIndex, 1);
          rejectPromise(new Error(`Timed out waiting for JSON-RPC message.${stderrBuffer ? `\n${stderrBuffer}` : ''}`));
        }, timeoutMs);
        waiters.push({
          predicate,
          resolve(message) {
            clearTimeout(timeout);
            resolvePromise(message);
          },
          reject(error) {
            clearTimeout(timeout);
            rejectPromise(error);
          },
        });
      });
    },
  };

  function drainStdout() {
    while (true) {
      const headerEnd = stdoutBuffer.indexOf('\r\n\r\n');
      if (headerEnd < 0)
        return;
      const headerText = stdoutBuffer.slice(0, headerEnd).toString('utf8');
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(headerText);
      if (!lengthMatch)
        throw new Error(`Missing Content-Length header in LSP output: ${headerText}`);
      const contentLength = Number.parseInt(lengthMatch[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      if (stdoutBuffer.length < bodyEnd)
        return;
      const message = JSON.parse(stdoutBuffer.slice(bodyStart, bodyEnd).toString('utf8'));
      stdoutBuffer = stdoutBuffer.slice(bodyEnd);
      deliverMessage(message);
    }
  }

  function deliverMessage(message) {
    const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiterIndex >= 0) {
      waiters.splice(waiterIndex, 1)[0].resolve(message);
      return;
    }
    queuedMessages.push(message);
  }
}

function writeJsonRpcMessage(stdin, message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  stdin.write(`Content-Length: ${payload.length}\r\n\r\n`, 'utf8');
  stdin.write(payload);
}

async function writeFakeVscodePackage(stubPackageRoot) {
  const packageJson = {
    name: 'vscode',
    type: 'module',
    exports: './index.js',
  };
  const source = `
const state = globalThis.__utuVscodeTestState ??= { textDocuments: [], diagnosticsByUri: new Map() };

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

export class Diagnostic {
  constructor(range, message, severity) {
    this.range = range;
    this.message = message;
    this.severity = severity;
    this.source = undefined;
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

export const CompletionItemKind = { Class: 6, Function: 2, Keyword: 13, Method: 1, Module: 8, Variable: 5, Text: 0, Event: 23, Object: 19, EnumMember: 20 };
export const SymbolKind = { Class: 4, Function: 11, Field: 7, Variable: 12, Module: 1, Struct: 22, Method: 6, Event: 24, Object: 19, Enum: 10, EnumMember: 21 };
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };

export const workspace = {
  textDocuments: state.textDocuments,
  getConfiguration() {
    return { get(_key, fallback) { return fallback; } };
  },
  onDidOpenTextDocument() { return disposable(); },
  onDidChangeTextDocument() { return disposable(); },
  onDidSaveTextDocument() { return disposable(); },
  onDidCloseTextDocument() { return disposable(); },
  onDidChangeConfiguration() { return disposable(); },
};

export const languages = {
  createDiagnosticCollection() {
    return {
      set(uri, diagnostics) {
        state.diagnosticsByUri.set(String(uri), diagnostics);
      },
      clear() {
        state.diagnosticsByUri.clear();
      },
      delete(uri) {
        state.diagnosticsByUri.delete(String(uri));
      },
      dispose() {},
    };
  },
};
`;
  await mkdir(stubPackageRoot, { recursive: true });
  await writeFile(resolve(stubPackageRoot, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
  await writeFile(resolve(stubPackageRoot, 'index.js'), source, 'utf8');
}

async function waitFor(check, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check())
      return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error('Timed out waiting for diagnostics.');
}
