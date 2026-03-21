import * as vscode from 'vscode';
import { UtuLanguageService } from '../../lsp/src/core/languageService';
import {
  toVscodeCompletionItem,
  toVscodeDocumentHighlight,
  toVscodeHover,
  toVscodeLocation,
  toVscodeWorkspaceSymbol,
  toVscodeRange,
} from './adapters/core';

const DOCUMENT_SELECTOR: vscode.DocumentSelector = [{ language: 'utu' }];
const SEMANTIC_TOKEN_LEGEND = new vscode.SemanticTokensLegend(
  ['type', 'enumMember', 'function', 'parameter', 'variable', 'property'],
  ['declaration'],
);

export function registerLanguageProviders(
  context: vscode.ExtensionContext,
  languageService: UtuLanguageService,
): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(DOCUMENT_SELECTOR, new UtuHoverProvider(languageService)),
    vscode.languages.registerDefinitionProvider(DOCUMENT_SELECTOR, new UtuDefinitionProvider(languageService)),
    vscode.languages.registerReferenceProvider(DOCUMENT_SELECTOR, new UtuReferenceProvider(languageService)),
    vscode.languages.registerDocumentHighlightProvider(
      DOCUMENT_SELECTOR,
      new UtuDocumentHighlightProvider(languageService),
    ),
    vscode.languages.registerCompletionItemProvider(
      DOCUMENT_SELECTOR,
      new UtuCompletionProvider(languageService),
      '.',
    ),
    vscode.languages.registerDocumentSemanticTokensProvider(
      DOCUMENT_SELECTOR,
      new UtuSemanticTokensProvider(languageService),
      SEMANTIC_TOKEN_LEGEND,
    ),
    vscode.languages.registerWorkspaceSymbolProvider(
      new UtuWorkspaceSymbolProvider(languageService),
    ),
  );
}

class UtuHoverProvider implements vscode.HoverProvider {
  constructor(private readonly languageService: UtuLanguageService) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | null> {
    const hover = await this.languageService.getHover(document, position);
    return hover ? toVscodeHover(hover) : null;
  }
}

class UtuDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly languageService: UtuLanguageService) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Definition | null> {
    const location = await this.languageService.getDefinition(document, position);
    return location ? toVscodeLocation(location) : null;
  }
}

class UtuReferenceProvider implements vscode.ReferenceProvider {
  constructor(private readonly languageService: UtuLanguageService) {}

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
  ): Promise<vscode.Location[]> {
    const locations = await this.languageService.getReferences(
      document,
      position,
      context.includeDeclaration,
    );
    return locations.map(toVscodeLocation);
  }
}

class UtuDocumentHighlightProvider implements vscode.DocumentHighlightProvider {
  constructor(private readonly languageService: UtuLanguageService) {}

  async provideDocumentHighlights(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.DocumentHighlight[]> {
    const highlights = await this.languageService.getDocumentHighlights(document, position);
    return highlights.map(toVscodeDocumentHighlight);
  }
}

class UtuSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  constructor(private readonly languageService: UtuLanguageService) {}

  async provideDocumentSemanticTokens(
    document: vscode.TextDocument,
  ): Promise<vscode.SemanticTokens> {
    const builder = new vscode.SemanticTokensBuilder(SEMANTIC_TOKEN_LEGEND);
    const tokens = await this.languageService.getDocumentSemanticTokens(document);

    for (const token of tokens) {
      builder.push(
        toVscodeRange(token.range),
        token.type,
        token.modifiers,
      );
    }

    return builder.build();
  }
}

class UtuCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly languageService: UtuLanguageService) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const items = await this.languageService.getCompletionItems(document, position);
    return items.map(toVscodeCompletionItem);
  }
}

class UtuWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  constructor(private readonly languageService: UtuLanguageService) {}

  async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
    const workspaceUris = await vscode.workspace.findFiles('**/*.utu', '**/node_modules/**');
    const documents = await Promise.all(
      workspaceUris.map((uri) => vscode.workspace.openTextDocument(uri)),
    );
    const symbols = await this.languageService.getWorkspaceSymbols(query, documents);
    return symbols.map(toVscodeWorkspaceSymbol);
  }
}
