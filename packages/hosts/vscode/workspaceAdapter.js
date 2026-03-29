import * as vscode from 'vscode';
import { UtuParserService } from '../../document/index.js';
import {
    DIAGNOSTIC_PROVIDER_TRIGGERS,
    getDocumentDiagnostics,
} from '../../language-platform/providers/diagnostics.js';
import { UtuLanguageService } from '../../language-platform/index.js';
import { UtuWorkspaceSession } from '../../workspace/index.js';
import { UTU_EXCLUDE, UTU_GLOB } from './shared.js';

const VSCODE_ADAPTER_REQUESTS = Object.freeze({
    DIAGNOSTICS: 'diagnostics',
    DOCUMENT_INDEX: 'document-index',
    HOVER: 'hover',
    DEFINITION: 'definition',
    REFERENCES: 'references',
    DOCUMENT_HIGHLIGHTS: 'document-highlights',
    COMPLETION_ITEMS: 'completion-items',
    SEMANTIC_TOKENS: 'semantic-tokens',
    DOCUMENT_SYMBOLS: 'document-symbols',
});

export function createVscodeWorkspaceAdapter({ grammarWasmPath, runtimeWasmPath, output }) {
    const parserService = new UtuParserService({
        grammarWasmPath,
        runtimeWasmPath,
    });
    const languageService = new UtuLanguageService(parserService, {
        loadImport: async (fromUri, specifier) => {
            const target = vscode.Uri.parse(new URL(specifier, fromUri ?? 'file:///').href, true);
            return {
                uri: target.toString(),
                source: new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(target)),
            };
        },
    });
    const session = new UtuWorkspaceSession({
        workspaceFolders: getWorkspaceFolderUris(),
        parserService,
        languageService,
        grammarWasmPath,
        runtimeWasmPath,
    });
    const sessionLanguageService = new VscodeSessionLanguageService(session);
    const workspaceSymbols = createWorkspaceSymbolController(session, sessionLanguageService, output);
    return { session, languageService: sessionLanguageService, workspaceSymbols };
}

class VscodeSessionLanguageService {
    constructor(session) {
        this.session = session;
    }
    dispose() {
        this.session.dispose();
    }
    invalidate(uri) {
        this.session.invalidateDocument(uri);
    }
    clear() {
        this.session.clearDocuments();
    }
    async syncDocument(document) {
        return this.session.syncDocumentText({
            uri: document.uri.toString(),
            version: document.version,
            text: document.getText(),
        });
    }
    async getDiagnostics(document, options = {}) {
        return this.withSyncedDocument(document, VSCODE_ADAPTER_REQUESTS.DIAGNOSTICS, async (synced) => getDocumentDiagnostics({
            getDiagnostics: (_document, requestOptions = {}) => this.session.getFreshDiagnostics(synced, requestOptions),
        }, synced, {
            trigger: options.trigger ?? DIAGNOSTIC_PROVIDER_TRIGGERS.ON_TYPE,
            mode: options.mode,
        }));
    }
    async getDocumentIndex(document) {
        return this.withSyncedDocument(document, VSCODE_ADAPTER_REQUESTS.DOCUMENT_INDEX, () => this.session.getDocumentIndex(document.uri.toString()));
    }
    async getHover(document, position) {
        return this.withSyncedDocument(document, VSCODE_ADAPTER_REQUESTS.HOVER, () => this.session.getHover(document.uri.toString(), position));
    }
    async getDefinition(document, position) {
        return this.withSyncedDocument(document, VSCODE_ADAPTER_REQUESTS.DEFINITION, () => this.session.getDefinition(document.uri.toString(), position));
    }
    async getReferences(document, position, includeDeclaration) {
        return this.withSyncedDocument(document, VSCODE_ADAPTER_REQUESTS.REFERENCES, () => this.session.getReferences(document.uri.toString(), position, includeDeclaration));
    }
    async getDocumentHighlights(document, position) {
        return this.withSyncedDocument(document, VSCODE_ADAPTER_REQUESTS.DOCUMENT_HIGHLIGHTS, () => this.session.getDocumentHighlights(document.uri.toString(), position));
    }
    async getCompletionItems(document, position) {
        return this.withSyncedDocument(document, VSCODE_ADAPTER_REQUESTS.COMPLETION_ITEMS, () => this.session.getCompletionItems(document.uri.toString(), position));
    }
    async getDocumentSemanticTokens(document) {
        return this.withSyncedDocument(document, VSCODE_ADAPTER_REQUESTS.SEMANTIC_TOKENS, () => this.session.getDocumentSemanticTokens(document.uri.toString()));
    }
    async getDocumentSymbols(document) {
        return this.withSyncedDocument(document, VSCODE_ADAPTER_REQUESTS.DOCUMENT_SYMBOLS, () => this.session.getDocumentSymbols(document.uri.toString()));
    }
    async withSyncedDocument(document, _request, action) {
        const synced = await this.syncDocument(document);
        return action(synced);
    }
}

function createWorkspaceSymbolController(session, languageService, output) {
    let queue = Promise.resolve();
    const schedule = (label, task) => (queue = queue.then(task, task).catch((error) => {
        output?.appendLine(`[workspace symbols] ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }));
    const syncWorkspace = () => schedule('sync workspace', async () => {
        const uris = await vscode.workspace.findFiles(UTU_GLOB, UTU_EXCLUDE);
        const documents = [];
        for (const uri of uris) {
            const document = await vscode.workspace.openTextDocument(uri);
            if (document.languageId !== 'utu')
                continue;
            documents.push(await languageService.syncDocument(document));
        }
        await session.workspaceSymbols.syncDocuments(documents, { replace: true });
        session.workspaceSymbolsReady = true;
    });
    return {
        clear() {
            session.resetWorkspaceSymbols();
        },
        async ensureInitialized() {
            await syncWorkspace();
        },
        async getWorkspaceSymbols(query) {
            await this.ensureInitialized();
            return session.getWorkspaceSymbols(query);
        },
        async syncWorkspace() {
            await syncWorkspace();
        },
        async updateDocument(document) {
            await schedule(`update ${document.uri}`, async () => {
                const synced = await languageService.syncDocument(document);
                await session.workspaceSymbols.updateDocument(synced);
                session.workspaceSymbolsReady = true;
            });
        },
        async refreshUri(uri) {
            await schedule(`refresh ${uri}`, async () => {
                const uriText = uri.toString();
                session.invalidateDocument(uriText);
                const document = await session.documents.resolve(uriText);
                if (!document)
                    return void session.workspaceSymbols.deleteDocument(uriText);
                await session.workspaceSymbols.updateDocument(document);
                session.workspaceSymbolsReady = true;
            });
        },
        deleteUri(uri) {
            session.workspaceSymbols.deleteDocument(uri.toString());
        },
    };
}

function getWorkspaceFolderUris() {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.toString());
}
