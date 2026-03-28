import { getDocumentCompletionItems } from './completion.js';
import { getDocumentDefinition } from './definition.js';
import {
    DIAGNOSTIC_PROVIDER_MODES,
    DIAGNOSTIC_PROVIDER_TRIGGERS,
    getDocumentDiagnostics,
    modeForDiagnosticTrigger,
} from './diagnostics.js';
import { getDocumentSymbols } from './document-symbols.js';
import { getDocumentHover } from './hover.js';
import { getDocumentReferences } from './references.js';
import { getDocumentSemanticTokens } from './semantic-tokens.js';
import { getWorkspaceSymbols } from './workspace-symbols.js';

export {
    DIAGNOSTIC_PROVIDER_MODES,
    DIAGNOSTIC_PROVIDER_TRIGGERS,
    getDocumentCompletionItems,
    getDocumentDefinition,
    getDocumentDiagnostics,
    getDocumentHover,
    getDocumentReferences,
    getDocumentSemanticTokens,
    getDocumentSymbols,
    getWorkspaceSymbols,
    modeForDiagnosticTrigger,
};

export const LANGUAGE_PLATFORM_PROVIDERS = Object.freeze({
    getDocumentCompletionItems,
    getDocumentDefinition,
    getDocumentDiagnostics,
    getDocumentHover,
    getDocumentReferences,
    getDocumentSemanticTokens,
    getDocumentSymbols,
    getWorkspaceSymbols,
    modeForDiagnosticTrigger,
    DIAGNOSTIC_PROVIDER_MODES,
    DIAGNOSTIC_PROVIDER_TRIGGERS,
});
