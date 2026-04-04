import { runEmptyAnalysisPass } from "./analysis-pass-utils.js";
import { runAnalyzeBindReferences } from "./analyze-bind-references.js";
import { runAnalyzeIndexSymbolsAndDeclarations } from "./analyze-index-symbols-and-declarations.js";

export async function runAnalyzeSemanticChecks(context) {
    runEmptyAnalysisPass("check-semantics", context);
    const analyses = context?.analyses ?? {};
    const index = analyses["index-top-level-symbols"] ?? runAnalyzeIndexSymbolsAndDeclarations(context);
    const bind = analyses["bind-top-level-symbols"] ?? runAnalyzeBindReferences(context);
    const diagnostics = [
        ...index.layout.errors.map((message) => ({
            severity: "error",
            source: "utu",
            phase: "check-semantics",
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
        sourceMetadata: {
            sourceKind: index.layout.sourceKind,
            hasMain: index.layout.hasMain,
            hasLibrary: index.layout.hasLibrary,
            exports: index.layout.exports,
            tests: index.layout.tests,
            benches: index.layout.benches,
        },
    };
}
