import process from 'node:process';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  copyRange,
  type UtuCompletionItem,
  type UtuDiagnostic,
  type UtuDocumentHighlight,
  type UtuDocumentSymbol,
  type UtuHover,
  type UtuLocation,
  type UtuRange,
  type UtuSemanticToken,
  type UtuWorkspaceSymbol,
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

const SEMANTIC_TOKEN_TYPES = [
  'type',
  'enumMember',
  'function',
  'parameter',
  'variable',
  'property',
] as const;

const SEMANTIC_TOKEN_MODIFIERS = ['declaration'] as const;

const SEMANTIC_TOKEN_TYPE_INDEX = Object.fromEntries(
  SEMANTIC_TOKEN_TYPES.map((type, index) => [type, index]),
) as Record<string, number>;

const SEMANTIC_TOKEN_MODIFIER_MASKS = Object.fromEntries(
  SEMANTIC_TOKEN_MODIFIERS.map((modifier, index) => [modifier, 1 << index]),
) as Record<string, number>;

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
const INITIALIZE_RESULT = {
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
        this.sendError(
          null,
          JSON_RPC_ERRORS.parseError,
          'Invalid JSON payload.',
          errorToData(error),
        );
        continue;
      }

      void this.dispatch(message);
    }
  }

  private async dispatch(message: unknown): Promise<void> {
    if (!isJsonRpcMessage(message)) {
      this.sendError(null, JSON_RPC_ERRORS.invalidRequest, 'Expected a JSON-RPC 2.0 message.');
      return;
    }

    if (isJsonRpcRequest(message)) {
      try {
        const result = await this.onRequest(message);
        this.send({
          jsonrpc: '2.0',
          id: message.id,
          result,
        });
      } catch (error) {
        this.sendError(
          message.id,
          getErrorCode(error),
          error instanceof Error ? error.message : 'Request failed.',
          errorToData(error),
        );
      }

      return;
    }

    if (isJsonRpcNotification(message)) {
      try {
        await this.onNotification(message);
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
      error: data === undefined ? { code, message } : { code, message, data },
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
      grammarWasmPath: resolveServerAssetPath('tree-sitter-utu.wasm'),
      runtimeWasmPath: resolveServerAssetPath('web-tree-sitter.wasm'),
    });
    this.connection = new JsonRpcConnection(
      (request) => this.handleRequest(request),
      (notification) => this.handleNotification(notification),
    );
  }

  async handleRequest({ method, params }: JsonRpcRequest): Promise<unknown> {
    switch (method) {
      case 'initialize':
        this.server.setWorkspaceFolders(getWorkspaceFolderUris(params));
        this.initialized = true;
        return INITIALIZE_RESULT;
      case 'shutdown':
        this.shutdownRequested = true;
        return null;
      case 'textDocument/hover':
        return this.requireInitialized(async () =>
          toLspHover(
            await this.server.getHover(
              getRequiredTextDocumentUri(params),
              getRequiredPosition(params),
            ),
          ),
        );
      case 'textDocument/definition':
        return this.requireInitialized(async () =>
          toLspLocation(
            await this.server.getDefinition(
              getRequiredTextDocumentUri(params),
              getRequiredPosition(params),
            ),
          ),
        );
      case 'textDocument/references':
        return this.requireInitialized(async () =>
          (
            await this.server.getReferences(
              getRequiredTextDocumentUri(params),
              getRequiredPosition(params),
              getIncludeDeclaration(params),
            )
          ).map(toLspLocation),
        );
      case 'textDocument/documentHighlight':
        return this.requireInitialized(async () =>
          (
            await this.server.getDocumentHighlights(
              getRequiredTextDocumentUri(params),
              getRequiredPosition(params),
            )
          ).map(toLspDocumentHighlight),
        );
      case 'textDocument/completion':
        return this.requireInitialized(async () =>
          (
            await this.server.getCompletionItems(
              getRequiredTextDocumentUri(params),
              getRequiredPosition(params),
            )
          ).map(toLspCompletionItem),
        );
      case 'textDocument/documentSymbol':
        return this.requireInitialized(async () =>
          (
            await this.server.getDocumentSymbols(getRequiredTextDocumentUri(params))
          ).map(toLspDocumentSymbol),
        );
      case 'workspace/symbol':
        return this.requireInitialized(async () =>
          (
            await this.server.getWorkspaceSymbols(getWorkspaceSymbolQuery(params))
          ).map(toLspWorkspaceSymbol),
        );
      case 'textDocument/semanticTokens/full':
        return this.requireInitialized(async () => ({
          data: encodeSemanticTokens(
            await this.server.getDocumentSemanticTokens(getRequiredTextDocumentUri(params)),
          ),
        }));
      default:
        throw new JsonRpcError(JSON_RPC_ERRORS.methodNotFound, `Unsupported request: ${method}`);
    }
  }

  async handleNotification({ method, params }: JsonRpcNotification): Promise<void> {
    switch (method) {
      case 'initialized':
      case '$/setTrace':
      case '$/cancelRequest':
      case 'workspace/didChangeConfiguration':
        return;
      case 'textDocument/didOpen':
        return this.requireInitialized(async () => {
          const textDocument = getRequiredTextDocument(params);
          await this.publishDocumentDiagnostics(
            textDocument.uri,
            () => this.server.openDocument(textDocument),
          );
        });
      case 'textDocument/didChange':
        return this.requireInitialized(async () => {
          const textDocument = getRequiredTextDocument(params);
          await this.publishDocumentDiagnostics(textDocument.uri, () =>
            this.server.updateDocument({
              uri: textDocument.uri,
              version: textDocument.version,
              changes: getRequiredContentChanges(params),
            }),
          );
        });
      case 'textDocument/didSave':
        return this.requireInitialized(async () => {
          const uri = getRequiredTextDocumentUri(params);
          await this.publishDocumentDiagnostics(uri, () =>
            this.server.saveDocument({
              uri,
              text: getOptionalText(params),
            }),
          );
        });
      case 'textDocument/didClose':
        return this.requireInitialized(async () => {
          const uri = getRequiredTextDocumentUri(params);
          this.server.closeDocument(uri);
          this.publishDiagnostics(uri, []);
        });
      case 'workspace/didChangeWorkspaceFolders':
        return this.requireInitialized(async () => {
          const { added, removed } = getWorkspaceFolderChanges(params);
          this.server.addWorkspaceFolders(added);
          this.server.removeWorkspaceFolders(removed);
        });
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

  private async requireInitialized<T>(callback: () => Promise<T>): Promise<T> {
    this.assertInitialized();
    return callback();
  }

  private async publishDocumentDiagnostics(
    uri: string,
    loadDiagnostics: () => Promise<readonly UtuDiagnostic[]>,
  ): Promise<void> {
    this.publishDiagnostics(uri, await loadDiagnostics());
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

function resolveServerAssetPath(assetName: string): string {
  return resolvePath(dirname(fileURLToPath(import.meta.url)), assetName);
}

function getContentLength(headerText: string): number | undefined {
  const match = /Content-Length:\s*(\d+)/i.exec(headerText);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function getRequiredTextDocumentUri(params: unknown): string {
  return getRequiredTextDocument(params).uri;
}

function getRequiredTextDocument(
  params: unknown,
): { uri: string; version: number; text: string } {
  if (!isObject(params) || !isObject(params.textDocument)) {
    throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, 'Missing textDocument payload.');
  }

  return {
    uri: requireString(params.textDocument.uri, 'textDocument.uri'),
    version: typeof params.textDocument.version === 'number' ? params.textDocument.version : 0,
    text: typeof params.textDocument.text === 'string' ? params.textDocument.text : '',
  };
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
  return Boolean(isObject(params) && isObject(params.context) && params.context.includeDeclaration);
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
  return isObject(params) && typeof params.query === 'string' ? params.query : '';
}

function getOptionalText(params: unknown): string | undefined {
  return isObject(params) && typeof params.text === 'string' ? params.text : undefined;
}

function getWorkspaceFolderUris(params: unknown): string[] {
  if (!isObject(params)) {
    return [];
  }

  const folders = readFolderUris(params.workspaceFolders);
  if (folders.length > 0) return folders;
  if (typeof params.rootUri === 'string' && params.rootUri.length > 0) return [params.rootUri];
  if (typeof params.rootPath === 'string' && params.rootPath.length > 0) {
    return [pathToFileURL(resolvePath(params.rootPath)).toString()];
  }
  return [];
}

function getWorkspaceFolderChanges(params: unknown): { added: string[]; removed: string[] } {
  if (!isObject(params) || !isObject(params.event)) {
    return { added: [], removed: [] };
  }

  return {
    added: readFolderUris(params.event.added),
    removed: readFolderUris(params.event.removed),
  };
}

function readFolderUris(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((folder) =>
        isObject(folder) && typeof folder.uri === 'string' ? [folder.uri] : [],
      )
    : [];
}

function toLspLocation(location: UtuLocation | undefined): { uri: string; range: UtuRange } | null {
  return mapNullable(location, (value) => ({
    uri: value.uri,
    range: copyRange(value.range),
  }));
}

function toLspHover(
  hover: UtuHover | undefined,
): { contents: UtuHover['contents']; range: UtuRange } | null {
  return mapNullable(hover, (value) => ({
    contents: value.contents,
    range: copyRange(value.range),
  }));
}

function toLspDiagnostic(diagnostic: UtuDiagnostic): {
  range: UtuRange;
  severity: number;
  source: string;
  message: string;
} {
  return {
    range: copyRange(diagnostic.range),
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
    range: copyRange(highlight.range),
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
    range: copyRange(symbol.range),
    selectionRange: copyRange(symbol.selectionRange),
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
      range: copyRange(symbol.location.range),
    },
    containerName: symbol.detail,
  };
}

function encodeSemanticTokens(tokens: readonly UtuSemanticToken[]): number[] {
  const sortedTokens = [...tokens]
    .filter(isEncodableSemanticToken)
    .sort(compareSemanticTokens);

  const data: number[] = [];
  let previousLine = 0;
  let previousCharacter = 0;

  for (const token of sortedTokens) {
    const typeIndex = SEMANTIC_TOKEN_TYPE_INDEX[token.type];
    if (typeIndex === undefined) {
      continue;
    }

    const line = token.range.start.line;
    const character = token.range.start.character;
    const deltaLine = line - previousLine;
    const deltaCharacter = deltaLine === 0 ? character - previousCharacter : character;
    const length = token.range.end.character - token.range.start.character;
    const modifierMask = getModifierMask(token.modifiers);

    data.push(deltaLine, deltaCharacter, length, typeIndex, modifierMask);
    previousLine = line;
    previousCharacter = character;
  }

  return data;
}

function isEncodableSemanticToken(token: UtuSemanticToken): boolean {
  return token.range.start.line === token.range.end.line
    && token.range.end.character > token.range.start.character;
}

function compareSemanticTokens(left: UtuSemanticToken, right: UtuSemanticToken): number {
  return left.range.start.line - right.range.start.line
    || left.range.start.character - right.range.start.character;
}

function getModifierMask(modifiers: readonly string[]): number {
  return modifiers.reduce(
    (mask, modifier) => mask | (SEMANTIC_TOKEN_MODIFIER_MASKS[modifier] ?? 0),
    0,
  );
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isJsonRpcMessage(
  value: unknown,
): value is Record<string, unknown> & { jsonrpc: '2.0' } {
  return isObject(value) && value.jsonrpc === '2.0';
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return isObject(value) && typeof value.method === 'string' && 'id' in value;
}

function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  return isObject(value) && typeof value.method === 'string' && !('id' in value);
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
  return error instanceof JsonRpcError ? error.code : JSON_RPC_ERRORS.internalError;
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

function mapNullable<T, R>(value: T | undefined, map: (value: T) => R): R | null {
  return value ? map(value) : null;
}

main();
