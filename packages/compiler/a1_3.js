import { collectParseDiagnostics } from "../document/index.js";

// a1.3 Collect Syntax Diagnostics:
// walk the parsed tree and collect syntax diagnostics from document spans.
export async function runA13CollectSyntaxDiagnostics(context) {
    const parse = context.artifacts.parse;
    const rootNode = parse?.legacyTree?.rootNode ?? null;
    const document = parse?.document ?? context.analyses["a1.1"]?.document ?? null;
    if (!rootNode || !document) return [];
    return collectParseDiagnostics(rootNode, document);
}
