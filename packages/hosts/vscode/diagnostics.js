import * as vscode from 'vscode';
import {
    DIAGNOSTIC_PROVIDER_TRIGGERS,
    getDocumentDiagnostics,
} from '../../language-platform/providers/diagnostics.js';
import { toVscodeDiagnostic } from './adapters/core.js';
import { createDebouncedUriScheduler, firstUsefulErrorLine, logOutputError, UTU_LANGUAGE_ID } from './shared.js';

const VALIDATION_DELAY_MS = 150;
const VSCODE_VALIDATION_MODES = Object.freeze({
    ON_TYPE: 'onType',
    ON_SAVE: 'onSave',
    OFF: 'off',
});

export class DiagnosticsController {
    languageService;
    output;
    compilerHost;
    compilerValidationUnavailableMessage;
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
        this.disposables.push(
            vscode.workspace.onDidOpenTextDocument((document) => this.isEnabledFor(document) && void this.validate(document)),
            vscode.workspace.onDidChangeTextDocument(({ document }) => this.shouldValidateOnType() && this.isEnabledFor(document) && this.schedule(document)),
            vscode.workspace.onDidSaveTextDocument((document) => this.isEnabledFor(document) && void this.validate(document)),
            vscode.workspace.onDidCloseTextDocument((document) => (this.pending.delete(document.uri), this.collection.delete(document.uri))),
            vscode.workspace.onDidChangeConfiguration((event) => event.affectsConfiguration('utu') && void this.refreshOpenDocuments()),
        );
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
        if (this.getValidationMode() === VSCODE_VALIDATION_MODES.OFF) {
            this.collection.clear();
            return;
        }
        await Promise.all(vscode.workspace.textDocuments
            .filter((document) => document.languageId === UTU_LANGUAGE_ID)
            .map((document) => this.validate(document, DIAGNOSTIC_PROVIDER_TRIGGERS.MANUAL)));
    }
    async validate(document, trigger = this.diagnosticTriggerForValidationMode()) {
        const { uri, version } = document;
        try {
            const diagnostics = await getDocumentDiagnostics(this.languageService, document, { trigger });
            if (shouldRunCompilerValidation(trigger) && !diagnostics.length && this.compilerHost && !this.compilerValidationUnavailableMessage)
                try { await this.compilerHost.compile(document.getText(), { uri: document.uri.toString() }); }
                catch (error) {
                    if (isSourceDiagnosticError(error)) {
                        const index = await this.languageService.getDocumentIndex(document);
                        const compileError = describeCompileError(document, error, index);
                        diagnostics.push({ range: compileError.range, severity: 'error', source: 'utu', message: compileError.message });
                    } else {
                        this.disableCompilerValidation(error);
                    }
                }
            if (vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === uri.toString())?.version !== version)
                return;
            this.collection.set(uri, diagnostics.map(toVscodeDiagnostic));
        }
        catch (error) {
            logOutputError(this.output, `[utu] Validation failed for ${uri.fsPath || uri.toString()}`, error);
        }
    }
    getValidationMode() {
        return normalizeValidationMode(vscode.workspace.getConfiguration('utu').get('validation.mode', VSCODE_VALIDATION_MODES.ON_TYPE));
    }
    isEnabledFor(document) { return document.languageId === UTU_LANGUAGE_ID && this.getValidationMode() !== VSCODE_VALIDATION_MODES.OFF; }
    shouldValidateOnType() {
        return this.getValidationMode() === VSCODE_VALIDATION_MODES.ON_TYPE;
    }
    diagnosticTriggerForValidationMode() {
        return this.getValidationMode() === VSCODE_VALIDATION_MODES.ON_TYPE
            ? DIAGNOSTIC_PROVIDER_TRIGGERS.ON_TYPE
            : DIAGNOSTIC_PROVIDER_TRIGGERS.ON_SAVE;
    }
    disableCompilerValidation(error) {
        const message = String(error instanceof Error ? error.message : error);
        if (!this.compilerValidationUnavailableMessage) {
            this.compilerValidationUnavailableMessage = message;
            logOutputError(this.output, '[utu] Compiler-backed validation disabled for this session; using syntax and semantic diagnostics only', error);
        }
    }
}

function describeCompileError(document, error, index) {
    const text = String(error instanceof Error ? error.message : error);
    const fatalMatch = /(?:^|\n)Fatal:\s+(\d+):(\d+):\s+error:\s+([^\n]+)/m.exec(text);
    const missingFunctionMatch = /function \$([A-Za-z0-9_.]+) does not exist/u.exec(text);
    const missingFunctionName = missingFunctionMatch?.[1] ?? null;
    const sourceRange = missingFunctionName
        ? findSourceRangeForMissingFunction(index, missingFunctionName)
        : undefined;
    if (fatalMatch) {
        const [, lineText, columnText, message] = fatalMatch;
        return {
            range: sourceRange ?? pointRange(document, Number(lineText) - 1, Number(columnText) - 1),
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

    const symbols = index.topLevelSymbols;
    const indexedRange = sourceRange ?? symbols.filter(({ kind }) => kind === 'importFunction' || kind === 'function')[Number(/function at index (\d+)/.exec(text)?.[1])]?.range;
    return {
        range: indexedRange
            ?? symbols.find((symbol) => symbol.kind === 'global')?.range
            ?? fullDocumentRange(document),
        message: firstUsefulErrorLine(text),
    };
}

function isSourceDiagnosticError(error) {
    const text = String(error instanceof Error ? error.message : error);
    return /(?:^|\n)Fatal:\s+\d+:\d+:\s+error:/m.test(text)
        || /Parse errors:/u.test(text)
        || /function at index \d+/u.test(text)
        || /global init must be constant/u.test(text)
        || /call param types must match/u.test(text)
        || /function body type must match/u.test(text)
        || /does not exist/u.test(text)
        || /Program terminated with exit\(\d+\)/u.test(text);
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

function findSourceRangeForMissingFunction(index, name) {
    if (!name)
        return undefined;
    const normalized = name.startsWith('str.') || name.startsWith('array.') || name.startsWith('ref.') || name.startsWith('i31.')
        ? name
        : name.replace(/\$/g, '');
    const builtinOccurrence = index.occurrences.find((occurrence) => occurrence.builtinKey === normalized);
    if (builtinOccurrence)
        return builtinOccurrence.range;
    const valueName = normalized.split('.').pop();
    return index.occurrences.find((occurrence) => occurrence.name === valueName && occurrence.role === 'value' && !occurrence.isDefinition)?.range;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function normalizeValidationMode(mode) {
    switch (mode) {
        case VSCODE_VALIDATION_MODES.ON_TYPE:
        case VSCODE_VALIDATION_MODES.ON_SAVE:
        case VSCODE_VALIDATION_MODES.OFF:
            return mode;
        default:
            throw new Error(`Unknown VS Code validation mode "${mode}"`);
    }
}

function shouldRunCompilerValidation(trigger) {
    return trigger !== DIAGNOSTIC_PROVIDER_TRIGGERS.ON_TYPE;
}
