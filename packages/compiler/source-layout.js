import { runTreeWalkAnalysisPass } from "./analysis-pass-utils.js";
import {
    SOURCE_KINDS,
    analyzeSourceLayout as analyzeSharedSourceLayout,
} from "./shared/compile-plan.js";

export { SOURCE_KINDS };

// TODO(architecture): SCARY: this pass walks the normalized tree and then re-analyzes the parse tree in the same file.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

// a1.5 Analyze Source Layout:
// collect top-level runnable/export shape once so later passes consume one artifact.
export async function runA15AnalyzeSourceLayout(context) {
    runTreeWalkAnalysisPass("analyze-source-layout", context, {
        visit: () => {},
    });
    const parsed = context.artifacts.parse ?? null;
    const root = parsed?.legacyTree ?? context.legacyTree ?? context.tree ?? parsed?.tree ?? null;
    if (!root) {
        return {
            sourceKind: "module_only",
            hasMain: false,
            hasLibrary: false,
            exports: [],
            tests: [],
            benches: [],
            errors: [],
        };
    }
    return analyzeSharedSourceLayout(root);
}

export function analyzeSourceLayout(treeOrNode) {
    return analyzeSharedSourceLayout(treeOrNode);
}
