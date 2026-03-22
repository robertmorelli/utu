import process from 'node:process';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyRange, } from './lsp_core/types.js';
import { UtuLanguageServer } from './lsp_server/index.js';
import data from './jsondata/lsp.data.json' with { type: 'json' };
const COMPLETION_ITEM_KINDS = data.completionItemKinds;
const DOCUMENT_SYMBOL_KINDS = data.documentSymbolKinds;
const DOCUMENT_HIGHLIGHT_KINDS = data.documentHighlightKinds;
const DIAGNOSTIC_SEVERITIES = data.diagnosticSeverities;
const SEMANTIC_TOKEN_TYPES = data.semanticTokenTypes;
const SEMANTIC_TOKEN_MODIFIERS = data.semanticTokenModifiers;
const SEMANTIC_TOKEN_TYPE_INDEX = Object.fromEntries(SEMANTIC_TOKEN_TYPES.map((type, index) => [type, index]));
const SEMANTIC_TOKEN_MODIFIER_MASKS = Object.fromEntries(SEMANTIC_TOKEN_MODIFIERS.map((modifier, index) => [modifier, 1 << index]));
const JSON_RPC_ERRORS = data.jsonRpcErrors;
const HEADER_SEPARATOR = Buffer.from(data.headerSeparator, 'ascii');
const INITIALIZE_RESULT = data.initializeResult;
const identity = (value) => value;
const mapArray = (map) => (values) => values.map(map);
const INVALID_REQUEST = JSON_RPC_ERRORS.invalidRequest;
const withInitialization = (run) => (session, params) => session.requireInitialized(() => run(session, params));
const textDocumentRequest = (method, map = identity) => withInitialization(async (session, params) => map(await session.server[method](getRequiredTextDocumentUri(params))));
const textDocumentPositionRequest = (method, map = identity, getExtraArgs = () => []) => withInitialization(async (session, params) => map(await session.server[method](getRequiredTextDocumentUri(params), getRequiredPosition(params), ...getExtraArgs(params))));
const withDocumentDiagnostics = (session, textDocument, loadDiagnostics) => session.publishDocumentDiagnostics(textDocument.uri, () => loadDiagnostics(textDocument));
const textDocumentNotification = (run) => withInitialization(async (session, params) => run(session, getRequiredTextDocument(params), params));
const jsonRpc = (message) => ({ jsonrpc: '2.0', ...message });
const ensure = (condition, message) => {
    if (!condition)
        throw new JsonRpcError(INVALID_REQUEST, message);
};
const REQUEST_HANDLERS = {
    initialize: async (session, params) => ((session.server.setWorkspaceFolders(getWorkspaceFolderUris(params))), (session.initialized = true), INITIALIZE_RESULT),
    shutdown: async (session) => ((session.shutdownRequested = true), null),
    'textDocument/hover': textDocumentPositionRequest('getHover', toLspHover),
    'textDocument/definition': textDocumentPositionRequest('getDefinition', toLspLocation),
    'textDocument/references': textDocumentPositionRequest('getReferences', mapArray(toLspLocation), (params) => [getIncludeDeclaration(params)]),
    'textDocument/documentHighlight': textDocumentPositionRequest('getDocumentHighlights', mapArray(toLspDocumentHighlight)),
    'textDocument/completion': textDocumentPositionRequest('getCompletionItems', mapArray(toLspCompletionItem)),
    'textDocument/documentSymbol': textDocumentRequest('getDocumentSymbols', mapArray(toLspDocumentSymbol)),
    'workspace/symbol': withInitialization(async (session, params) => (await session.server.getWorkspaceSymbols(getWorkspaceSymbolQuery(params))).map(toLspWorkspaceSymbol)),
    'textDocument/semanticTokens/full': textDocumentRequest('getDocumentSemanticTokens', (tokens) => ({ data: encodeSemanticTokens(tokens) })),
};
const IGNORED_NOTIFICATION_HANDLERS = Object.fromEntries(data.ignoredNotifications.map((method) => [method, async () => { }]));
const NOTIFICATION_HANDLERS = {
    ...IGNORED_NOTIFICATION_HANDLERS,
    'textDocument/didOpen': textDocumentNotification((session, textDocument) => withDocumentDiagnostics(session, textDocument, () => session.server.openDocument(textDocument))),
    'textDocument/didChange': textDocumentNotification((session, textDocument, params) => withDocumentDiagnostics(session, textDocument, () => session.server.updateDocument({
        uri: textDocument.uri,
        version: textDocument.version,
        changes: getRequiredContentChanges(params),
    }))),
    'textDocument/didSave': textDocumentNotification((session, textDocument, params) => withDocumentDiagnostics(session, textDocument, () => session.server.saveDocument({
        uri: textDocument.uri,
        text: getOptionalText(params),
    }))),
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
class JsonRpcConnection {
    onRequest;
    onNotification;
    buffer = Buffer.alloc(0);
    constructor(onRequest, onNotification) {
        this.onRequest = onRequest;
        this.onNotification = onNotification;
        process.stdin.on('data', (chunk) => this.handleData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        process.stdin.on('error', (error) => console.error('[utu-lsp] stdin error:', error));
    }
    sendNotification(method, params) { this.send(jsonRpc({ method, params })); }
    handleData(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (true) {
            const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR);
            if (headerEnd < 0)
                return;
            const headerText = this.buffer.slice(0, headerEnd).toString('utf8');
            const contentLength = getContentLength(headerText);
            if (contentLength === undefined) {
                this.buffer = this.buffer.slice(headerEnd + HEADER_SEPARATOR.length);
                this.sendError(null, INVALID_REQUEST, 'Missing Content-Length header.');
                continue;
            }
            const bodyStart = headerEnd + HEADER_SEPARATOR.length;
            const bodyEnd = bodyStart + contentLength;
            if (this.buffer.length < bodyEnd)
                return;
            const body = this.buffer.slice(bodyStart, bodyEnd).toString('utf8');
            this.buffer = this.buffer.slice(bodyEnd);
            let message;
            try {
                message = JSON.parse(body);
            }
            catch (error) {
                this.sendError(null, JSON_RPC_ERRORS.parseError, 'Invalid JSON payload.', errorToData(error));
                continue;
            }
            void this.dispatch(message);
        }
    }
    async dispatch(message) {
        if (!isJsonRpcMessage(message)) {
            this.sendError(null, INVALID_REQUEST, 'Expected a JSON-RPC 2.0 message.');
            return;
        }
        if (isJsonRpcRequest(message)) {
            try {
                const result = await this.onRequest(message);
                this.send(jsonRpc({ id: message.id, result }));
            }
            catch (error) {
                this.sendError(message.id, getErrorCode(error), error instanceof Error ? error.message : 'Request failed.', errorToData(error));
            }
            return;
        }
        if (isJsonRpcNotification(message)) {
            try {
                await this.onNotification(message);
            }
            catch (error) {
                console.error('[utu-lsp] notification failed:', error);
            }
            return;
        }
        if (!('id' in message))
            this.sendError(null, INVALID_REQUEST, 'Invalid JSON-RPC message.');
    }
    sendError(id, code, message, data) { this.send(jsonRpc({ id, error: data === undefined ? { code, message } : { code, message, data } })); }
    send(message) {
        const payload = Buffer.from(JSON.stringify(message), 'utf8');
        process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`, 'utf8');
        process.stdout.write(payload);
    }
}
class UtuLspSession {
    server;
    connection;
    initialized = false;
    shutdownRequested = false;
    constructor({ grammarWasmPath = resolveServerAssetPath('tree-sitter-utu.wasm'), runtimeWasmPath = resolveServerAssetPath('web-tree-sitter.wasm'), } = {}) {
        this.server = new UtuLanguageServer({ grammarWasmPath, runtimeWasmPath });
        this.connection = new JsonRpcConnection((request) => this.handleRequest(request), (notification) => this.handleNotification(notification));
    }
    async handleRequest({ method, params }) {
        const handle = REQUEST_HANDLERS[method];
        if (handle)
            return handle(this, params);
        throw new JsonRpcError(JSON_RPC_ERRORS.methodNotFound, `Unsupported request: ${method}`);
    }
    async handleNotification({ method, params }) {
        const handle = NOTIFICATION_HANDLERS[method];
        if (handle)
            return handle(this, params);
    }
    publishDiagnostics(uri, diagnostics) { this.connection.sendNotification('textDocument/publishDiagnostics', { uri, diagnostics: diagnostics.map(toLspDiagnostic) }); }
    assertInitialized() {
        if (!this.initialized)
            throw new JsonRpcError(JSON_RPC_ERRORS.serverNotInitialized, 'The UTU language server has not been initialized yet.');
    }
    exit() { this.server.dispose(); process.exit(this.shutdownRequested ? 0 : 1); }
    async requireInitialized(callback) { this.assertInitialized(); return callback(); }
    async publishDocumentDiagnostics(uri, loadDiagnostics) { this.publishDiagnostics(uri, await loadDiagnostics()); }
}
class JsonRpcError extends Error {
    code;
    constructor(code, message) { super(message); this.code = code; }
}
export function startLspServer(options = {}) { process.stdin.resume(); new UtuLspSession(options); }
function resolveServerAssetPath(assetName) { return resolvePath(dirname(fileURLToPath(import.meta.url)), assetName); }
function getContentLength(headerText) { return mapNullable(/Content-Length:\s*(\d+)/i.exec(headerText), (match) => Number.parseInt(match[1], 10)); }
function getRequiredTextDocumentUri(params) { return getRequiredTextDocument(params).uri; }
function getRequiredTextDocument(params) {
    ensure(isObject(params) && isObject(params.textDocument), 'Missing textDocument payload.');
    return {
        uri: requireString(params.textDocument.uri, 'textDocument.uri'),
        version: typeof params.textDocument.version === 'number' ? params.textDocument.version : 0,
        text: typeof params.textDocument.text === 'string' ? params.textDocument.text : '',
    };
}
function getRequiredPosition(params) {
    ensure(isObject(params) && isObject(params.position), 'Missing position payload.');
    return {
        line: requireNumber(params.position.line, 'position.line'),
        character: requireNumber(params.position.character, 'position.character'),
    };
}
function getIncludeDeclaration(params) {
    return Boolean(isObject(params) && isObject(params.context) && params.context.includeDeclaration);
}
function getRequiredContentChanges(params) {
    ensure(isObject(params) && Array.isArray(params.contentChanges), 'Missing contentChanges payload.');
    return params.contentChanges.map((change) => {
        ensure(isObject(change) && typeof change.text === 'string', 'Invalid content change payload.');
        return { text: change.text, range: isRange(change.range) ? change.range : undefined };
    });
}
function getWorkspaceSymbolQuery(params) { return isObject(params) && typeof params.query === 'string' ? params.query : ''; }
function getOptionalText(params) { return isObject(params) && typeof params.text === 'string' ? params.text : undefined; }
function getWorkspaceFolderUris(params) { return isObject(params) ? readFolderUris(params.workspaceFolders) : []; }
function getWorkspaceFolderChanges(params) {
    return isObject(params) && isObject(params.event)
        ? { added: readFolderUris(params.event.added), removed: readFolderUris(params.event.removed) }
        : { added: [], removed: [] };
}
function readFolderUris(value) { return Array.isArray(value) ? value.flatMap((folder) => isObject(folder) && typeof folder.uri === 'string' ? [folder.uri] : []) : []; }
function copyUriRange(value) { return { uri: value.uri, range: copyRange(value.range) }; }
function toLspLocation(location) { return mapNullable(location, copyUriRange); }
function toLspHover(hover) { return mapNullable(hover, (value) => ({ contents: value.contents, range: copyRange(value.range) })); }
function toLspDiagnostic(diagnostic) { return { range: copyRange(diagnostic.range), severity: DIAGNOSTIC_SEVERITIES[diagnostic.severity], source: diagnostic.source, message: diagnostic.message }; }
function toLspDocumentHighlight(highlight) { return { range: copyRange(highlight.range), kind: DOCUMENT_HIGHLIGHT_KINDS[highlight.kind] }; }
function toLspCompletionItem(item) { return { label: item.label, kind: COMPLETION_ITEM_KINDS[item.kind], detail: item.detail }; }
function toLspDocumentSymbol(symbol) { return { name: symbol.name, detail: symbol.detail, kind: DOCUMENT_SYMBOL_KINDS[symbol.kind], range: copyRange(symbol.range), selectionRange: copyRange(symbol.selectionRange) }; }
function toLspWorkspaceSymbol(symbol) { return { name: symbol.name, kind: DOCUMENT_SYMBOL_KINDS[symbol.kind], location: copyUriRange(symbol.location), containerName: symbol.detail }; }
function encodeSemanticTokens(tokens) {
    const data = [];
    let previousLine = 0;
    let previousCharacter = 0;
    for (const token of [...tokens].filter(isEncodableSemanticToken).sort(compareSemanticTokens)) {
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
function isEncodableSemanticToken(token) {
    return token.range.start.line === token.range.end.line
        && token.range.end.character > token.range.start.character;
}
function compareSemanticTokens(left, right) {
    return left.range.start.line - right.range.start.line
        || left.range.start.character - right.range.start.character;
}
function getModifierMask(modifiers) {
    return modifiers.reduce((mask, modifier) => mask | (SEMANTIC_TOKEN_MODIFIER_MASKS[modifier] ?? 0), 0);
}
function isRange(value) {
    return isObject(value)
        && isObject(value.start)
        && isObject(value.end)
        && typeof value.start.line === 'number'
        && typeof value.start.character === 'number'
        && typeof value.end.line === 'number'
        && typeof value.end.character === 'number';
}
function isObject(value) {
    return typeof value === 'object' && value !== null;
}
function isJsonRpcMessage(value) {
    return isObject(value) && value.jsonrpc === '2.0';
}
function isJsonRpcRequest(value) {
    return isObject(value) && typeof value.method === 'string' && 'id' in value;
}
function isJsonRpcNotification(value) {
    return isObject(value) && typeof value.method === 'string' && !('id' in value);
}
function requireString(value, fieldName) {
    if (typeof value !== 'string') {
        throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, `Expected ${fieldName} to be a string.`);
    }
    return value;
}
function requireNumber(value, fieldName) {
    if (typeof value !== 'number') {
        throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, `Expected ${fieldName} to be a number.`);
    }
    return value;
}
function getErrorCode(error) {
    return error instanceof JsonRpcError ? error.code : JSON_RPC_ERRORS.internalError;
}
function errorToData(error) {
    return error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error;
}
function mapNullable(value, map) {
    return value ? map(value) : null;
}
startLspServer();
