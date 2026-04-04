import { runA41CollectLoweringMetadata } from "./analyze-collect-lowering-metadata.js";
import { runA42CollectBinaryenMetadata } from "./analyze-collect-binaryen-metadata.js";
import { runA43PrepareBackendMetadataDefaults } from "./analyze-prepare-backend-metadata-defaults.js";
import { runE41LowerToBackendIr } from "./edit-lower-to-backend-ir.js";
import { runE42BuildBinaryen } from "./edit-build-binaryen-artifacts.js";

// Stage 4 runner:
// own backend metadata orchestration.
export async function runCompilerNewStage4(state, { runAnalysis, runRewrite }) {
    await runAnalysis(state, "a4.1", runA41CollectLoweringMetadata);
    await runAnalysis(state, "a4.2", runA42CollectBinaryenMetadata);
    await runAnalysis(state, "a4.3", runA43PrepareBackendMetadataDefaults);
    await runRewrite(state, "e4.1", runE41LowerToBackendIr);
    await runRewrite(state, "e4.2", runE42BuildBinaryen);
}
