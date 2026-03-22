import * as vscode from 'vscode';
import { toVscodeDiagnostic } from './adapters/core.js';
const VALIDATION_DELAY_MS = 150;
const UTU_LANGUAGE_ID = 'utu';
export class DiagnosticsController {
    languageService;
    output;
    compilerHost;
    collection = vscode.languages.createDiagnosticCollection('utu');
    disposables = [this.collection];
    pending = new Map();
    constructor(languageService, output, compilerHost) {
        this.languageService = languageService;
        this.output = output;
        this.compilerHost = compilerHost;
        this.disposables.push(vscode.workspace.onDidOpenTextDocument((document) => {
            if (this.isEnabledFor(document)) {
                void this.validate(document);
            }
        }), vscode.workspace.onDidChangeTextDocument((event) => {
            if (!this.isEnabledFor(event.document))
                return;
            if (this.getValidationMode() !== 'onType')
                return;
            this.schedule(event.document);
        }), vscode.workspace.onDidSaveTextDocument((document) => {
            if (!this.isEnabledFor(document))
                return;
            if (this.getValidationMode() === 'off')
                return;
            void this.validate(document);
        }), vscode.workspace.onDidCloseTextDocument((document) => {
            this.pending.delete(document.uri.toString());
            this.collection.delete(document.uri);
        }), vscode.workspace.onDidChangeConfiguration((event) => {
            if (!event.affectsConfiguration('utu'))
                return;
            void this.refreshOpenDocuments();
        }));
        void this.refreshOpenDocuments();
    }
    dispose() {
        for (const timeout of this.pending.values()) {
            clearTimeout(timeout);
        }
        this.pending.clear();
        vscode.Disposable.from(...this.disposables).dispose();
    }
    schedule(document) {
        const key = document.uri.toString();
        clearTimeout(this.pending.get(key));
        const timeout = setTimeout(() => {
            this.pending.delete(key);
            void this.validate(document);
        }, VALIDATION_DELAY_MS);
        this.pending.set(key, timeout);
    }
    async refreshOpenDocuments() {
        const mode = this.getValidationMode();
        if (mode === 'off') {
            this.collection.clear();
            return;
        }
        const documents = vscode.workspace.textDocuments.filter((document) => this.isUtuDocument(document));
        await Promise.all(documents.map((document) => this.validate(document)));
    }
    async validate(document) {
        const { uri, version } = document;
        try {
            const diagnostics = await this.languageService.getDiagnostics(document);
            if (!diagnostics.length && this.compilerHost) {
                try { await this.compilerHost.compile(document.getText()); }
                catch (error) {
                    const symbols = (await this.languageService.getDocumentIndex(document)).topLevelSymbols;
                    const functions = symbols.filter((symbol) => symbol.kind === 'importFunction' || symbol.kind === 'function');
                    const range = functions[Number(/function at index (\d+)/.exec(String(error?.message ?? error))?.[1])]?.range
                        ?? symbols.find((symbol) => symbol.kind === 'global')?.range
                        ?? { start: document.positionAt(0), end: document.positionAt(Math.max(document.getText().length, 1)) };
                    diagnostics.push({ range, severity: 'error', source: 'utu', message: error instanceof Error ? error.message : String(error) });
                }
            }
            const current = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === uri.toString());
            if (!current || current.version !== version)
                return;
            this.collection.set(uri, diagnostics.map(toVscodeDiagnostic));
        }
        catch (error) {
            this.output.appendLine(`[utu] Validation failed for ${uri.fsPath || uri.toString()}`);
            this.output.appendLine(JSON.stringify(error));
        }
    }
    getValidationMode() {
        return vscode.workspace
            .getConfiguration('utu')
            .get('validation.mode', 'onType');
    }
    isEnabledFor(document) {
        return this.isUtuDocument(document) && this.getValidationMode() !== 'off';
    }
    isUtuDocument(document) {
        return document.languageId === UTU_LANGUAGE_ID;
    }
}
