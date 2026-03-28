import { analyzeDocument } from '../../api/analyze.js';

export async function bindDocument(options) {
    const analysis = await analyzeDocument({ ...options, mode: options?.mode ?? 'editor' });
    return {
        header: analysis.header,
        body: analysis.body,
        diagnostics: analysis.diagnostics,
    };
}
