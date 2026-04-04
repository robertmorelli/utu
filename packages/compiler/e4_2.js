import { runTreeWalkRewritePass } from "./e2_5.js";
import { mergeBackendMetadata, normalizeMode } from "./a4_3.js";
import { watgen } from "./backend/wat/index.js";
import { compileWatToBinary } from "./backend/binaryen.js";

export async function compileBinaryen(treeOrNode, options = {}) {
    if (!treeOrNode) {
        throw new Error("compileBinaryen requires a parsed expanded tree.");
    }

    const { wat, metadata } = watgen(treeOrNode, {
        mode: normalizeMode(options.mode ?? "program"),
        profile: options.profile ?? null,
        targetName: options.targetName ?? null,
        plan: options.plan ?? null,
    });
    const compiled = await compileWatToBinary(wat, {
        optimize: options.optimize ?? true,
    });

    return {
        wasm: compiled.wasm,
        metadata,
        binaryenOutput: compiled.binaryenOutput ?? [],
        ...(options.emitWat ? { wat } : {}),
    };
}

// e4.2 Build Binaryen:
// build wasm artifacts from e4.1 lowering output for downstream stages.
export async function runE42BuildBinaryen(context) {
    const a42 = context.analyses["a4.2"] ?? {};
    const a41 = context.analyses["a4.1"] ?? {};
    const a43 = context.analyses["a4.3"] ?? {};
    const tree = await runTreeWalkRewritePass("e4.2", context, (node) => node);
    if (!a42.shouldBuildBinaryen) {
        return { tree };
    }

    const stage4BinaryenRaw = await compileBinaryen(
        {
            mode: normalizeMode(a41.backendOptions?.mode ?? a43.mode ?? "program"),
            profile: a41.backendOptions?.profile ?? null,
            targetName: a41.backendOptions?.targetName ?? null,
            plan: a41.backendOptions?.plan ?? null,
            optimize: a42.optimize ?? true,
            emitWat: a42.emitWat ?? false,
        },
    );
    const stage4Binaryen = {
        ...stage4BinaryenRaw,
        metadata: mergeBackendMetadata(
            a43.metadataDefaults ?? {},
            stage4BinaryenRaw?.metadata ?? {},
        ),
    };

    return {
        tree,
        artifacts: { stage4Binaryen },
    };
}
