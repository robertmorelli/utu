import { runTreeWalkRewritePass } from "./e2_5.js";
import { compileBinaryen } from "./e4_2.js";
import { mergeBackendMetadata, normalizeMode } from "./a4_3.js";

export async function buildBackendArtifactsFromTree(treeOrNode, {
    optimize = true,
    emitWat = false,
    ...backendOptions
} = {}) {
    const stage4Binaryen = await compileBinaryen(treeOrNode, {
        optimize,
        emitWat,
        ...backendOptions,
    });
    const emitted = await stage4Binaryen.ir.emitArtifacts({
        optimize,
        emitWat,
    });
    return {
        ...stage4Binaryen,
        ...emitted,
    };
}

// e5.1 Build backend artifacts:
// consume the backend builder output as the stage-5 artifact contract.
export async function runE51BuildBackendArtifacts(context) {
    const a51 = context.analyses["a5.1"] ?? {};
    const a43 = context.analyses["a4.3"] ?? {};
    const tree = await runTreeWalkRewritePass("e5.1", context, (node) => node);
    if (!a51.shouldEmitCompileArtifacts) return { tree };

    const source = context.source ?? context.options?.originalSource ?? null;
    const prebuilt = context.artifacts.stage4Binaryen ?? null;
    const stage5Raw = prebuilt
        ? {
            ...prebuilt,
            ...(await prebuilt.ir.emitArtifacts({
                optimize: a51.binaryenOptions?.optimize ?? true,
                emitWat: a51.binaryenOptions?.emitWat ?? false,
            })),
        }
        : await buildBackendArtifactsFromTree(
            context.legacyTree ?? context.artifacts.parse?.legacyTree ?? null,
            {
                ...(a51.backendOptions ?? {}),
                mode: normalizeMode(a51.backendOptions?.mode ?? a43.mode ?? "program"),
                optimize: a51.binaryenOptions?.optimize ?? true,
                emitWat: a51.binaryenOptions?.emitWat ?? false,
                source,
                uri: context.uri ?? null,
                loadImport: context.loadImport ?? null,
            },
        );
    const stage5 = {
        ...stage5Raw,
        metadata: mergeBackendMetadata(
            a43.metadataDefaults ?? {},
            stage5Raw?.metadata ?? {},
        ),
    };
    prebuilt?.ir?.dispose?.();
    if (stage5.ir) delete stage5.ir;

    return {
        tree,
        artifacts: { stage5 },
    };
}
