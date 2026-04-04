import { runTreeWalkRewritePass } from "./e2_5.js";
import { mergeBackendMetadata, normalizeMode } from "./a4_3.js";
import { watgen } from "./backends/wat/index.js";

let binaryenModulePromise = null;
const importBinaryen = Function('return import("binaryen")');

function normalizeStderrChunk(chunk, encoding) {
    if (typeof chunk === "string") return chunk;
    if (chunk instanceof Uint8Array) {
        return new TextDecoder(typeof encoding === "string" ? encoding : "utf-8").decode(chunk);
    }
    return String(chunk ?? "");
}

function splitCapturedLines(buffer) {
    return String(buffer ?? "")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
}

function appendCapturedOutput(baseMessage, outputLines) {
    if (!Array.isArray(outputLines) || outputLines.length === 0) return baseMessage;
    const outputText = outputLines.join("\n");
    if (String(baseMessage).includes(outputText)) return baseMessage;
    return `${baseMessage}\n${outputText}`;
}

async function withProcessStderrCapture(action) {
    const stderr = typeof process === "object" ? process?.stderr : null;
    if (!stderr || typeof stderr.write !== "function") {
        try {
            return { value: await action(), outputLines: [] };
        } catch (error) {
            return { error, outputLines: [] };
        }
    }

    const originalWrite = stderr.write.bind(stderr);
    let output = "";
    stderr.write = (chunk, encoding, callback) => {
        output += normalizeStderrChunk(chunk, encoding);
        if (typeof callback === "function") callback();
        return true;
    };

    try {
        return { value: await action(), outputLines: splitCapturedLines(output) };
    } catch (error) {
        return { error, outputLines: splitCapturedLines(output) };
    } finally {
        stderr.write = originalWrite;
    }
}

async function getBinaryenModule() {
    if (!binaryenModulePromise) {
        binaryenModulePromise = importBinaryen().then((module) => module?.default ?? module);
    }
    return binaryenModulePromise;
}

export async function compileBinaryen(treeOrNode, options = {}) {
    if (!treeOrNode) {
        throw new Error("compileBinaryen requires a syntax tree.");
    }

    const mode = normalizeMode(options.mode);
    const { wat, metadata } = watgen(treeOrNode, {
        mode,
        profile: options.profile ?? null,
        targetName: options.targetName ?? null,
        plan: options.plan ?? null,
    });

    const binaryen = await getBinaryenModule();
    const captured = await withProcessStderrCapture(async () => {
        const module = binaryen.parseText(wat);
        try {
            module.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.Multivalue);
            if (!module.validate()) {
                throw new Error("Binaryen validation failed.");
            }
            if (options.optimize ?? true) {
                module.setOptimizeLevel(3);
                module.setShrinkLevel(2);
                module.optimize();
            }
            return module.emitBinary();
        } finally {
            module.dispose();
        }
    });

    if (captured.error) {
        const baseMessage = captured.error instanceof Error ? captured.error.message : String(captured.error);
        throw new Error(appendCapturedOutput(baseMessage, captured.outputLines));
    }

    return {
        wasm: captured.value,
        ...(options.emitWat ? { wat } : {}),
        metadata,
        binaryenOutput: captured.outputLines,
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
