import { runEmptyAnalysisPass } from "./a1_1.js";
import { runStage3IndexPass } from "./a3_1.js";
import { runStage3BindPass } from "./a3_2.js";

// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over a3.1 and a3.2.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

export function runStage3CheckPass(context) {
    const analyses = context?.analyses ?? {};
    const index = analyses["a3.1"] ?? runStage3IndexPass(context);
    const bind = analyses["a3.2"] ?? runStage3BindPass(context);
    const diagnostics = [
        ...index.layout.errors.map((message) => ({
            severity: "error",
            source: "utu",
            phase: "a3.3",
            message,
        })),
        ...(bind.diagnostics ?? []),
    ];
    return {
        sourceKind: index.layout.sourceKind,
        hasMain: index.layout.hasMain,
        hasLibrary: index.layout.hasLibrary,
        exports: index.layout.exports,
        tests: index.layout.tests,
        benches: index.layout.benches,
        diagnostics,
    };
}

// a3.3 Check:
// infer/check types and finalize semantic facts needed by lowering.
export async function runA33Check(context) {
    runEmptyAnalysisPass("a3.3", context);
    const semantic = runStage3CheckPass(context);
    return {
        ...semantic,
        sourceMetadata: {
            sourceKind: semantic.sourceKind,
            hasMain: semantic.hasMain,
            hasLibrary: semantic.hasLibrary,
            exports: semantic.exports,
            tests: semantic.tests,
            benches: semantic.benches,
        },
    };
}
