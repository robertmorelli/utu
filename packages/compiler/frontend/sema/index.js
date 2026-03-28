import { analyzeDocument } from '../../api/analyze.js';

export async function analyzeSemantics(options) {
    return createSemanticSnapshot(await analyzeDocument({ ...options, mode: options?.mode ?? 'validation' }));
}

export function createSemanticSnapshot(analysis) {
    return {
        kind: 'semantic',
        mode: analysis.mode,
        uri: analysis.uri,
        syntax: analysis.syntax,
        header: analysis.header,
        body: analysis.body,
        diagnostics: analysis.diagnostics,
    };
}
