import { runA51ValidateOptimize } from "./analyze-validate-optimize-output-plan.js";
import { runA52AnalyzeEmitPlan } from "./analyze-js-emission-inputs.js";
import { runE51BuildBackendArtifacts } from "./edit-build-backend-artifacts.js";
import { runE52Emit } from "./edit-emit-output-artifacts.js";

// Stage 5 runner:
// own final validation and artifact emission ordering.
export async function runCompilerNewStage5(state, { runAnalysis, runRewrite }) {
    await runAnalysis(state, "a5.1", runA51ValidateOptimize);
    await runRewrite(state, "e5.1", runE51BuildBackendArtifacts);
    await runAnalysis(state, "a5.2", runA52AnalyzeEmitPlan);
    await runRewrite(state, "e5.2", runE52Emit);
}
