import { runA31Index } from "./a3_1.js";
import { runA32Bind } from "./a3_2.js";
import { runA33Check } from "./a3_3.js";
import { runA34PlanCompile } from "./a3_4.js";

// Stage 3 runner:
// own semantic analysis ordering and outputs for downstream lowering.
export async function runCompilerNewStage3(state, { runAnalysis }) {
    await runAnalysis(state, "a3.1", runA31Index);
    await runAnalysis(state, "a3.2", runA32Bind);
    await runAnalysis(state, "a3.3", runA33Check);
    await runAnalysis(state, "a3.4", runA34PlanCompile);
}
