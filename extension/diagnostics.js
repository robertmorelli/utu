import * as vscode from 'vscode';
import { toVscodeDiagnostic } from './adapters/core.js';
import { createDebouncedUriScheduler, logOutputError, UTU_LANGUAGE_ID } from './shared.js';
const VALIDATION_DELAY_MS = 150;
export class DiagnosticsController {
    languageService;
    output;
    compilerHost;
    collection = vscode.languages.createDiagnosticCollection('utu');
    disposables = [this.collection];
    pending = createDebouncedUriScheduler(VALIDATION_DELAY_MS, async (uri) => {
        const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === uri.toString());
        if (document)
            await this.validate(document);
    });
    constructor(languageService, output, compilerHost) {
        this.languageService = languageService;
        this.output = output;
        this.compilerHost = compilerHost;
        this.disposables.push(vscode.workspace.onDidOpenTextDocument((document) => this.isEnabledFor(document) && void this.validate(document)), vscode.workspace.onDidChangeTextDocument(({ document }) => this.getValidationMode() === 'onType' && this.isEnabledFor(document) && this.schedule(document)), vscode.workspace.onDidSaveTextDocument((document) => this.isEnabledFor(document) && void this.validate(document)), vscode.workspace.onDidCloseTextDocument((document) => (this.pending.delete(document.uri), this.collection.delete(document.uri))), vscode.workspace.onDidChangeConfiguration((event) => event.affectsConfiguration('utu') && void this.refreshOpenDocuments()));
        void this.refreshOpenDocuments();
    }
    dispose() {
        this.pending.clear();
        vscode.Disposable.from(...this.disposables).dispose();
    }
    schedule(document) {
        this.pending.schedule(document.uri);
    }
    async refreshOpenDocuments() {
        if (this.getValidationMode() === 'off') {
            this.collection.clear();
            return;
        }
        await Promise.all(vscode.workspace.textDocuments.filter((document) => document.languageId === UTU_LANGUAGE_ID).map((document) => this.validate(document)));
    }
    async validate(document) {
        const { uri, version } = document;
        try {
            const diagnostics = await this.languageService.getDiagnostics(document);
            if (!diagnostics.length && this.compilerHost)
                try { await this.compilerHost.compile(document.getText()); }
                catch (error) {
                    const symbols = (await this.languageService.getDocumentIndex(document)).topLevelSymbols;
                    const range = symbols.filter(({ kind }) => kind === 'importFunction' || kind === 'function')[Number(/function at index (\d+)/.exec(String(error?.message ?? error))?.[1])]?.range
                        ?? symbols.find((symbol) => symbol.kind === 'global')?.range
                        ?? { start: document.positionAt(0), end: document.positionAt(Math.max(document.getText().length, 1)) };
                    diagnostics.push({ range, severity: 'error', source: 'utu', message: error instanceof Error ? error.message : String(error) });
                }
            if (vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === uri.toString())?.version !== version)
                return;
            this.collection.set(uri, diagnostics.map(toVscodeDiagnostic));
        }
        catch (error) {
            logOutputError(this.output, `[utu] Validation failed for ${uri.fsPath || uri.toString()}`, error);
        }
    }
    getValidationMode() { return vscode.workspace.getConfiguration('utu').get('validation.mode', 'onType'); }
    isEnabledFor(document) { return document.languageId === UTU_LANGUAGE_ID && this.getValidationMode() !== 'off'; }
}
