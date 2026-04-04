import { parseTree } from "../document/tree-sitter.js";
import { readCompilerArtifact } from "./compiler-stage-runtime.js";
import { materializeExpandedSource } from "./edit-materialize-expanded-source.js";
import { snapshotExpansionForTooling } from "./expansion-snapshot.js";

function ensureExpansionParseSource(expansionState, context) {
    if (!expansionState || expansionState.parseSource) return;
    expansionState.parseSource = async (sourceText) => {
        const parsed = parseTree(
            context.parser,
            sourceText,
            "Tree-sitter returned no syntax tree for the rewritten document.",
        );
        return {
            root: parsed.tree.rootNode,
            dispose: parsed.dispose,
        };
    };
}

export async function runExpand(context) {
    const expansionState = readCompilerArtifact(context, "expansionSession");
    ensureExpansionParseSource(expansionState, context);
    const materializedSource = expansionState
        ? await materializeExpandedSource(expansionState)
        : null;
    return snapshotExpansionForTooling(expansionState, { materializedSource });
}
