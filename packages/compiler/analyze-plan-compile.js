import { runEmptyAnalysisPass } from "./analysis-pass-utils.js";
import { COMPILE_TARGETS, normalizeCompileTarget } from "./shared/compile-plan.js";
import { runAnalyzeSemanticChecks } from "./analyze-semantic-checks.js";

export const normalizeCompilerCompileTarget = normalizeCompileTarget;

export function createCompilerCompilePlan(semantic = {}, {
    target = COMPILE_TARGETS.NORMAL,
} = {}) {
    const normalizedTarget = normalizeCompilerCompileTarget(target);
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

export async function createCompilerCompilePlanForTree(tree, {
    target = COMPILE_TARGETS.NORMAL,
} = {}) {
    const semantic = await runAnalyzeSemanticChecks({
        tree,
        analyses: {},
    });
    return createCompilerCompilePlan(semantic, { target });
}

export async function runAnalyzePlanCompile(context) {
    runEmptyAnalysisPass("plan-compile", context);
    const semantic = context?.analyses?.["check-semantics"] ?? await runAnalyzeSemanticChecks(context);
    const intent = context?.options?.intent ?? "compile";
    const mode = context?.options?.mode ?? "program";
    const target = mode === "editor" || mode === "validation"
        ? normalizeCompilerCompileTarget("program")
        : normalizeCompilerCompileTarget(mode);
    const wasmLocation = context?.options?.provided_wasm_bytes || context?.options?.providedWasmBytes
        ? "provided_wasm_bytes"
        : (context?.options?.where ?? "base64");
    const plan = intent === "compile"
        ? createCompilerCompilePlan(semantic, { target })
        : null;

    return {
        intent,
        target,
        wasmLocation,
        plan,
    };
}
