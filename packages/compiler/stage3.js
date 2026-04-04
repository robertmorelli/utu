import { runA31Index } from "./analyze-index-symbols-and-declarations.js";
import { runA32Bind } from "./analyze-bind-references.js";
import { runA33Check } from "./analyze-semantic-checks.js";
import { runA34PlanCompile } from "./analyze-plan-compile.js";

// Stage 3 runner:
// own semantic analysis ordering and outputs for downstream lowering.
export async function runCompilerNewStage3(state, { runAnalysis }) {
    await runAnalysis(state, "a3.1", runA31Index);
    await runAnalysis(state, "a3.2", runA32Bind);
    await runAnalysis(state, "a3.3", runA33Check);
    await runAnalysis(state, "a3.4", runA34PlanCompile);
}
