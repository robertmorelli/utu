import { UtuDocumentStore, UtuWorkspaceSession, UtuWorkspaceTextDocument } from '../../../workspace/index.js';
import { validateWat } from '../../../compiler/api/index.js';
import data from '../../../../jsondata/server.data.json' with { type: 'json' };
const DEFAULT_SERVER_CAPABILITIES = data.defaultServerCapabilities;
export const getDefaultServerCapabilities = () => ({ ...DEFAULT_SERVER_CAPABILITIES });
export class UtuServerTextDocument extends UtuWorkspaceTextDocument {}
export class UtuServerDocumentManager extends UtuDocumentStore {
    constructor(options) {
        super({
            workspaceFolders: options.workspaceFolders ?? [],
            documentClass: UtuServerTextDocument,
            skippedWorkspaceDirectories: data.skippedWorkspaceDirectories,
        });
    }
}
export class UtuLanguageServerCore extends UtuWorkspaceSession {
    constructor(options = {}) {
        super({
            ...options,
            workspaceFolders: options.workspaceFolders ?? [],
            documents: new UtuServerDocumentManager(options),
            documentClass: UtuServerTextDocument,
            skippedWorkspaceDirectories: data.skippedWorkspaceDirectories,
            validateWat,
        });
    }
}
export class UtuLanguageServer extends UtuLanguageServerCore {}
