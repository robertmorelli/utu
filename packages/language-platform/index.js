import * as documentIndex from './core/documentIndex.js';
import * as types from './core/types.js';
import * as hoverDocs from './core/hoverDocs.js';
import * as runnables from './core/runnables.js';
import * as symbols from './core/symbols.js';
import * as workspaceSymbols from './core/workspaceSymbols.js';
import * as providers from './providers/index.js';

export * from './core/documentIndex.js';
export * from './core/runnables.js';
export * from './core/symbols.js';
export * from './core/types.js';
export * from './core/workspaceSymbols.js';
export * from './core/hoverDocs.js';
export * from './providers/index.js';

export const languageService = Object.freeze({
    ...documentIndex,
    ...runnables,
    ...symbols,
    ...workspaceSymbols,
});

export {
    hoverDocs,
    providers,
    types,
};

export const LANGUAGE_PLATFORM_API = Object.freeze({
    languageService,
    types,
    hoverDocs,
    providers,
});
