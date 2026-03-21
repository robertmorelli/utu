import * as vscode from 'vscode';
import { UtuLanguageService } from '../../lsp/src/core/languageService';
import { toVscodeDocumentSymbol } from './adapters/core';

export class UtuDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  constructor(private readonly languageService: UtuLanguageService) {}

  async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
    const symbols = await this.languageService.getDocumentSymbols(document);
    return symbols.map(toVscodeDocumentSymbol);
  }
}
