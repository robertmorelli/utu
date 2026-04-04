import { runEmptyAnalysisPass } from "./analysis-pass-utils.js";

// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over a3.4.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

// a4.2 Collect Binaryen Metadata:
// gather build metadata and options consumed by e4.2.
export async function runA42CollectBinaryenMetadata(context) {
    runEmptyAnalysisPass("a4.2", context);
    const check = context.analyses["a3.4"] ?? {};
    const intent = check.intent ?? context.options?.intent ?? "compile";
    return {
        shouldBuildBinaryen: intent === "compile",
        optimize: context.options?.optimize ?? true,
        emitWat: Boolean(context.options?.wat),
        hasWatInput: false,
    };
}
