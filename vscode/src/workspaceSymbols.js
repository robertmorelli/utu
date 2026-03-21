import * as vscode from 'vscode';
import { UtuWorkspaceSymbolIndex } from '../../lsp/src/core/languageService.js';

const WORKSPACE_GLOB = '**/*.utu';
const WORKSPACE_EXCLUDE = '**/node_modules/**';

export function createWorkspaceSymbolController(languageService, output) {
    const index = new UtuWorkspaceSymbolIndex(languageService);
    let queue = Promise.resolve();
    let initialSyncPromise;
    const logError = (label, error) => {
        output?.appendLine(`[workspace symbols] ${label}: ${error instanceof Error ? error.message : String(error)}`);
    };
    const schedule = (label, task) => {
        const next = queue.then(task, task);
        queue = next.catch((error) => {
            logError(label, error);
        });
        return next;
    };
    const syncWorkspace = () => schedule('sync workspace', async () => {
        const uris = await vscode.workspace.findFiles(WORKSPACE_GLOB, WORKSPACE_EXCLUDE);
        const documents = await Promise.all(uris.map((uri) => vscode.workspace.openTextDocument(uri)));
        await index.syncDocuments(documents.filter((document) => document.languageId === 'utu'), { replace: true });
    });
    return {
        clear() {
            index.clear();
            initialSyncPromise = undefined;
        },
        async ensureInitialized() {
            initialSyncPromise ??= syncWorkspace();
            await initialSyncPromise;
        },
        async getWorkspaceSymbols(query) {
            await this.ensureInitialized();
            return index.getWorkspaceSymbols(query);
        },
        async syncWorkspace() {
            initialSyncPromise = syncWorkspace();
            await initialSyncPromise;
        },
        async updateDocument(document) {
            if (document.languageId !== 'utu')
                return;
            await schedule(`update ${document.uri}`, () => index.updateDocument(document));
        },
        async refreshUri(uri) {
            await schedule(`refresh ${uri}`, async () => {
                try {
                    const document = await vscode.workspace.openTextDocument(uri);
                    if (document.languageId !== 'utu') {
                        index.deleteDocument(uri.toString());
                        return;
                    }
                    await index.updateDocument(document);
                }
                catch {
                    index.deleteDocument(uri.toString());
                }
            });
        },
        deleteUri(uri) {
            index.deleteDocument(uri.toString());
        },
    };
}
