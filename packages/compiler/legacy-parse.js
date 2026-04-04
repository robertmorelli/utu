import { parseTree } from "../document/tree-sitter.js";
import { cloneStageNode as cloneLegacyNode } from "./compiler-stage-runtime.js";

export { cloneLegacyNode };

export async function runParseSource(context) {
    const load = context.analyses["load-source"] ?? {};
    const parsed = parseTree(context.parser, load.source ?? context.source, "Tree-sitter returned no syntax tree for the document.");
    const document = load.document ?? null;
    return {
        source: load.source ?? context.source,
        uri: load.uri ?? context.uri ?? 'memory://utu',
        version: load.version ?? context.version ?? 0,
        document,
        legacyTree: parsed.tree,
        disposeLegacyTree: parsed.dispose,
        tree: cloneLegacyNode(parsed.tree.rootNode),
    };
}
