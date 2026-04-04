import { runEmptyAnalysisPass } from "./analysis-pass-utils.js";
import { readCompilerArtifact, readCompilerStageBundle } from "./compiler-stage-runtime.js";
import { rootNode, throwOnParseErrors } from "./stage-tree.js";

export async function runAnalyzeValidateOptimizeOutputPlan(context) {
    runEmptyAnalysisPass("validate-output-plan", context);
    const root = rootNode(context.tree ?? context.legacyTree?.rootNode ?? context.artifacts.parse?.legacyTree?.rootNode ?? null);
    throwOnParseErrors(root);
    const semanticsStage = readCompilerStageBundle(context, "semantics");
    const backendStage = readCompilerStageBundle(context, "backend");
    const expansionStage = readCompilerStageBundle(context, "expansion");
    const compilePlan = semanticsStage?.compilePlan ?? context.analyses["plan-compile"] ?? {};
    const intent = compilePlan.intent ?? context.options?.intent ?? "compile";
    const target = compilePlan.target ?? context.options?.mode ?? "program";
    const wasmLocation = compilePlan.wasmLocation
        ?? ((context.options?.provided_wasm_bytes || context.options?.providedWasmBytes)
            ? "provided_wasm_bytes"
            : (context.options?.where ?? "base64"));
    const loweringMetadata = backendStage?.loweringMetadata ?? context.analyses["collect-lowering-metadata"] ?? {};
    const binaryenMetadata = backendStage?.binaryenMetadata ?? context.analyses["collect-binaryen-metadata"] ?? {};
    const expansion = expansionStage?.cleanup?.finalExpansion
        ?? expansionStage?.materialization?.reparsedExpansion
        ?? context.artifacts.expansion
        ?? null;
    return {
        expandedSource: context.source,
        changed: Boolean(expansion?.changed),
        shouldEmitCompileArtifacts: intent === "compile",
        backendOptions: {
            ...(loweringMetadata.backendOptions ?? {}),
            mode: target,
        },
        binaryenOptions: {
            optimize: binaryenMetadata.optimize ?? (context.options?.optimize ?? true),
            emitWat: binaryenMetadata.emitWat ?? Boolean(context.options?.wat),
        },
        wasmLocation,
        moduleFormat: context.options?.moduleFormat ?? "esm",
        includeSource: Boolean(context.options?.includeSource),
        sourceForJs: context.options?.includeSource
            ? (context.options?.originalSource ?? context.source)
            : null,
        hasBinaryenArtifact: Boolean((backendStage?.binaryenArtifact ?? readCompilerArtifact(context, "binaryenArtifact"))?.wasm),
    };
}
