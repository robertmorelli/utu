import { collectParseDiagnostics } from "../document/index.js";

// walk the parsed tree and collect syntax diagnostics from document spans.
export async function runCollectSyntaxDiagnostics(context) {
    const parse = context.artifacts.parse;
    const rootNode = parse?.legacyTree?.rootNode ?? context.legacyTree?.rootNode ?? context.tree ?? null;
    const document = parse?.document ?? context.analyses["load-source"]?.document ?? null;
    if (!rootNode || !document) return [];
    return collectParseDiagnostics(rootNode, document);
}
