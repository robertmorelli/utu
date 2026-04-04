import { runEmptyAnalysisPass } from "./a1_1.js";
import { rootNode, throwOnParseErrors } from "./a1_4.js";

// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over Stage 3 and Stage 4 facts.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

// a5.1 Validate Optimize:
// validate and optimize finalized Binaryen modules without new language lowering.
export async function runA51ValidateOptimize(context) {
    runEmptyAnalysisPass("a5.1", context);
    const legacyTree = context.artifacts.expand?.legacyTree
        ?? context.artifacts.parse?.legacyTree
        ?? context.legacyTree;
    const root = rootNode(legacyTree);
    throwOnParseErrors(root);
    const check = context.analyses["a3.4"] ?? {};
    const intent = check.intent ?? context.options?.intent ?? "compile";
    const target = check.target ?? context.options?.mode ?? "program";
    const wasmLocation = check.wasmLocation
        ?? ((context.options?.provided_wasm_bytes || context.options?.providedWasmBytes)
            ? "provided_wasm_bytes"
            : (context.options?.where ?? "base64"));
    const stage4 = context.analyses["a4.1"] ?? {};
    const stage4Binaryen = context.analyses["a4.2"] ?? {};
    const expansion = context.artifacts.expansion ?? null;
    return {
        expandedSource: context.source,
        changed: Boolean(expansion?.changed),
        shouldEmitCompileArtifacts: intent === "compile",
        backendOptions: {
            ...(stage4.backendOptions ?? {}),
            mode: target,
        },
        binaryenOptions: {
            optimize: stage4Binaryen.optimize ?? (context.options?.optimize ?? true),
            emitWat: stage4Binaryen.emitWat ?? Boolean(context.options?.wat),
        },
        wasmLocation,
        moduleFormat: context.options?.moduleFormat ?? "esm",
        includeSource: Boolean(context.options?.includeSource),
        sourceForJs: context.options?.includeSource
            ? (context.options?.originalSource ?? context.source)
            : null,
        hasBinaryenArtifact: Boolean(context.artifacts.stage4Binaryen?.wasm),
    };
}
