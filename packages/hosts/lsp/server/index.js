import { UtuParserService } from '../../../document/index.js';
import { UtuLanguageService } from '../../../language-platform/index.js';
import { UtuDocumentStore, UtuWorkspaceSession, UtuWorkspaceTextDocument } from '../../../workspace/index.js';
import { compileDocument } from '../../../../packages/compiler/api/index.js';
import data from '../../../../jsondata/server.data.json' with { type: 'json' };

const DEFAULT_SERVER_CAPABILITIES = data.defaultServerCapabilities;
export const LSP_SERVER_DEFAULTS = Object.freeze({
    workspaceFolders: Object.freeze([]),
    skippedWorkspaceDirectories: Object.freeze([...data.skippedWorkspaceDirectories]),
    compileDocument,
});

export const getDefaultServerCapabilities = () => ({ ...DEFAULT_SERVER_CAPABILITIES });
export class UtuServerTextDocument extends UtuWorkspaceTextDocument {}
export class UtuServerDocumentManager extends UtuDocumentStore {
    constructor(options = {}) {
        const normalized = normalizeLspServerOptions(options);
        super({
            workspaceFolders: normalized.workspaceFolders,
            documentClass: UtuServerTextDocument,
            skippedWorkspaceDirectories: normalized.skippedWorkspaceDirectories,
        });
    }
}
export class UtuLanguageServerCore extends UtuWorkspaceSession {
    constructor(options = {}) {
        const normalized = normalizeLspServerOptions(options);
        const parserService = normalized.parserService ?? new UtuParserService({
            grammarWasmPath: normalized.grammarWasmPath,
            runtimeWasmPath: normalized.runtimeWasmPath,
        });
        const languageService = normalized.languageService ?? new UtuLanguageService(parserService, {
            compileDocument: normalized.compileDocument,
        });
        super({
            ...normalized,
            parserService,
            languageService,
            documents: normalized.documents ?? new UtuServerDocumentManager(normalized),
            documentClass: UtuServerTextDocument,
            skippedWorkspaceDirectories: normalized.skippedWorkspaceDirectories,
            compileDocument: normalized.compileDocument,
        });
    }
}
export class UtuLanguageServer extends UtuLanguageServerCore {}

function normalizeLspServerOptions(options = {}) {
    return {
        ...options,
        workspaceFolders: options.workspaceFolders ?? LSP_SERVER_DEFAULTS.workspaceFolders,
        skippedWorkspaceDirectories: options.skippedWorkspaceDirectories ?? LSP_SERVER_DEFAULTS.skippedWorkspaceDirectories,
        compileDocument: options.compileDocument ?? LSP_SERVER_DEFAULTS.compileDocument,
    };
}
