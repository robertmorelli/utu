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
const LSP_REQUEST_METHODS = Object.freeze({
  INITIALIZE: 'initialize',
  SHUTDOWN: 'shutdown',
  HOVER: 'textDocument/hover',
  DEFINITION: 'textDocument/definition',
  REFERENCES: 'textDocument/references',
  DOCUMENT_HIGHLIGHT: 'textDocument/documentHighlight',
  COMPLETION: 'textDocument/completion',
  DOCUMENT_SYMBOL: 'textDocument/documentSymbol',
  WORKSPACE_SYMBOL: 'workspace/symbol',
  SEMANTIC_TOKENS_FULL: 'textDocument/semanticTokens/full',
});
const LSP_NOTIFICATION_METHODS = Object.freeze({
  DID_OPEN: 'textDocument/didOpen',
  DID_CHANGE: 'textDocument/didChange',
  DID_SAVE: 'textDocument/didSave',
  DID_CLOSE: 'textDocument/didClose',
  DID_CHANGE_WORKSPACE_FOLDERS: 'workspace/didChangeWorkspaceFolders',
  PUBLISH_DIAGNOSTICS: 'textDocument/publishDiagnostics',
  EXIT: 'exit',
});

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
  [LSP_REQUEST_METHODS.INITIALIZE]: async (session, params) => {
    session.server.setWorkspaceFolders(getWorkspaceFolderUris(params));
    session.initialized = true;
    return INITIALIZE_RESULT;
  },
  [LSP_REQUEST_METHODS.SHUTDOWN]: async (session) => {
    session.shutdownRequested = true;
    return null;
  },
  [LSP_REQUEST_METHODS.HOVER]: textDocumentPositionRequest('getHover', toLspHover),
  [LSP_REQUEST_METHODS.DEFINITION]: textDocumentPositionRequest('getDefinition', toLspLocation),
  [LSP_REQUEST_METHODS.REFERENCES]: textDocumentPositionRequest(
    'getReferences',
    mapArray(toLspLocation),
    (params) => [getIncludeDeclaration(params)],
  ),
  [LSP_REQUEST_METHODS.DOCUMENT_HIGHLIGHT]: textDocumentPositionRequest(
    'getDocumentHighlights',
    mapArray(toLspDocumentHighlight),
  ),
  [LSP_REQUEST_METHODS.COMPLETION]: textDocumentPositionRequest(
    'getCompletionItems',
    mapArray((item) => toLspCompletionItem(item, COMPLETION_ITEM_KINDS)),
  ),
  [LSP_REQUEST_METHODS.DOCUMENT_SYMBOL]: textDocumentRequest(
    'getDocumentSymbols',
    mapArray(toLspDocumentSymbol),
  ),
  [LSP_REQUEST_METHODS.WORKSPACE_SYMBOL]: withInitialization(async (session, params) =>
    (await session.server.getWorkspaceSymbols(getWorkspaceSymbolQuery(params))).map(
      toLspWorkspaceSymbol,
    ),
  ),
  [LSP_REQUEST_METHODS.SEMANTIC_TOKENS_FULL]: textDocumentRequest('getDocumentSemanticTokens', (tokens) => ({
    data: encodeSemanticTokens(tokens),
  })),
};

const IGNORED_NOTIFICATION_HANDLERS = Object.fromEntries(
  data.ignoredNotifications.map((method) => [method, async () => {}]),
);

const NOTIFICATION_HANDLERS = {
  ...IGNORED_NOTIFICATION_HANDLERS,
  [LSP_NOTIFICATION_METHODS.DID_OPEN]: textDocumentNotification((session, textDocument) =>
    withDocumentDiagnostics(session, textDocument, () => session.server.openDocument(textDocument)),
  ),
  [LSP_NOTIFICATION_METHODS.DID_CHANGE]: textDocumentNotification((session, textDocument, params) =>
    withDocumentDiagnostics(session, textDocument, () =>
      session.server.updateDocument({
        uri: textDocument.uri,
        version: textDocument.version,
        changes: getRequiredContentChanges(params),
      }),
    ),
  ),
  [LSP_NOTIFICATION_METHODS.DID_SAVE]: textDocumentNotification((session, textDocument, params) =>
    withDocumentDiagnostics(session, textDocument, () =>
      session.server.saveDocument({
        uri: textDocument.uri,
        text: getOptionalText(params),
      }),
    ),
  ),
  [LSP_NOTIFICATION_METHODS.DID_CLOSE]: textDocumentNotification(async (session, textDocument) => {
    await session.server.closeDocument(textDocument.uri);
    session.publishDiagnostics(textDocument.uri, []);
  }),
  [LSP_NOTIFICATION_METHODS.DID_CHANGE_WORKSPACE_FOLDERS]: withInitialization(async (session, params) => {
    const { added, removed } = getWorkspaceFolderChanges(params);
    session.server.addWorkspaceFolders(added);
    session.server.removeWorkspaceFolders(removed);
  }),
  [LSP_NOTIFICATION_METHODS.EXIT]: async (session) => session.exit(),
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
    this.connection.sendNotification(LSP_NOTIFICATION_METHODS.PUBLISH_DIAGNOSTICS, {
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
