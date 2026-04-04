import { readCompilerArtifact, readCompilerStageBundle } from "./compiler-stage-runtime.js";
import { runTreeWalkRewritePass } from "./rewrite-pass.js";
import { compileBinaryen } from "./binaryen-build.js";
import { mergeBackendMetadata, normalizeMode } from "./backend-metadata-defaults.js";

export async function buildBackendArtifactsFromTree(treeOrNode, {
    optimize = true,
    emitWat = false,
    ...backendOptions
} = {}) {
    const binaryenArtifact = await compileBinaryen(treeOrNode, {
        optimize,
        emitWat,
        ...backendOptions,
    });
    const emitted = await binaryenArtifact.ir.emitArtifacts({
        optimize,
        emitWat,
    });
    return {
        ...binaryenArtifact,
        ...emitted,
        ...(emitWat && typeof binaryenArtifact.wat === "string" ? { wat: binaryenArtifact.wat } : {}),
    };
}

// consume the backend builder output as the output-stage artifact contract.
export async function runBuildBackendArtifacts(context) {
    const outputPlan = context.analyses["validate-output-plan"] ?? {};
    const backendStage = readCompilerStageBundle(context, "backend");
    const backendMetadataDefaults = backendStage?.metadataDefaults ?? context.analyses["prepare-backend-metadata-defaults"] ?? {};
    const tree = await runTreeWalkRewritePass("build-backend-artifacts", context, (node) => node);
    if (!outputPlan.shouldEmitCompileArtifacts) return { tree };

    const source = context.source ?? context.options?.originalSource ?? null;
    const prebuiltBinaryenArtifact = backendStage?.binaryenArtifact ?? readCompilerArtifact(context, "binaryenArtifact");
    const backendArtifactsRaw = prebuiltBinaryenArtifact
        ? {
            ...prebuiltBinaryenArtifact,
            ...(await prebuiltBinaryenArtifact.ir.emitArtifacts({
                optimize: outputPlan.binaryenOptions?.optimize ?? true,
                emitWat: outputPlan.binaryenOptions?.emitWat ?? false,
            })),
            ...(outputPlan.binaryenOptions?.emitWat && typeof prebuiltBinaryenArtifact.wat === "string" ? { wat: prebuiltBinaryenArtifact.wat } : {}),
        }
        : await buildBackendArtifactsFromTree(
            context.legacyTree ?? context.artifacts.parse?.legacyTree ?? null,
            {
                ...(outputPlan.backendOptions ?? {}),
                mode: normalizeMode(outputPlan.backendOptions?.mode ?? backendMetadataDefaults.mode ?? "program"),
                optimize: outputPlan.binaryenOptions?.optimize ?? true,
                emitWat: outputPlan.binaryenOptions?.emitWat ?? false,
                source,
                uri: context.uri ?? null,
                loadImport: context.loadImport ?? null,
            },
        );
    const backendArtifacts = {
        ...backendArtifactsRaw,
        metadata: mergeBackendMetadata(
            backendMetadataDefaults.metadataDefaults ?? {},
            backendArtifactsRaw?.metadata ?? {},
        ),
    };
    prebuiltBinaryenArtifact?.ir?.dispose?.();
    if (backendArtifacts.ir) delete backendArtifacts.ir;

    return {
        tree,
        artifacts: { backendArtifacts },
    };
}
