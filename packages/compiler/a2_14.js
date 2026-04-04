import { parseTree } from "../document/tree-sitter.js";
import {
    createStage2ExpansionState,
} from "./stage2/expansion-state.js";
import { loadStage2ExpansionImports } from "./stage2/load-imports.js";

// TODO(architecture): SCARY: this analysis pass is layering on top of a2.6/a2.5 instead of owning one stage boundary.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

// a2.14 Load Imports:
// own cross-file loading and parse-cache setup before later expansion analyses.
export async function runA214LoadImports(context) {
    const preflight = context.analyses["a2.6"] ?? context.analyses["a2.5"] ?? context.options ?? {};
    const pipeline = createStage2ExpansionState({
        treeOrNode: context.artifacts.parse?.legacyTree ?? context.legacyTree ?? null,
        source: context.source,
        uri: context.uri ?? null,
        loadImport: context.loadImport ?? null,
        parseSource: async (sourceText) => {
            const parsed = parseTree(
                context.parser,
                sourceText,
                "Tree-sitter returned no syntax tree for the rewritten document.",
            );
            return {
                root: parsed.tree.rootNode,
                dispose: parsed.dispose,
            };
        },
        expandOptions: preflight ?? {},
    });
    const loaded = await loadStage2ExpansionImports(pipeline);
    return {
        pipeline,
        expansionState: pipeline,
        ...loaded,
    };
}
