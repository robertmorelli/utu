import * as vscode from 'vscode';
import { UtuLanguageService, hasRunnableMain } from '../../lsp/src/core/languageService.js';
import { UtuParserService } from '../../lsp/src/core/parser.js';
import { registerRunCodeLensProvider } from './codeLens.js';
import { registerCommands } from './commands.js';
import { DiagnosticsController } from './diagnostics.js';
import { GeneratedDocumentStore } from './generatedDocuments.js';
import { UtuDocumentSymbolProvider } from './documentSymbols.js';
import { registerLanguageProviders } from './languageProviders.js';
import { registerTesting } from './testing.js';
import { createWorkspaceSymbolController } from './workspaceSymbols.js';
export function activateUtuExtension(context, options) {
    const output = vscode.window.createOutputChannel('UTU');
    const generatedDocuments = new GeneratedDocumentStore();
    const parserService = new UtuParserService({
        grammarWasmPath: options.grammarWasmPath,
        runtimeWasmPath: options.parserRuntimeWasmPath,
    });
    const languageService = new UtuLanguageService(parserService);
    const workspaceSymbols = createWorkspaceSymbolController(languageService, output);
    const diagnostics = new DiagnosticsController(languageService, output, options.compilerHost);
    const statusBarItem = options.showCompileStatusBar === false ? undefined : createCompileStatusBarItem();
    const scheduleMainContextRefresh = createMainContextRefresher(languageService, options.runtimeHost);
    const workspaceWatcher = vscode.workspace.createFileSystemWatcher('**/*.utu');
    const subscriptions = [
        output,
        generatedDocuments,
        parserService,
        diagnostics,
        workspaceWatcher,
        { dispose: () => {
                workspaceSymbols.clear();
                languageService.dispose();
            } },
        vscode.workspace.onDidChangeTextDocument((event) => {
            languageService.invalidate(event.document.uri.toString());
            void workspaceSymbols.updateDocument(event.document);
            if (event.document === vscode.window.activeTextEditor?.document) {
                void scheduleMainContextRefresh(event.document);
            }
        }),
        vscode.workspace.onDidCloseTextDocument((document) => {
            languageService.invalidate(document.uri.toString());
            void workspaceSymbols.refreshUri(document.uri);
            if (document === vscode.window.activeTextEditor?.document) {
                void vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', false);
            }
        }),
        vscode.workspace.registerTextDocumentContentProvider('utu-generated', generatedDocuments),
        vscode.languages.registerDocumentSymbolProvider({ language: 'utu' }, new UtuDocumentSymbolProvider(languageService)),
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            updateStatusBarItem(statusBarItem, editor);
            void scheduleMainContextRefresh(editor?.document);
        }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            void workspaceSymbols.syncWorkspace();
        }),
        workspaceWatcher.onDidCreate((uri) => {
            void workspaceSymbols.refreshUri(uri);
        }),
        workspaceWatcher.onDidChange((uri) => {
            void workspaceSymbols.refreshUri(uri);
        }),
        workspaceWatcher.onDidDelete((uri) => {
            workspaceSymbols.deleteUri(uri);
        }),
    ];
    if (statusBarItem !== undefined) {
        subscriptions.push(statusBarItem);
        updateStatusBarItem(statusBarItem, vscode.window.activeTextEditor);
    }
    subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => {
        void workspaceSymbols.updateDocument(document);
        if (document === vscode.window.activeTextEditor?.document) {
            void scheduleMainContextRefresh(document);
        }
    }), vscode.workspace.onDidSaveTextDocument((document) => {
        void workspaceSymbols.updateDocument(document);
        if (document === vscode.window.activeTextEditor?.document) {
            void scheduleMainContextRefresh(document);
        }
    }));
    context.subscriptions.push(...subscriptions);
    registerLanguageProviders(context, languageService, workspaceSymbols);
    registerRunCodeLensProvider(context, languageService);
    registerTesting(context, {
        languageService,
        output,
        runtimeHost: options.runtimeHost,
    });
    registerCommands(context, {
        output,
        compilerHost: options.compilerHost,
        languageService,
        parserService,
        generatedDocuments,
        runtimeHost: options.runtimeHost,
    });
    void workspaceSymbols.ensureInitialized();
    void scheduleMainContextRefresh(vscode.window.activeTextEditor?.document);
}
function createCompileStatusBarItem() {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    item.name = 'UTU Compile';
    item.text = '$(play) UTU Compile';
    item.tooltip = 'Compile the active UTU file';
    item.command = 'utu.compileCurrentFile';
    return item;
}
function updateStatusBarItem(item, editor) {
    if (!item)
        return;
    editor?.document.languageId === 'utu' ? item.show() : item.hide();
}
function createMainContextRefresher(languageService, runtimeHost) {
    let refreshVersion = 0;
    return async (document) => {
        const currentVersion = ++refreshVersion;
        if (document?.languageId !== 'utu') {
            await vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', false);
            return;
        }
        try {
            const index = await languageService.getDocumentIndex(document);
            if (currentVersion !== refreshVersion)
                return;
            if (!hasRunnableMain(index)) {
                await vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', false);
                return;
            }
            const blocker = await runtimeHost.getRunMainBlocker?.(document.getText());
            if (currentVersion !== refreshVersion)
                return;
            await vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', !blocker);
        }
        catch {
            if (currentVersion !== refreshVersion)
                return;
            await vscode.commands.executeCommand('setContext', 'utu.hasRunnableMain', false);
        }
    };
}
