const binaryenCapture = { active: false, lines: [] };
{
    const originalConsoleError = console.error;
    console.error = function (...args) {
        if (binaryenCapture.active) binaryenCapture.lines.push(args.map(String).join(" "));
        else originalConsoleError.apply(console, args);
    };
}

const importBinaryen = Function(
    'return ((Function("return this")()).__utuBinaryenLoader ? (Function("return this")()).__utuBinaryenLoader() : import("binaryen"))',
);

let binaryenModule = null;
let binaryenQueue = Promise.resolve();

async function ensureBinaryen() {
    return binaryenModule ??= (await importBinaryen()).default;
}

function formatBinaryenError(error) {
    const message = error?.message || String(error);
    const detail = binaryenCapture.lines.join("\n").trim();
    return detail && !message.includes(detail) ? `${message}\n${detail}` : message;
}

function binaryenValidationMessage(module) {
    return module.validate()
        ? null
        : binaryenCapture.lines.join("\n").trim() || "Binaryen validation failed.";
}

async function withBinaryenLock(callback) {
    const previous = binaryenQueue;
    let release;
    binaryenQueue = new Promise((resolve) => {
        release = resolve;
    });
    await previous.catch(() => {});
    try {
        return await callback();
    } finally {
        release();
    }
}

async function captureBinaryen(callback, onError = null) {
    return withBinaryenLock(async () => {
        const binaryen = await ensureBinaryen();
        binaryenCapture.active = true;
        binaryenCapture.lines = [];
        try {
            return await callback(binaryen);
        } catch (error) {
            if (onError) return onError(error);
            throw new Error(`Generated Wasm backend failure: ${formatBinaryenError(error)}`);
        } finally {
            binaryenCapture.active = false;
        }
    });
}

export async function createBinaryenIrFromWat(wat, { metadata = {} } = {}) {
    return captureBinaryen(async (binaryen) => {
        const module = binaryen.parseText(wat);
        module.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.Multivalue);
        const validationMessage = binaryenValidationMessage(module);
        if (validationMessage) {
            module.dispose();
            throw new Error(`Generated Wasm failed validation: ${validationMessage}`);
        }
        return {
            kind: "binaryen-ir",
            module,
            metadata,
            binaryenOutput: [...binaryenCapture.lines],
            async emitArtifacts({ optimize = true, emitWat = false } = {}) {
                return captureBinaryen(async (lockedBinaryen) => {
                    if (optimize) {
                        lockedBinaryen.setOptimizeLevel(3);
                        lockedBinaryen.setShrinkLevel(2);
                        module.optimize();
                    }
                    return {
                        wasm: module.emitBinary(),
                        ...(emitWat ? { wat: module.emitText() } : {}),
                        binaryenOutput: [...binaryenCapture.lines],
                    };
                });
            },
            dispose() {
                module.dispose();
            },
        };
    });
}

export async function compileWatToBinary(wat, { optimize = true } = {}) {
    const ir = await createBinaryenIrFromWat(wat);
    try {
        return await ir.emitArtifacts({ optimize, emitWat: false });
    } finally {
        ir.dispose();
    }
}
