import * as vscode from 'vscode';
import { UtuLanguageService } from '../../lsp/src/core/languageService';
import { toVscodeDiagnostic } from './adapters/core';
import { formatError } from './compilerHost';

type ValidationMode = 'onType' | 'onSave' | 'off';
const VALIDATION_DELAY_MS = 150;
const UTU_LANGUAGE_ID = 'utu';

export class DiagnosticsController implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('utu');
  private readonly disposables: vscode.Disposable[] = [this.collection];
  private readonly pending = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly languageService: UtuLanguageService,
    private readonly output: vscode.OutputChannel,
  ) {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (this.isEnabledFor(document)) {
          void this.validate(document);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!this.isEnabledFor(event.document)) return;
        if (this.getValidationMode() !== 'onType') return;
        this.schedule(event.document);
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (!this.isEnabledFor(document)) return;
        if (this.getValidationMode() === 'off') return;
        void this.validate(document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.pending.delete(document.uri.toString());
        this.collection.delete(document.uri);
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration('utu')) return;
        void this.refreshOpenDocuments();
      }),
    );

    void this.refreshOpenDocuments();
  }

  dispose(): void {
    for (const timeout of this.pending.values()) {
      clearTimeout(timeout);
    }

    this.pending.clear();
    vscode.Disposable.from(...this.disposables).dispose();
  }

  private schedule(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    clearTimeout(this.pending.get(key));

    const timeout = setTimeout(() => {
      this.pending.delete(key);
      void this.validate(document);
    }, VALIDATION_DELAY_MS);

    this.pending.set(key, timeout);
  }

  private async refreshOpenDocuments(): Promise<void> {
    const mode = this.getValidationMode();

    if (mode === 'off') {
      this.collection.clear();
      return;
    }

    const documents = vscode.workspace.textDocuments.filter((document) => this.isUtuDocument(document));
    await Promise.all(documents.map((document) => this.validate(document)));
  }

  private async validate(document: vscode.TextDocument): Promise<void> {
    const { uri, version } = document;

    try {
      const diagnostics = await this.languageService.getDiagnostics(document);
      const current = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === uri.toString());

      if (!current || current.version !== version) return;
      this.collection.set(uri, diagnostics.map(toVscodeDiagnostic));
    } catch (error) {
      this.output.appendLine(`[utu] Validation failed for ${uri.fsPath || uri.toString()}`);
      this.output.appendLine(formatError(error));
    }
  }

  private getValidationMode(): ValidationMode {
    return vscode.workspace
      .getConfiguration('utu')
      .get<ValidationMode>('validation.mode', 'onType');
  }

  private isEnabledFor(document: vscode.TextDocument): boolean {
    return this.isUtuDocument(document) && this.getValidationMode() !== 'off';
  }

  private isUtuDocument(document: vscode.TextDocument): boolean {
    return document.languageId === UTU_LANGUAGE_ID;
  }
}
