import * as vscode from 'vscode';
import { UtuWorkspaceSession } from '../../workspace/index.js';
import { UTU_EXCLUDE, UTU_GLOB } from './shared.js';

export function createVscodeWorkspaceAdapter({ grammarWasmPath, runtimeWasmPath, output }) {
    const session = new UtuWorkspaceSession({
        workspaceFolders: getWorkspaceFolderUris(),
        grammarWasmPath,
        runtimeWasmPath,
    });
    const languageService = new VscodeSessionLanguageService(session);
    const workspaceSymbols = createWorkspaceSymbolController(session, languageService, output);
    return { session, languageService, workspaceSymbols };
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
    async getDiagnostics(document) {
        const synced = await this.syncDocument(document);
        return this.session.getFreshDiagnostics(synced, { mode: 'editor' });
    }
    async getDocumentIndex(document) {
        await this.syncDocument(document);
        return this.session.getDocumentIndex(document.uri.toString());
    }
    async getHover(document, position) {
        await this.syncDocument(document);
        return this.session.getHover(document.uri.toString(), position);
    }
    async getDefinition(document, position) {
        await this.syncDocument(document);
        return this.session.getDefinition(document.uri.toString(), position);
    }
    async getReferences(document, position, includeDeclaration) {
        await this.syncDocument(document);
        return this.session.getReferences(document.uri.toString(), position, includeDeclaration);
    }
    async getDocumentHighlights(document, position) {
        await this.syncDocument(document);
        return this.session.getDocumentHighlights(document.uri.toString(), position);
    }
    async getCompletionItems(document, position) {
        await this.syncDocument(document);
        return this.session.getCompletionItems(document.uri.toString(), position);
    }
    async getDocumentSemanticTokens(document) {
        await this.syncDocument(document);
        return this.session.getDocumentSemanticTokens(document.uri.toString());
    }
    async getDocumentSymbols(document) {
        await this.syncDocument(document);
        return this.session.getDocumentSymbols(document.uri.toString());
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
