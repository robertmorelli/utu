import { runA51ValidateOptimize } from "./a5_1.js";
import { runA52AnalyzeEmitPlan } from "./a5_2.js";
import { runE51BuildBackendArtifacts } from "./e5_1.js";
import { runE52Emit } from "./e5_2.js";

// Stage 5 runner:
// own final validation and artifact emission ordering.
export async function runCompilerNewStage5(state, { runAnalysis, runRewrite }) {
    await runAnalysis(state, "a5.1", runA51ValidateOptimize);
    await runRewrite(state, "e5.1", runE51BuildBackendArtifacts);
    await runAnalysis(state, "a5.2", runA52AnalyzeEmitPlan);
    await runRewrite(state, "e5.2", runE52Emit);
}
