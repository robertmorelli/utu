import process from 'node:process';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  UtuCompletionItem,
  UtuDiagnostic,
  UtuDocumentHighlight,
  UtuDocumentSymbol,
  UtuHover,
  UtuLocation,
  UtuRange,
  UtuSemanticToken,
  UtuWorkspaceSymbol,
} from '../core/types';
import { UtuLanguageServer } from './index';

type JsonRpcId = number | string | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

const COMPLETION_ITEM_KINDS: Record<UtuCompletionItem['kind'], number> = {
  text: 1,
  method: 2,
  function: 3,
  variable: 6,
  class: 7,
  module: 9,
  keyword: 14,
  enumMember: 20,
};

const DOCUMENT_SYMBOL_KINDS: Record<UtuDocumentSymbol['kind'], number> = {
  method: 6,
  function: 12,
  enum: 10,
  variable: 13,
  object: 19,
  enumMember: 22,
  struct: 23,
  event: 24,
};

const DOCUMENT_HIGHLIGHT_KINDS: Record<UtuDocumentHighlight['kind'], number> = {
  read: 2,
  write: 3,
};

const DIAGNOSTIC_SEVERITIES: Record<UtuDiagnostic['severity'], number> = {
  error: 1,
};

const SEMANTIC_TOKEN_TYPES = ['type', 'enumMember', 'function', 'parameter', 'variable', 'property'] as const;
const SEMANTIC_TOKEN_MODIFIERS = ['declaration'] as const;

const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  internalError: -32603,
  serverNotInitialized: -32002,
};

const SERVER_NAME = 'utu-lsp';
const SERVER_VERSION = '0.0.1';
const HEADER_SEPARATOR = Buffer.from('\r\n\r\n', 'ascii');

class JsonRpcConnection {
  private buffer = Buffer.alloc(0);

