import * as vscode from 'vscode';
import { hasRunnableMain } from '../../language-platform/index.js';
import { registerCommands } from './commands.js'; import { DiagnosticsController } from './diagnostics.js';
import { GeneratedDocumentStore } from './generatedDocuments.js'; import { registerLanguageProviders } from './languageProviders.js';
import { UTU_GLOB } from './shared.js';
import { registerTesting } from './testing.js';
import { createVscodeWorkspaceAdapter } from './workspaceAdapter.js';
export function activateUtuExtension(context, options) {
    const output = vscode.window.createOutputChannel('UTU'), generatedDocuments = new GeneratedDocumentStore(), { session, languageService, workspaceSymbols } = createVscodeWorkspaceAdapter({ grammarWasmPath: options.grammarWasmPath, runtimeWasmPath: options.parserRuntimeWasmPath, output }), diagnostics = new DiagnosticsController(languageService, output, options.diagnosticsCompilerHost ?? options.compilerHost), statusBarItem = options.showCompileStatusBar === false ? undefined : createCompileStatusBarItem(), refreshMainContext = createMainContextRefresher(languageService, options.runtimeHost), workspaceWatcher = vscode.workspace.createFileSystemWatcher(UTU_GLOB);
    const syncDocument = (document) => { void workspaceSymbols.updateDocument(document); if (document === vscode.window.activeTextEditor?.document) void refreshMainContext(document); };
    const subscriptions = [
        output, generatedDocuments, diagnostics, workspaceWatcher, { dispose: () => { workspaceSymbols.clear(); session.dispose(); } },
        vscode.workspace.onDidChangeTextDocument(({ document }) => { syncDocument(document); }),
        vscode.workspace.onDidCloseTextDocument((document) => { void session.closeDocument(document.uri.toString()); void workspaceSymbols.refreshUri(document.uri); if (document === vscode.window.activeTextEditor?.document) void vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', false); }),
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
    registerCommands(context, { output, compilerHost: options.compilerHost, languageService, parserService: session.parserService, generatedDocuments, runtimeHost: options.runtimeHost });
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
