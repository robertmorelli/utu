import process from 'node:process';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyRange, } from './lsp_core/types.js';
import { UtuLanguageServer } from './lsp_server/index.js';
const COMPLETION_ITEM_KINDS = {
    text: 1,
    method: 2,
    function: 3,
    variable: 6,
    class: 7,
    module: 9,
    keyword: 14,
    enumMember: 20,
};
const DOCUMENT_SYMBOL_KINDS = {
    method: 6,
    function: 12,
    enum: 10,
    variable: 13,
    object: 19,
    enumMember: 22,
    struct: 23,
    event: 24,
};
const DOCUMENT_HIGHLIGHT_KINDS = {
    read: 2,
    write: 3,
};
const DIAGNOSTIC_SEVERITIES = {
    error: 1,
};
const SEMANTIC_TOKEN_TYPES = [
    'type',
    'enumMember',
    'function',
    'parameter',
    'variable',
    'property',
];
const SEMANTIC_TOKEN_MODIFIERS = ['declaration'];
const SEMANTIC_TOKEN_TYPE_INDEX = Object.fromEntries(SEMANTIC_TOKEN_TYPES.map((type, index) => [type, index]));
const SEMANTIC_TOKEN_MODIFIER_MASKS = Object.fromEntries(SEMANTIC_TOKEN_MODIFIERS.map((modifier, index) => [modifier, 1 << index]));
const JSON_RPC_ERRORS = {
    parseError: -32700,
    invalidRequest: -32600,
    methodNotFound: -32601,
    internalError: -32603,
    serverNotInitialized: -32002,
};
const SERVER_NAME = 'utu-lsp';
const SERVER_VERSION = '0.1.0';
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
    'textDocument/hover': async (session, params) => session.requireInitialized(async () => toLspHover(await session.server.getHover(getRequiredTextDocumentUri(params), getRequiredPosition(params)))),
    'textDocument/definition': async (session, params) => session.requireInitialized(async () => toLspLocation(await session.server.getDefinition(getRequiredTextDocumentUri(params), getRequiredPosition(params)))),
    'textDocument/references': async (session, params) => session.requireInitialized(async () => (await session.server.getReferences(getRequiredTextDocumentUri(params), getRequiredPosition(params), getIncludeDeclaration(params))).map(toLspLocation)),
    'textDocument/documentHighlight': async (session, params) => session.requireInitialized(async () => (await session.server.getDocumentHighlights(getRequiredTextDocumentUri(params), getRequiredPosition(params))).map(toLspDocumentHighlight)),
    'textDocument/completion': async (session, params) => session.requireInitialized(async () => (await session.server.getCompletionItems(getRequiredTextDocumentUri(params), getRequiredPosition(params))).map(toLspCompletionItem)),
    'textDocument/documentSymbol': async (session, params) => session.requireInitialized(async () => (await session.server.getDocumentSymbols(getRequiredTextDocumentUri(params))).map(toLspDocumentSymbol)),
    'workspace/symbol': async (session, params) => session.requireInitialized(async () => (await session.server.getWorkspaceSymbols(getWorkspaceSymbolQuery(params))).map(toLspWorkspaceSymbol)),
    'textDocument/semanticTokens/full': async (session, params) => session.requireInitialized(async () => ({
        data: encodeSemanticTokens(await session.server.getDocumentSemanticTokens(getRequiredTextDocumentUri(params))),
    })),
};
const IGNORED_NOTIFICATION_HANDLERS = Object.fromEntries([
    'initialized',
    '$/setTrace',
    '$/cancelRequest',
    'workspace/didChangeConfiguration',
].map((method) => [method, async () => { }]));
const NOTIFICATION_HANDLERS = {
    ...IGNORED_NOTIFICATION_HANDLERS,
    'textDocument/didOpen': async (session, params) => session.requireInitialized(async () => {
        const textDocument = getRequiredTextDocument(params);
        await session.publishDocumentDiagnostics(textDocument.uri, () => session.server.openDocument(textDocument));
    }),
    'textDocument/didChange': async (session, params) => session.requireInitialized(async () => {
        const textDocument = getRequiredTextDocument(params);
        await session.publishDocumentDiagnostics(textDocument.uri, () => session.server.updateDocument({
            uri: textDocument.uri,
            version: textDocument.version,
            changes: getRequiredContentChanges(params),
        }));
    }),
    'textDocument/didSave': async (session, params) => session.requireInitialized(async () => {
        const uri = getRequiredTextDocumentUri(params);
        await session.publishDocumentDiagnostics(uri, () => session.server.saveDocument({
            uri,
            text: getOptionalText(params),
        }));
    }),
    'textDocument/didClose': async (session, params) => session.requireInitialized(async () => {
        const uri = getRequiredTextDocumentUri(params);
        await session.server.closeDocument(uri);
        session.publishDiagnostics(uri, []);
    }),
    'workspace/didChangeWorkspaceFolders': async (session, params) => session.requireInitialized(async () => {
        const { added, removed } = getWorkspaceFolderChanges(params);
        session.server.addWorkspaceFolders(added);
        session.server.removeWorkspaceFolders(removed);
    }),
    exit: async (session) => {
        session.exit();
    },
};
class JsonRpcConnection {
    onRequest;
    onNotification;
    buffer = Buffer.alloc(0);
    constructor(onRequest, onNotification) {
        this.onRequest = onRequest;
        this.onNotification = onNotification;
        process.stdin.on('data', (chunk) => {
            this.handleData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        process.stdin.on('error', (error) => {
            console.error('[utu-lsp] stdin error:', error);
        });
    }
    sendNotification(method, params) {
        this.send({
            jsonrpc: '2.0',
            method,
            params,
        });
    }
    handleData(chunk) {
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
        if ('id' in message) {
            return;
        }
        this.sendError(null, JSON_RPC_ERRORS.invalidRequest, 'Invalid JSON-RPC message.');
    }
    sendError(id, code, message, data) {
        this.send({
            jsonrpc: '2.0',
            id,
            error: data === undefined ? { code, message } : { code, message, data },
        });
    }
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
        this.server = new UtuLanguageServer({
            grammarWasmPath,
            runtimeWasmPath,
        });
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
    publishDiagnostics(uri, diagnostics) {
        this.connection.sendNotification('textDocument/publishDiagnostics', {
            uri,
            diagnostics: diagnostics.map(toLspDiagnostic),
        });
    }
    assertInitialized() {
        if (!this.initialized) {
            throw new JsonRpcError(JSON_RPC_ERRORS.serverNotInitialized, 'The UTU language server has not been initialized yet.');
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
class JsonRpcError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
export function startLspServer(options = {}) {
    process.stdin.resume();
    new UtuLspSession(options);
}
function resolveServerAssetPath(assetName) {
    return resolvePath(dirname(fileURLToPath(import.meta.url)), assetName);
}
function getContentLength(headerText) {
    const match = /Content-Length:\s*(\d+)/i.exec(headerText);
    return match ? Number.parseInt(match[1], 10) : undefined;
}
function getRequiredTextDocumentUri(params) {
    return getRequiredTextDocument(params).uri;
}
function getRequiredTextDocument(params) {
    if (!isObject(params) || !isObject(params.textDocument)) {
        throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, 'Missing textDocument payload.');
    }
    return {
        uri: requireString(params.textDocument.uri, 'textDocument.uri'),
        version: typeof params.textDocument.version === 'number' ? params.textDocument.version : 0,
        text: typeof params.textDocument.text === 'string' ? params.textDocument.text : '',
    };
}
function getRequiredPosition(params) {
    if (!isObject(params) || !isObject(params.position)) {
        throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, 'Missing position payload.');
    }
    return {
        line: requireNumber(params.position.line, 'position.line'),
        character: requireNumber(params.position.character, 'position.character'),
    };
}
function getIncludeDeclaration(params) {
    return Boolean(isObject(params) && isObject(params.context) && params.context.includeDeclaration);
}
function getRequiredContentChanges(params) {
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
function getWorkspaceSymbolQuery(params) {
    return isObject(params) && typeof params.query === 'string' ? params.query : '';
}
function getOptionalText(params) {
    return isObject(params) && typeof params.text === 'string' ? params.text : undefined;
}
function getWorkspaceFolderUris(params) {
    return isObject(params) ? readFolderUris(params.workspaceFolders) : [];
}
function getWorkspaceFolderChanges(params) {
    if (!isObject(params) || !isObject(params.event)) {
        return { added: [], removed: [] };
    }
    return {
        added: readFolderUris(params.event.added),
        removed: readFolderUris(params.event.removed),
    };
}
function readFolderUris(value) {
    return Array.isArray(value)
        ? value.flatMap((folder) => isObject(folder) && typeof folder.uri === 'string' ? [folder.uri] : [])
        : [];
}
function toLspLocation(location) {
    return mapNullable(location, (value) => ({
        uri: value.uri,
        range: copyRange(value.range),
    }));
}
function toLspHover(hover) {
    return mapNullable(hover, (value) => ({
        contents: value.contents,
        range: copyRange(value.range),
    }));
}
function toLspDiagnostic(diagnostic) {
    return {
        range: copyRange(diagnostic.range),
        severity: DIAGNOSTIC_SEVERITIES[diagnostic.severity],
        source: diagnostic.source,
        message: diagnostic.message,
    };
}
function toLspDocumentHighlight(highlight) {
    return {
        range: copyRange(highlight.range),
        kind: DOCUMENT_HIGHLIGHT_KINDS[highlight.kind],
    };
}
function toLspCompletionItem(item) {
    return {
        label: item.label,
        kind: COMPLETION_ITEM_KINDS[item.kind],
        detail: item.detail,
    };
}
function toLspDocumentSymbol(symbol) {
    return {
        name: symbol.name,
        detail: symbol.detail,
        kind: DOCUMENT_SYMBOL_KINDS[symbol.kind],
        range: copyRange(symbol.range),
        selectionRange: copyRange(symbol.selectionRange),
    };
}
function toLspWorkspaceSymbol(symbol) {
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
function encodeSemanticTokens(tokens) {
    const sortedTokens = [...tokens]
        .filter(isEncodableSemanticToken)
        .sort(compareSemanticTokens);
    const data = [];
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
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }
    return error;
}
function mapNullable(value, map) {
    return value ? map(value) : null;
}
startLspServer();