  constructor(
    private readonly onRequest: (request: JsonRpcRequest) => Promise<unknown>,
    private readonly onNotification: (notification: JsonRpcNotification) => Promise<void>,
  ) {
    process.stdin.on('data', (chunk) => {
      this.handleData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    process.stdin.on('error', (error) => {
      console.error('[utu-lsp] stdin error:', error);
    });
  }

  sendNotification(method: string, params?: unknown): void {
    this.send({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR);
      if (headerEnd < 0) {
        return;
      }

      const headerText = this.buffer.slice(0, headerEnd).toString('utf8');
      const contentLength = getContentLength(headerText);
      if (contentLength === undefined) {
        this.buffer = this.buffer.slice(headerEnd + HEADER_SEPARATOR.length);
        this.sendError(null, JSON_RPC_ERRORS.invalidRequest, 'Missing Content-Length header.');
        continue;
      }

      const bodyStart = headerEnd + HEADER_SEPARATOR.length;
      const bodyEnd = bodyStart + contentLength;
      if (this.buffer.length < bodyEnd) {
        return;
      }

      const body = this.buffer.slice(bodyStart, bodyEnd).toString('utf8');
      this.buffer = this.buffer.slice(bodyEnd);

      let message: unknown;
      try {
        message = JSON.parse(body);
      } catch (error) {
        this.sendError(null, JSON_RPC_ERRORS.parseError, 'Invalid JSON payload.', errorToData(error));
        continue;
      }

      void this.dispatch(message);
    }
  }

  private async dispatch(message: unknown): Promise<void> {
    if (!isObject(message) || message.jsonrpc !== '2.0') {
      this.sendError(null, JSON_RPC_ERRORS.invalidRequest, 'Expected a JSON-RPC 2.0 message.');
      return;
    }

    if (typeof message.method === 'string' && 'id' in message) {
      const request = message as JsonRpcRequest;

      try {
        const result = await this.onRequest(request);
        this.send({
          jsonrpc: '2.0',
          id: request.id,
          result,
        });
      } catch (error) {
        this.sendError(
          request.id,
          getErrorCode(error),
          error instanceof Error ? error.message : 'Request failed.',
          errorToData(error),
        );
      }

      return;
    }

    if (typeof message.method === 'string') {
      try {
        await this.onNotification(message as JsonRpcNotification);
      } catch (error) {
        console.error('[utu-lsp] notification failed:', error);
      }

      return;
    }

    if ('id' in message) {
      return;
    }

    this.sendError(null, JSON_RPC_ERRORS.invalidRequest, 'Invalid JSON-RPC message.');
  }

  private sendError(id: JsonRpcId, code: number, message: string, data?: unknown): void {
    this.send({
      jsonrpc: '2.0',
      id,
      error: data === undefined
        ? { code, message }
        : { code, message, data },
    });
  }

  private send(message: JsonRpcResponse | JsonRpcNotification): void {
    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`, 'utf8');
    process.stdout.write(payload);
  }
}

class UtuLspSession {
  private readonly server: UtuLanguageServer;
  private readonly connection: JsonRpcConnection;
  private initialized = false;
  private shutdownRequested = false;

  constructor() {
    this.server = new UtuLanguageServer({
      grammarWasmPath: resolveServerAssetPath(
        process.env.UTU_LSP_GRAMMAR_WASM,
        'tree-sitter-utu.wasm',
      ),
      runtimeWasmPath: resolveServerAssetPath(
        process.env.UTU_LSP_RUNTIME_WASM,
        'web-tree-sitter.wasm',
      ),
    });
    this.connection = new JsonRpcConnection(
      async (request) => this.handleRequest(request),
      async (notification) => this.handleNotification(notification),
    );
  }

  async handleRequest(request: JsonRpcRequest): Promise<unknown> {
    switch (request.method) {
      case 'initialize': {
        const workspaceFolders = getWorkspaceFolderUris(request.params);
        this.server.setWorkspaceFolders(workspaceFolders);
        this.initialized = true;

        return {
          capabilities: {
            textDocumentSync: {
              openClose: true,
              change: 2,
              save: {
                includeText: true,
              },
            },
            hoverProvider: true,
            definitionProvider: true,
            referencesProvider: true,
            documentHighlightProvider: true,
            completionProvider: {
              triggerCharacters: ['.'],
            },
            documentSymbolProvider: true,
            workspaceSymbolProvider: true,
            semanticTokensProvider: {
              legend: {
                tokenTypes: [...SEMANTIC_TOKEN_TYPES],
                tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS],
              },
              full: true,
            },
            workspace: {
              workspaceFolders: {
                supported: true,
                changeNotifications: true,
              },
            },
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
        };
      }
      case 'shutdown':
        this.shutdownRequested = true;
        return null;
      case 'textDocument/hover':
        this.assertInitialized();
        return toLspHover(
          await this.server.getHover(
            getRequiredTextDocumentUri(request.params),
            getRequiredPosition(request.params),
          ),
        );
      case 'textDocument/definition':
        this.assertInitialized();
        return toLspLocation(
          await this.server.getDefinition(
            getRequiredTextDocumentUri(request.params),
            getRequiredPosition(request.params),
          ),
        );
      case 'textDocument/references':
        this.assertInitialized();
        return (
          await this.server.getReferences(
            getRequiredTextDocumentUri(request.params),
            getRequiredPosition(request.params),
            getIncludeDeclaration(request.params),
          )
        ).map(toLspLocation);
      case 'textDocument/documentHighlight':
        this.assertInitialized();
        return (
          await this.server.getDocumentHighlights(
            getRequiredTextDocumentUri(request.params),
            getRequiredPosition(request.params),
          )
        ).map(toLspDocumentHighlight);
      case 'textDocument/completion':
        this.assertInitialized();
        return (
          await this.server.getCompletionItems(
            getRequiredTextDocumentUri(request.params),
            getRequiredPosition(request.params),
          )
        ).map(toLspCompletionItem);
      case 'textDocument/documentSymbol':
        this.assertInitialized();
        return (
          await this.server.getDocumentSymbols(getRequiredTextDocumentUri(request.params))
        ).map(toLspDocumentSymbol);
      case 'workspace/symbol':
        this.assertInitialized();
        return (
          await this.server.getWorkspaceSymbols(getWorkspaceSymbolQuery(request.params))
        ).map(toLspWorkspaceSymbol);
      case 'textDocument/semanticTokens/full':
        this.assertInitialized();
        return {
          data: encodeSemanticTokens(
            await this.server.getDocumentSemanticTokens(getRequiredTextDocumentUri(request.params)),
          ),
        };
      default:
        throw new JsonRpcError(
          JSON_RPC_ERRORS.methodNotFound,
          `Unsupported request: ${request.method}`,
        );
    }
  }

  async handleNotification(notification: JsonRpcNotification): Promise<void> {
    switch (notification.method) {
      case 'initialized':
      case '$/setTrace':
      case '$/cancelRequest':
        return;
      case 'textDocument/didOpen': {
        this.assertInitialized();
        const textDocument = getRequiredTextDocument(notification.params);
        const diagnostics = await this.server.openDocument({
          uri: textDocument.uri,
          version: textDocument.version,
          text: textDocument.text,
        });
        this.publishDiagnostics(textDocument.uri, diagnostics);
        return;
      }
      case 'textDocument/didChange': {
        this.assertInitialized();
        const textDocument = getRequiredTextDocument(notification.params);
        const contentChanges = getRequiredContentChanges(notification.params);
        const diagnostics = await this.server.updateDocument({
          uri: textDocument.uri,
          version: textDocument.version,
          changes: contentChanges.map((change) => ({
            text: change.text,
            range: change.range,
          })),
        });
        this.publishDiagnostics(textDocument.uri, diagnostics);
        return;
      }
      case 'textDocument/didSave': {
        this.assertInitialized();
        const uri = getRequiredTextDocumentUri(notification.params);
        const diagnostics = await this.server.saveDocument({
          uri,
          text: getOptionalText(notification.params),
        });
        this.publishDiagnostics(uri, diagnostics);
        return;
      }
      case 'textDocument/didClose': {
        this.assertInitialized();
        const uri = getRequiredTextDocumentUri(notification.params);
        this.server.closeDocument(uri);
        this.publishDiagnostics(uri, []);
        return;
      }
      case 'workspace/didChangeWorkspaceFolders': {
        this.assertInitialized();
        const { added, removed } = getWorkspaceFolderChanges(notification.params);
        this.server.addWorkspaceFolders(added);
        this.server.removeWorkspaceFolders(removed);
        return;
      }
      case 'workspace/didChangeConfiguration':
        return;
      case 'exit':
        this.exit();
        return;
      default:
        return;
    }
  }

  publishDiagnostics(uri: string, diagnostics: readonly UtuDiagnostic[]): void {
    this.connection.sendNotification('textDocument/publishDiagnostics', {
      uri,
      diagnostics: diagnostics.map(toLspDiagnostic),
    });
  }

  assertInitialized(): void {
    if (!this.initialized) {
      throw new JsonRpcError(
        JSON_RPC_ERRORS.serverNotInitialized,
        'The UTU language server has not been initialized yet.',
      );
    }
  }

  exit(): void {
    this.server.dispose();
    process.exit(this.shutdownRequested ? 0 : 1);
  }
}

class JsonRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function main(): void {
  process.stdin.resume();
  new UtuLspSession();
}

function resolveServerAssetPath(overridePath: string | undefined, assetName: string): string {
  if (overridePath) {
    return overridePath;
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDirectory = dirname(currentFilePath);
  return resolvePath(currentDirectory, assetName);
}

function getContentLength(headerText: string): number | undefined {
  const match = /Content-Length:\s*(\d+)/i.exec(headerText);
  if (!match) {
    return undefined;
  }

  return Number.parseInt(match[1], 10);
}

function getRequiredTextDocumentUri(params: unknown): string {
  const textDocument = getRequiredTextDocument(params);
  return textDocument.uri;
}

function getRequiredTextDocument(params: unknown): { uri: string; version: number; text: string } {
  if (!isObject(params) || !isObject(params.textDocument)) {
    throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, 'Missing textDocument payload.');
  }

  const uri = requireString(params.textDocument.uri, 'textDocument.uri');
  const version = typeof params.textDocument.version === 'number'
    ? params.textDocument.version
    : 0;
  const text = typeof params.textDocument.text === 'string'
    ? params.textDocument.text
    : '';

  return { uri, version, text };
}

function getRequiredPosition(params: unknown): { line: number; character: number } {
  if (!isObject(params) || !isObject(params.position)) {
    throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, 'Missing position payload.');
  }

  return {
    line: requireNumber(params.position.line, 'position.line'),
    character: requireNumber(params.position.character, 'position.character'),
  };
}

function getIncludeDeclaration(params: unknown): boolean {
  if (!isObject(params) || !isObject(params.context)) {
    return false;
  }

  return Boolean(params.context.includeDeclaration);
}

function getRequiredContentChanges(
  params: unknown,
): Array<{ text: string; range?: UtuRange }> {
  if (!isObject(params) || !Array.isArray(params.contentChanges)) {
    throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, 'Missing contentChanges payload.');
  }

  return params.contentChanges.map((change) => {
    if (!isObject(change) || typeof change.text !== 'string') {
      throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, 'Invalid content change payload.');
    }

    return {
      text: change.text,
      range: isRange(change.range) ? change.range : undefined,
    };
  });
}

function getWorkspaceSymbolQuery(params: unknown): string {
  if (!isObject(params) || typeof params.query !== 'string') {
    return '';
  }

  return params.query;
}

function getOptionalText(params: unknown): string | undefined {
  if (!isObject(params) || typeof params.text !== 'string') {
    return undefined;
  }

  return params.text;
}

function getWorkspaceFolderUris(params: unknown): string[] {
  if (isObject(params) && Array.isArray(params.workspaceFolders)) {
    return params.workspaceFolders
      .map((folder) => (isObject(folder) && typeof folder.uri === 'string' ? folder.uri : undefined))
      .filter((folder): folder is string => folder !== undefined);
  }

  if (isObject(params) && typeof params.rootUri === 'string' && params.rootUri.length > 0) {
    return [params.rootUri];
  }

  if (isObject(params) && typeof params.rootPath === 'string' && params.rootPath.length > 0) {
    return [pathToFileURL(resolvePath(params.rootPath)).toString()];
  }

  return [];
}

function getWorkspaceFolderChanges(params: unknown): { added: string[]; removed: string[] } {
  if (!isObject(params) || !isObject(params.event)) {
    return { added: [], removed: [] };
  }

  const added = Array.isArray(params.event.added)
    ? params.event.added
        .map((folder) => (isObject(folder) && typeof folder.uri === 'string' ? folder.uri : undefined))
        .filter((folder): folder is string => folder !== undefined)
    : [];
  const removed = Array.isArray(params.event.removed)
    ? params.event.removed
        .map((folder) => (isObject(folder) && typeof folder.uri === 'string' ? folder.uri : undefined))
        .filter((folder): folder is string => folder !== undefined)
    : [];

  return { added, removed };
}

function toLspRange(range: UtuRange): UtuRange {
  return {
    start: {
      line: range.start.line,
      character: range.start.character,
    },
    end: {
      line: range.end.line,
      character: range.end.character,
    },
  };
}

function toLspLocation(location: UtuLocation | undefined): { uri: string; range: UtuRange } | null {
  if (!location) {
    return null;
  }

  return {
    uri: location.uri,
    range: toLspRange(location.range),
  };
}

function toLspHover(
  hover: UtuHover | undefined,
): { contents: UtuHover['contents']; range: UtuRange } | null {
  if (!hover) {
    return null;
  }

  return {
    contents: hover.contents,
    range: toLspRange(hover.range),
  };
}

function toLspDiagnostic(diagnostic: UtuDiagnostic): {
  range: UtuRange;
  severity: number;
  source: string;
  message: string;
} {
  return {
    range: toLspRange(diagnostic.range),
    severity: DIAGNOSTIC_SEVERITIES[diagnostic.severity],
    source: diagnostic.source,
    message: diagnostic.message,
  };
}

function toLspDocumentHighlight(highlight: UtuDocumentHighlight): {
  range: UtuRange;
  kind: number;
} {
  return {
    range: toLspRange(highlight.range),
    kind: DOCUMENT_HIGHLIGHT_KINDS[highlight.kind],
  };
}

function toLspCompletionItem(item: UtuCompletionItem): {
  label: string;
  kind: number;
  detail?: string;
} {
  return {
    label: item.label,
    kind: COMPLETION_ITEM_KINDS[item.kind],
    detail: item.detail,
  };
}

function toLspDocumentSymbol(symbol: UtuDocumentSymbol): {
  name: string;
  detail: string;
  kind: number;
  range: UtuRange;
  selectionRange: UtuRange;
} {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: DOCUMENT_SYMBOL_KINDS[symbol.kind],
    range: toLspRange(symbol.range),
    selectionRange: toLspRange(symbol.selectionRange),
  };
}

function toLspWorkspaceSymbol(symbol: UtuWorkspaceSymbol): {
  name: string;
  kind: number;
  location: { uri: string; range: UtuRange };
  containerName: string;
} {
  return {
    name: symbol.name,
    kind: DOCUMENT_SYMBOL_KINDS[symbol.kind],
    location: {
      uri: symbol.location.uri,
      range: toLspRange(symbol.location.range),
    },
    containerName: symbol.detail,
  };
}

function encodeSemanticTokens(tokens: readonly UtuSemanticToken[]): number[] {
  const sortedTokens = [...tokens]
    .filter((token) => token.range.start.line === token.range.end.line)
    .filter((token) => token.range.end.character > token.range.start.character)
    .sort((left, right) => {
      if (left.range.start.line !== right.range.start.line) {
        return left.range.start.line - right.range.start.line;
      }

      return left.range.start.character - right.range.start.character;
    });
  const data: number[] = [];
  let previousLine = 0;
  let previousCharacter = 0;

  for (const token of sortedTokens) {
    const typeIndex = SEMANTIC_TOKEN_TYPES.indexOf(token.type as typeof SEMANTIC_TOKEN_TYPES[number]);
    if (typeIndex < 0) {
      continue;
    }

    const line = token.range.start.line;
    const character = token.range.start.character;
    const deltaLine = line - previousLine;
    const deltaCharacter = deltaLine === 0 ? character - previousCharacter : character;
    const length = token.range.end.character - token.range.start.character;
    let modifierMask = 0;

    for (const modifier of token.modifiers) {
      const modifierIndex = SEMANTIC_TOKEN_MODIFIERS.indexOf(
        modifier as typeof SEMANTIC_TOKEN_MODIFIERS[number],
      );

      if (modifierIndex >= 0) {
        modifierMask |= 1 << modifierIndex;
      }
    }

    data.push(deltaLine, deltaCharacter, length, typeIndex, modifierMask);
    previousLine = line;
    previousCharacter = character;
  }

  return data;
}

function isRange(value: unknown): value is UtuRange {
  return isObject(value)
    && isObject(value.start)
    && isObject(value.end)
    && typeof value.start.line === 'number'
    && typeof value.start.character === 'number'
    && typeof value.end.line === 'number'
    && typeof value.end.character === 'number';
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, `Expected ${fieldName} to be a string.`);
  }

  return value;
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number') {
    throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, `Expected ${fieldName} to be a number.`);
  }

  return value;
}

function getErrorCode(error: unknown): number {
  return error instanceof JsonRpcError
    ? error.code
    : JSON_RPC_ERRORS.internalError;
}

function errorToData(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

main();
