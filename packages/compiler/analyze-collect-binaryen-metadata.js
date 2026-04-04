import { runEmptyAnalysisPass } from "./analysis-pass-utils.js";
import { readCompilerStageBundle } from "./compiler-stage-runtime.js";

export async function runAnalyzeCollectBinaryenMetadata(context) {
    runEmptyAnalysisPass("collect-binaryen-metadata", context);
    const semanticsStage = readCompilerStageBundle(context, "semantics");
    const compilePlan = semanticsStage?.compilePlan ?? context.analyses["plan-compile"] ?? {};
    const intent = compilePlan.intent ?? context.options?.intent ?? "compile";
    return {
        shouldBuildBinaryen: intent === "compile",
        optimize: context.options?.optimize ?? true,
        emitWat: Boolean(context.options?.wat),
        hasWatInput: false,
    };
}
