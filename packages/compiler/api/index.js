import { analyzeDocument } from './analyze.js';
import { compileDocument } from './compile.js';
import { getDocumentMetadata } from './metadata.js';
import { validateWat } from '../core.js';

export {
    analyzeDocument,
    compileDocument,
    getDocumentMetadata,
    validateWat,
};

export const COMPILER_API = Object.freeze({
    analyzeDocument,
    compileDocument,
    getDocumentMetadata,
    validateWat,
});
