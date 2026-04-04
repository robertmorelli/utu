import { runEmptyAnalysisPass } from "./analysis-pass-utils.js";
import { runStage3CheckPass } from "./stage3-semantic-pass.js";

// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over a3.3.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

export const COMPILE_TARGETS = Object.freeze({
    NORMAL: "normal",
    TEST: "test",
    BENCH: "bench",
});

const LEGACY_MODE_TO_TARGET = Object.freeze({
    normal: COMPILE_TARGETS.NORMAL,
    program: COMPILE_TARGETS.NORMAL,
    test: COMPILE_TARGETS.TEST,
    bench: COMPILE_TARGETS.BENCH,
});

export function normalizeStage3CompileTarget(value = COMPILE_TARGETS.NORMAL) {
    const target = LEGACY_MODE_TO_TARGET[value];
    if (target) return target;
    throw new Error(`Unknown compile target "${value}"`);
}

export function createStage3CompilePlan(semantic = {}, {
    target = COMPILE_TARGETS.NORMAL,
} = {}) {
    const normalizedTarget = normalizeStage3CompileTarget(target);
    const errors = Array.isArray(semantic.diagnostics)
        ? semantic.diagnostics
            .filter((diagnostic) => diagnostic?.severity === "error")
            .map((diagnostic) => diagnostic?.message)
            .filter((message) => typeof message === "string" && message.length > 0)
        : [];
    if (errors.length > 0) {
        throw new Error(errors[0]);
    }
    if (normalizedTarget === COMPILE_TARGETS.NORMAL && semantic.sourceKind === "module_only") {
        throw new Error("UTU normal compile requires either a top-level `fun main()` or a `library { ... }` block.");
    }
    return {
        sourceKind: semantic.sourceKind ?? "module_only",
        hasMain: Boolean(semantic.hasMain),
        hasLibrary: Boolean(semantic.hasLibrary),
        exports: Array.isArray(semantic.exports) ? [...semantic.exports] : [],
        tests: Array.isArray(semantic.tests) ? [...semantic.tests] : [],
        benches: Array.isArray(semantic.benches) ? [...semantic.benches] : [],
        target: normalizedTarget,
    };
}

export function runStage3CompilePlanPass(context) {
    const analyses = context?.analyses ?? {};
    const semantic = analyses["a3.3"] ?? runStage3CheckPass(context);
    const intent = context?.options?.intent ?? "compile";
    const mode = context?.options?.mode ?? "program";
    const target = mode === "editor" || mode === "validation"
        ? normalizeStage3CompileTarget("program")
        : normalizeStage3CompileTarget(mode);
    const wasmLocation = context?.options?.provided_wasm_bytes || context?.options?.providedWasmBytes
        ? "provided_wasm_bytes"
        : (context?.options?.where ?? "base64");
    const plan = intent === "compile"
        ? createStage3CompilePlan(semantic, { target })
        : null;

    return {
        intent,
        target,
        wasmLocation,
        plan,
    };
}

export function createStage3CompilePlanForTree(tree, {
    target = COMPILE_TARGETS.NORMAL,
} = {}) {
    const semantic = runStage3CheckPass({
        tree,
        analyses: {},
    });
    return createStage3CompilePlan(semantic, { target });
}

// a3.4 Plan Compile:
// normalize compile intent/target and build the compile plan from semantic facts.
export async function runA34PlanCompile(context) {
    runEmptyAnalysisPass("a3.4", context);
    return runStage3CompilePlanPass(context);
}
