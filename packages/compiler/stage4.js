import { runA41CollectLoweringMetadata } from "./a4_1.js";
import { runA42CollectBinaryenMetadata } from "./a4_2.js";
import { runA43PrepareBackendMetadataDefaults } from "./a4_3.js";
import { runE41LowerToBackendIr } from "./e4_1.js";
import { runE42BuildBinaryen } from "./e4_2.js";

// Stage 4 runner:
// own backend metadata orchestration.
export async function runCompilerNewStage4(state, { runAnalysis, runRewrite }) {
    await runAnalysis(state, "a4.1", runA41CollectLoweringMetadata);
    await runAnalysis(state, "a4.2", runA42CollectBinaryenMetadata);
    await runAnalysis(state, "a4.3", runA43PrepareBackendMetadataDefaults);
    await runRewrite(state, "e4.1", runE41LowerToBackendIr);
    await runRewrite(state, "e4.2", runE42BuildBinaryen);
}
