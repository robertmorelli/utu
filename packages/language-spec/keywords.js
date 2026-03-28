import { CORE_TYPE_DOCS, KEYWORD_DOCS, LITERAL_DOCS } from './docs.js';

export const KEYWORD_COMPLETIONS = Object.keys(KEYWORD_DOCS);
export const CORE_TYPE_COMPLETIONS = Object.keys(CORE_TYPE_DOCS).filter((word) => word !== 'null');
export const LITERAL_COMPLETIONS = Object.keys(LITERAL_DOCS);
