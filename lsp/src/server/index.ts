import type { UtuLanguageService } from '../core/languageService';
import type { UtuTextDocument } from '../core/types';

export interface UtuServerDocumentStore {
  all(): readonly UtuTextDocument[];
  get(uri: string): UtuTextDocument | undefined;
}

export interface UtuServerCapabilities {
  hover: boolean;
  definition: boolean;
  references: boolean;
  completion: boolean;
  documentSymbols: boolean;
  workspaceSymbols: boolean;
  semanticTokens: boolean;
  diagnostics: boolean;
}

export function getDefaultServerCapabilities(): UtuServerCapabilities {
  return {
    hover: true,
    definition: true,
    references: true,
    completion: true,
    documentSymbols: true,
    workspaceSymbols: true,
    semanticTokens: true,
    diagnostics: true,
  };
}

export class UtuLanguageServerCore {
  constructor(readonly languageService: UtuLanguageService) {}

  invalidateDocument(uri: string): void {
    this.languageService.invalidate(uri);
  }

  clearDocuments(): void {
    this.languageService.clear();
  }
}
