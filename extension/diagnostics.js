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
                    const compileError = describeCompileError(document, error, symbols);
                    diagnostics.push({ range: compileError.range, severity: 'error', source: 'utu', message: compileError.message });
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

function describeCompileError(document, error, symbols) {
    const text = String(error instanceof Error ? error.message : error);
    const fatalMatch = /(?:^|\n)Fatal:\s+(\d+):(\d+):\s+error:\s+([^\n]+)/m.exec(text);
    if (fatalMatch) {
        const [, lineText, columnText, message] = fatalMatch;
        return {
            range: pointRange(document, Number(lineText) - 1, Number(columnText) - 1),
            message,
        };
    }

    const parseMatch = /(?:^|\n)\s*(.+?)\s+at\s+(\d+):(\d+)(?:\s|$)/m.exec(text);
    if (parseMatch) {
        const [, message, lineText, columnText] = parseMatch;
        return {
            range: pointRange(document, Number(lineText) - 1, Number(columnText) - 1),
            message,
        };
    }

    const indexedRange = symbols.filter(({ kind }) => kind === 'importFunction' || kind === 'function')[Number(/function at index (\d+)/.exec(text)?.[1])]?.range;
    return {
        range: indexedRange
            ?? symbols.find((symbol) => symbol.kind === 'global')?.range
            ?? fullDocumentRange(document),
        message: firstUsefulErrorLine(text),
    };
}

function firstUsefulErrorLine(text) {
    return text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line && !/^at\s/u.test(line) && !/^error:\s*Program terminated with exit\(\d+\)$/u.test(line))
        ?? text.trim()
        ?? 'Compilation failed.';
}

function pointRange(document, line, character) {
    const safeLine = clamp(line, 0, Math.max(document.lineCount - 1, 0));
    const lineText = document.lineAt(safeLine).text;
    const safeCharacter = clamp(character, 0, lineText.length);
    const start = new vscode.Position(safeLine, safeCharacter);
    const end = new vscode.Position(safeLine, Math.min(safeCharacter + 1, lineText.length));
    return { start, end };
}

function fullDocumentRange(document) {
    return { start: document.positionAt(0), end: document.positionAt(Math.max(document.getText().length, 1)) };
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
