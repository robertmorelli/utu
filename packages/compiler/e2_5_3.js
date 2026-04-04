import { cloneStageTree } from "./stage1.js";
import { materializeStage2ExpandedSource } from "./stage2/materialize-source.js";

// e2.5.3 Emit Top-Level Items and Materialize Source:
// join namespace outputs plus rewritten top-level items into one expanded source artifact.
export async function runE253MaterializeExpandedSource(context) {
    const expansionState = context.artifacts.stage2Expansion ?? null;
    const materialized = await materializeStage2ExpandedSource(expansionState);
    return {
        tree: cloneStageTree(context.tree),
        artifacts: {
            expansionMaterializedSource: materialized,
        },
    };
}
