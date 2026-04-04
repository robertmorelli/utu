import { cloneStageTree } from "./stage1.js";
import { emitStage2TypeDeclarations } from "./a2_6.js";

// e2.5.1 Emit Type Declarations:
// materialize namespace/type/protocol declaration units before the final source join step.
export async function runE251EmitTypeDeclarations(context) {
    const expansionState = context.artifacts.stage2Expansion ?? null;
    const typeDeclarations = await emitStage2TypeDeclarations(expansionState);
    return {
        tree: cloneStageTree(context.tree),
        artifacts: {
            expansionTypeDeclarations: typeDeclarations,
        },
    };
}
