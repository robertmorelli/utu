import { cloneStageTree } from "./stage1.js";
import { emitStage2FunctionAndRuntimeDeclarations } from "./a2_6.js";

// e2.5.2 Emit Function and Runtime Declarations:
// materialize function/global/jsgen declaration units ahead of full-source materialization.
export async function runE252EmitFunctionAndRuntimeDeclarations(context) {
    const expansionState = context.artifacts.stage2Expansion ?? null;
    const functionAndRuntimeDeclarations = await emitStage2FunctionAndRuntimeDeclarations(expansionState);
    return {
        tree: cloneStageTree(context.tree),
        artifacts: {
            expansionFunctionAndRuntimeDeclarations: functionAndRuntimeDeclarations,
        },
    };
}
