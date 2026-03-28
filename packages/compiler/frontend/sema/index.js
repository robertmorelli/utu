import { analyzeDocument } from '../../api/analyze.js';

export async function analyzeSemantics(options) {
    return analyzeDocument({ ...options, mode: options?.mode ?? 'validation' });
}
