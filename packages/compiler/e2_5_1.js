import { cloneStageTree } from "./stage1.js";
import { emitStage2TypeDeclarations } from "./stage2/expansion/state.js";

// e2.5.1 Emit Type Declarations:
// materialize namespace/type/protocol declaration units before the final source join step.
export async function runE251EmitTypeDeclarations(context) {
    const expansionState = context.analyses["a2.17"]?.expansionState ?? null;
    const typeDeclarations = await emitStage2TypeDeclarations(expansionState);
    return {
        tree: cloneStageTree(context.tree),
        artifacts: {
            expansionTypeDeclarations: typeDeclarations,
        },
    };
}
