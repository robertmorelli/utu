import * as vscode from 'vscode';
import { UtuLanguageService, UtuWorkspaceSymbolIndex, hasRunnableMain } from '../lsp_core/languageService.js'; import { UtuParserService } from '../parser.js';
import { registerCommands } from './commands.js'; import { DiagnosticsController } from './diagnostics.js';
import { GeneratedDocumentStore } from './generatedDocuments.js'; import { registerLanguageProviders } from './languageProviders.js';
import { UTU_EXCLUDE, UTU_GLOB } from './shared.js';
import { registerTesting } from './testing.js';
export function activateUtuExtension(context, options) {
    const output = vscode.window.createOutputChannel('UTU'), generatedDocuments = new GeneratedDocumentStore(), parserService = new UtuParserService({ grammarWasmPath: options.grammarWasmPath, runtimeWasmPath: options.parserRuntimeWasmPath }), languageService = new UtuLanguageService(parserService), workspaceSymbols = createWorkspaceSymbolController(languageService, output), diagnostics = new DiagnosticsController(languageService, output, options.compilerHost), statusBarItem = options.showCompileStatusBar === false ? undefined : createCompileStatusBarItem(), refreshMainContext = createMainContextRefresher(languageService, options.runtimeHost), workspaceWatcher = vscode.workspace.createFileSystemWatcher(UTU_GLOB);
    const syncDocument = (document) => { void workspaceSymbols.updateDocument(document); if (document === vscode.window.activeTextEditor?.document) void refreshMainContext(document); };
    const subscriptions = [
        output, generatedDocuments, parserService, diagnostics, workspaceWatcher, { dispose: () => { workspaceSymbols.clear(); languageService.dispose(); } },
        vscode.workspace.onDidChangeTextDocument(({ document }) => { languageService.invalidate(document.uri.toString()); syncDocument(document); }),
        vscode.workspace.onDidCloseTextDocument((document) => { languageService.invalidate(document.uri.toString()); void workspaceSymbols.refreshUri(document.uri); if (document === vscode.window.activeTextEditor?.document) void vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', false); }),
        vscode.workspace.registerTextDocumentContentProvider('utu-generated', generatedDocuments),
        vscode.window.onDidChangeActiveTextEditor((editor) => { updateStatusBarItem(statusBarItem, editor); void refreshMainContext(editor?.document); }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => void workspaceSymbols.syncWorkspace()),
        workspaceWatcher.onDidCreate((uri) => void workspaceSymbols.refreshUri(uri)), workspaceWatcher.onDidChange((uri) => void workspaceSymbols.refreshUri(uri)), workspaceWatcher.onDidDelete((uri) => workspaceSymbols.deleteUri(uri)),
        vscode.workspace.onDidOpenTextDocument(syncDocument), vscode.workspace.onDidSaveTextDocument(syncDocument),
    ];
    if (statusBarItem) subscriptions.push(statusBarItem), updateStatusBarItem(statusBarItem, vscode.window.activeTextEditor);
    context.subscriptions.push(...subscriptions);
    registerLanguageProviders(context, languageService, workspaceSymbols);
    registerTesting(context, { languageService, output, runtimeHost: options.runtimeHost });
    registerCommands(context, { output, compilerHost: options.compilerHost, languageService, parserService, generatedDocuments, runtimeHost: options.runtimeHost });
    void workspaceSymbols.ensureInitialized(); void refreshMainContext(vscode.window.activeTextEditor?.document);
}
function createCompileStatusBarItem() { const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100); item.name = 'UTU Compile'; item.text = '$(play) UTU Compile'; item.tooltip = 'Compile the active UTU file'; item.command = 'utu.compileCurrentFile'; return item; }
function updateStatusBarItem(item, editor) { if (item) editor?.document.languageId === 'utu' ? item.show() : item.hide(); }
function createMainContextRefresher(languageService, runtimeHost) {
    let refreshVersion = 0;
    return async (document) => {
        const currentVersion = ++refreshVersion;
        try {
            const hasRunnable = document?.languageId === 'utu' && hasRunnableMain(await languageService.getDocumentIndex(document)) && !(await runtimeHost.getRunMainBlocker?.(document.getText()));
            if (currentVersion === refreshVersion) await vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', hasRunnable);
        }
        catch { if (currentVersion === refreshVersion) await vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', false); }
    };
}
function createWorkspaceSymbolController(languageService, output) {
    const index = new UtuWorkspaceSymbolIndex(languageService);
    let queue = Promise.resolve(), initialSyncPromise;
    const schedule = (label, task) => (queue = queue.then(task, task).catch((error) => { output?.appendLine(`[workspace symbols] ${label}: ${error instanceof Error ? error.message : String(error)}`); }));
    const syncWorkspace = () => schedule('sync workspace', async () => {
        const uris = await vscode.workspace.findFiles(UTU_GLOB, UTU_EXCLUDE);
        const documents = await Promise.all(uris.map((uri) => vscode.workspace.openTextDocument(uri)));
        await index.syncDocuments(documents.filter((document) => document.languageId === 'utu'), { replace: true });
    });
    return {
        clear() { index.clear(); initialSyncPromise = undefined; },
        async ensureInitialized() { initialSyncPromise ??= syncWorkspace(); await initialSyncPromise; },
        async getWorkspaceSymbols(query) { await this.ensureInitialized(); return index.getWorkspaceSymbols(query); },
        async syncWorkspace() { initialSyncPromise = syncWorkspace(); await initialSyncPromise; },
        async updateDocument(document) { if (document.languageId !== 'utu') return; await schedule(`update ${document.uri}`, () => index.updateDocument(document)); },
        async refreshUri(uri) {
            await schedule(`refresh ${uri}`, async () => {
                try {
                    const document = await vscode.workspace.openTextDocument(uri);
                    if (document.languageId !== 'utu') return void index.deleteDocument(uri.toString());
                    await index.updateDocument(document);
                }
                catch { index.deleteDocument(uri.toString()); }
            });
        },
        deleteUri(uri) { index.deleteDocument(uri.toString()); },
    };
}
