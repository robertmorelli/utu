import process from 'node:process';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UtuLanguageServer } from './server/index.js';
import { JsonRpcConnection } from './transport/jsonRpcConnection.mjs';
import {
  INITIALIZE_RESULT,
  JSON_RPC_ERRORS,
  JsonRpcError,
  encodeSemanticTokens,
  errorToData,
  getErrorCode,
  getIncludeDeclaration,
  getOptionalText,
  getRequiredContentChanges,
  getRequiredPosition,
  getRequiredTextDocument,
  getRequiredTextDocumentUri,
  getWorkspaceFolderChanges,
  getWorkspaceFolderUris,
  getWorkspaceSymbolQuery,
  toLspCompletionItem,
  toLspDiagnostic,
  toLspDocumentHighlight,
  toLspDocumentSymbol,
  toLspHover,
  toLspLocation,
  toLspWorkspaceSymbol,
} from './protocol-adapters/index.mjs';
import data from '../../../jsondata/lsp.data.json' with { type: 'json' };

const COMPLETION_ITEM_KINDS = data.completionItemKinds;
const identity = (value) => value;
const mapArray = (map) => (values) => values.map(map);
const withInitialization = (run) => (session, params) =>
  session.requireInitialized(() => run(session, params));
const textDocumentRequest = (method, map = identity) =>
  withInitialization(async (session, params) =>
    map(await session.server[method](getRequiredTextDocumentUri(params))),
  );
const textDocumentPositionRequest = (method, map = identity, getExtraArgs = () => []) =>
  withInitialization(async (session, params) =>
    map(
      await session.server[method](
        getRequiredTextDocumentUri(params),
        getRequiredPosition(params),
        ...getExtraArgs(params),
      ),
    ),
  );
const withDocumentDiagnostics = (session, textDocument, loadDiagnostics) =>
  session.publishDocumentDiagnostics(textDocument.uri, () => loadDiagnostics(textDocument));
const textDocumentNotification = (run) =>
  withInitialization(async (session, params) =>
    run(session, getRequiredTextDocument(params), params),
  );

const REQUEST_HANDLERS = {
  initialize: async (session, params) => {
    session.server.setWorkspaceFolders(getWorkspaceFolderUris(params));
    session.initialized = true;
    return INITIALIZE_RESULT;
  },
  shutdown: async (session) => {
    session.shutdownRequested = true;
    return null;
  },
  'textDocument/hover': textDocumentPositionRequest('getHover', toLspHover),
  'textDocument/definition': textDocumentPositionRequest('getDefinition', toLspLocation),
  'textDocument/references': textDocumentPositionRequest(
    'getReferences',
    mapArray(toLspLocation),
    (params) => [getIncludeDeclaration(params)],
  ),
  'textDocument/documentHighlight': textDocumentPositionRequest(
    'getDocumentHighlights',
    mapArray(toLspDocumentHighlight),
  ),
  'textDocument/completion': textDocumentPositionRequest(
    'getCompletionItems',
    mapArray((item) => toLspCompletionItem(item, COMPLETION_ITEM_KINDS)),
  ),
  'textDocument/documentSymbol': textDocumentRequest(
    'getDocumentSymbols',
    mapArray(toLspDocumentSymbol),
  ),
  'workspace/symbol': withInitialization(async (session, params) =>
    (await session.server.getWorkspaceSymbols(getWorkspaceSymbolQuery(params))).map(
      toLspWorkspaceSymbol,
    ),
  ),
  'textDocument/semanticTokens/full': textDocumentRequest('getDocumentSemanticTokens', (tokens) => ({
    data: encodeSemanticTokens(tokens),
  })),
};

const IGNORED_NOTIFICATION_HANDLERS = Object.fromEntries(
  data.ignoredNotifications.map((method) => [method, async () => {}]),
);

const NOTIFICATION_HANDLERS = {
  ...IGNORED_NOTIFICATION_HANDLERS,
  'textDocument/didOpen': textDocumentNotification((session, textDocument) =>
    withDocumentDiagnostics(session, textDocument, () => session.server.openDocument(textDocument)),
  ),
  'textDocument/didChange': textDocumentNotification((session, textDocument, params) =>
    withDocumentDiagnostics(session, textDocument, () =>
      session.server.updateDocument({
        uri: textDocument.uri,
        version: textDocument.version,
        changes: getRequiredContentChanges(params),
      }),
    ),
  ),
  'textDocument/didSave': textDocumentNotification((session, textDocument, params) =>
    withDocumentDiagnostics(session, textDocument, () =>
      session.server.saveDocument({
        uri: textDocument.uri,
        text: getOptionalText(params),
      }),
    ),
  ),
  'textDocument/didClose': textDocumentNotification(async (session, textDocument) => {
    await session.server.closeDocument(textDocument.uri);
    session.publishDiagnostics(textDocument.uri, []);
  }),
  'workspace/didChangeWorkspaceFolders': withInitialization(async (session, params) => {
    const { added, removed } = getWorkspaceFolderChanges(params);
    session.server.addWorkspaceFolders(added);
    session.server.removeWorkspaceFolders(removed);
  }),
  exit: async (session) => session.exit(),
};

export class UtuLspSession {
  constructor({
    grammarWasmPath = resolveServerAssetPath('tree-sitter-utu.wasm'),
    runtimeWasmPath = resolveServerAssetPath('web-tree-sitter.wasm'),
  } = {}) {
    this.server = new UtuLanguageServer({ grammarWasmPath, runtimeWasmPath });
    this.connection = new JsonRpcConnection({
      onRequest: (request) => this.handleRequest(request),
      onNotification: (notification) => this.handleNotification(notification),
      onProtocolError: (id, message, error) =>
        this.connection.sendError(id, JSON_RPC_ERRORS.invalidRequest, message, errorToData(error)),
      onNotificationError: (error) => console.error('[utu-lsp] notification failed:', error),
    });
    this.initialized = false;
    this.shutdownRequested = false;
  }

  async handleRequest({ id, method, params }) {
    const handle = REQUEST_HANDLERS[method];
    if (!handle) {
      this.connection.sendError(
        id,
        JSON_RPC_ERRORS.methodNotFound,
        `Unsupported request: ${method}`,
      );
      return;
    }
    try {
      this.connection.sendResult(id, await handle(this, params));
    } catch (error) {
      this.connection.sendError(
        id,
        getErrorCode(error),
        error instanceof Error ? error.message : 'Request failed.',
        errorToData(error),
      );
    }
  }

  async handleNotification({ method, params }) {
    const handle = NOTIFICATION_HANDLERS[method];
    if (handle) await handle(this, params);
  }

  publishDiagnostics(uri, diagnostics) {
    this.connection.sendNotification('textDocument/publishDiagnostics', {
      uri,
      diagnostics: diagnostics.map(toLspDiagnostic),
    });
  }

  assertInitialized() {
    if (!this.initialized) {
      throw new JsonRpcError(
        JSON_RPC_ERRORS.serverNotInitialized,
        'The UTU language server has not been initialized yet.',
      );
    }
  }

  exit() {
    this.server.dispose();
    process.exit(this.shutdownRequested ? 0 : 1);
  }

  async requireInitialized(callback) {
    this.assertInitialized();
    return callback();
  }

  async publishDocumentDiagnostics(uri, loadDiagnostics) {
    this.publishDiagnostics(uri, await loadDiagnostics());
  }
}

export function startLspServer(options = {}) {
  process.stdin.resume();
  new UtuLspSession(options);
}

function resolveServerAssetPath(assetName) {
  return resolvePath(dirname(fileURLToPath(import.meta.url)), '../../../', assetName);
}
