import { runEmptyAnalysisPass } from "./analysis-pass-utils.js";
import { readCompilerStageBundle } from "./compiler-stage-runtime.js";
import { createBackendMetadataDefaults } from "./backend-metadata-defaults.js";

export async function runAnalyzePrepareBackendMetadataDefaults(context) {
    runEmptyAnalysisPass("prepare-backend-metadata-defaults", context);
    const loweringMetadata = context.analyses["collect-lowering-metadata"] ?? {};
    const semanticsStage = readCompilerStageBundle(context, "semantics");
    const semantic = semanticsStage?.semantic ?? context.analyses["check-semantics"] ?? {};
    return createBackendMetadataDefaults({
        loweringMetadata,
        semantic,
        treeOrNode: context.tree ?? context.legacyTree?.rootNode ?? context.artifacts.parse?.legacyTree?.rootNode ?? null,
        options: context.options ?? {},
    });
}
