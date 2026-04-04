import { runTreeWalkRewritePass } from "./e2_5.js";
import { mergeBackendMetadata, normalizeMode } from "./a4_3.js";
import { watgen } from "../../.generated/compiler/watgen.js";
import { createBinaryenIrFromWat } from "./binaryen.js";

export async function compileBinaryen(treeOrNode, options = {}) {
    if (!treeOrNode) {
        throw new Error("compileBinaryen requires a syntax tree.");
    }

    const mode = normalizeMode(options.mode);
    const { wat, metadata } = watgen(treeOrNode, {
        mode,
        profile: options.profile ?? null,
    });

    const ir = await createBinaryenIrFromWat(wat, { metadata });

    return {
        kind: "binaryen-ir",
        ir,
        ...(options.emitWat ? { wat } : {}),
        metadata,
        binaryenOutput: ir.binaryenOutput,
    };
}

export async function runE42BuildBinaryen(context) {
    const a42 = context.analyses["a4.2"] ?? {};
    const a41 = context.analyses["a4.1"] ?? {};
    const a43 = context.analyses["a4.3"] ?? {};
    const tree = await runTreeWalkRewritePass("e4.2", context, (node) => node);
    if (!a42.shouldBuildBinaryen) return { tree };

    const stage4BinaryenRaw = await compileBinaryen(context.legacyTree ?? context.artifacts.parse?.legacyTree ?? null, {
        mode: normalizeMode(a41.backendOptions?.mode ?? a43.mode ?? "program"),
        profile: a41.backendOptions?.profile ?? null,
        targetName: a41.backendOptions?.targetName ?? null,
        plan: a41.backendOptions?.plan ?? null,
        optimize: a42.optimize ?? true,
        emitWat: a42.emitWat ?? false,
    });
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
