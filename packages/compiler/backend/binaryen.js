// Capture Binaryen diagnostics before the module is loaded so parse/validate
// output stays attached to the pipeline instead of leaking to stderr.
const binaryenCapture = { active: false, lines: [] };
{
    const originalConsoleError = console.error;
    console.error = function (...args) {
        if (binaryenCapture.active) binaryenCapture.lines.push(args.map(String).join(' '));
        else originalConsoleError.apply(console, args);
    };
}

const importBinaryen = Function('return import("binaryen")');

let binaryenModule = null;
let binaryenQueue = Promise.resolve();

async function ensureBinaryen() {
    return binaryenModule ??= (await importBinaryen()).default;
}

function formatBinaryenError(error) {
    const message = error?.message || String(error);
    const detail = binaryenCapture.lines.join('\n').trim();
    return detail && !message.includes(detail) ? `${message}\n${detail}` : message;
}

function binaryenValidationMessage(module) {
    return module.validate()
        ? null
        : binaryenCapture.lines.join('\n').trim() || 'Binaryen validation failed.';
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

async function withParsedWat(wat, callback, onError = null) {
    return withBinaryenLock(async () => {
        const binaryen = await ensureBinaryen();
        let module;
        binaryenCapture.active = true;
        binaryenCapture.lines = [];
        try {
            module = binaryen.parseText(wat);
            module.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.Multivalue);
            return await callback(module, binaryen);
        } catch (error) {
            if (onError) return onError(error);
            throw new Error(`Generated Wasm backend failure: ${formatBinaryenError(error)}`);
        } finally {
            binaryenCapture.active = false;
            module?.dispose();
        }
    });
}

export async function compileWatToBinary(wat, { optimize = true } = {}) {
    return withParsedWat(wat, (module, binaryen) => {
        const validationMessage = binaryenValidationMessage(module);
        if (validationMessage) {
            throw new Error(`Generated Wasm failed validation: ${validationMessage}`);
        }
        if (optimize) {
            binaryen.setOptimizeLevel(3);
            binaryen.setShrinkLevel(2);
            module.optimize();
        }
        return {
            wasm: module.emitBinary(),
            binaryenOutput: [...binaryenCapture.lines],
        };
    });
}
