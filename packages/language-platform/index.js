import * as languageService from './core/languageService.js';
import * as types from './core/types.js';
import * as hoverDocs from './core/hoverDocs.js';
import * as providers from './providers/index.js';

export * from './core/languageService.js';
export * from './core/types.js';
export * from './core/hoverDocs.js';
export * from './providers/index.js';

export {
    hoverDocs,
    languageService,
    providers,
    types,
};

export const LANGUAGE_PLATFORM_API = Object.freeze({
    languageService,
    types,
    hoverDocs,
    providers,
});
