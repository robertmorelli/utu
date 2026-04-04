import { runEmptyAnalysisPass } from "./analysis-pass-utils.js";
import { readCompilerStageBundle } from "./compiler-stage-runtime.js";
import { collectJsgenPlanFromTree } from "./js-emission-plan.js";
import { rootNode } from "./stage-tree.js";

function normalizeEmitMode(mode) {
    return mode === "normal" ? "program" : mode;
}

export async function runAnalyzeJsEmissionInputs(context) {
    runEmptyAnalysisPass("analyze-js-emission-inputs", context);
    const outputPlan = context.analyses["validate-output-plan"] ?? {};
    const mode = normalizeEmitMode(outputPlan.backendOptions?.mode ?? "program");
    const profile = outputPlan.backendOptions?.profile ?? null;
    if (!outputPlan.shouldEmitCompileArtifacts) {
        return {
            mode,
            profile,
            jsgen: {
                strings: [],
                exportNames: [],
                moduleImports: [],
            },
        };
    }

    const stage5 = context.artifacts.stage5 ?? null;
    const metadata = stage5?.metadata ?? {};
    const semanticsStage = readCompilerStageBundle(context, "semantics");
    const semantic = semanticsStage?.semantic ?? context.analyses["check-semantics"] ?? {};
    return {
        mode,
        profile,
        jsgen: collectJsgenPlanFromTree(rootNode(context.tree) ?? null, {
            mode,
            profile,
            metadata,
            semantic,
        }),
    };
}
