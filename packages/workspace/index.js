import * as analysisCache from './analysis-cache.js';
import * as dependencyGraph from './dependency-graph.js';
import * as documentStore from './document-store.js';
import * as session from './session.js';
import * as workspaceSymbolIndex from './workspace-symbol-index.js';

export * from './analysis-cache.js';
export * from './dependency-graph.js';
export * from './document-store.js';
export * from './session.js';
export * from './workspace-symbol-index.js';

export {
    analysisCache,
    dependencyGraph,
    documentStore,
    session,
    workspaceSymbolIndex,
};

export const WORKSPACE_API = Object.freeze({
    analysisCache,
    dependencyGraph,
    documentStore,
    session,
    workspaceSymbolIndex,
});
