const binaryenCapture = { lines: [] };

const importBinaryen = Function(
    'return ((Function("return this")()).__utuBinaryenLoader ? (Function("return this")()).__utuBinaryenLoader() : import("binaryen"))',
);
const importNodeChildProcess = Function('return import("node:child_process")');
const importCompilerCore = Function('return import("./core.js")');

const validateWatSubprocessScript = resolveLocalScriptPath("./subprocess/validate-wat-subprocess.mjs");

let binaryenModule = null;
let binaryenQueue = Promise.resolve();

async function ensureBinaryen() {
    return binaryenModule ??= (await importBinaryen()).default;
}

function normalizeConsoleArg(value) {
    if (value instanceof Error) return value.stack || value.message;
    return typeof value === "string" ? value : String(value);
}

function formatBinaryenError(error) {
    const message = error?.message || String(error);
    const detail = binaryenCapture.lines.join("\n").trim();
    return detail && !message.includes(detail) ? `${message}\n${detail}` : message;
}

function resolveLocalScriptPath(relativePath) {
    const url = new URL(relativePath, import.meta.url);
    if (url.protocol !== "file:") return url.href;
    const pathname = decodeURIComponent(url.pathname);
    if (typeof process === "object" && process?.platform === "win32" && /^\/[A-Za-z]:/.test(pathname)) {
        return pathname.slice(1);
    }
    return pathname;
}

function splitCapturedLines(buffer) {
    return String(buffer ?? "")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
}

function normalizeOutputChunk(chunk, encoding) {
    if (typeof chunk === "string") return chunk;
    if (chunk instanceof Uint8Array) {
        return new TextDecoder(typeof encoding === "string" ? encoding : "utf-8").decode(chunk);
    }
    return String(chunk ?? "");
}

function isNodeRuntime() {
    return typeof process === "object" && Boolean(process?.versions?.node) && typeof process?.execPath === "string";
}

async function validateWatViaSubprocess(wat) {
    if (!isNodeRuntime()) return null;
    let spawn = null;
    try {
        ({ spawn } = await importNodeChildProcess());
    } catch {
        return null;
    }
    if (typeof spawn !== "function") return null;

    return await new Promise((resolve) => {
        const child = spawn(process.execPath, [validateWatSubprocessScript], {
            stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += normalizeOutputChunk(chunk); });
        child.stderr.on("data", (chunk) => { stderr += normalizeOutputChunk(chunk); });
        child.on("error", () => resolve(null));
        child.on("close", () => {
            let parsed = null;
            try {
                parsed = JSON.parse(stdout);
            } catch {
                parsed = null;
            }
            resolve({
                valid: Boolean(parsed?.valid),
                errorMessage: typeof parsed?.errorMessage === "string" ? parsed.errorMessage : null,
                outputLines: splitCapturedLines(stderr),
            });
        });
        child.stdin.end(JSON.stringify({ wat }));
    });
}

async function binaryenValidationMessage(module, wat) {
    if (module.validate()) return null;
    const captured = binaryenCapture.lines.join("\n").trim();
    if (captured) return captured;
    const coreValidation = await validateWatViaCore(wat);
    if (coreValidation?.message) return coreValidation.message;
    const fallback = await validateWatViaSubprocess(wat);
    return fallback?.outputLines?.join("\n") || fallback?.errorMessage || "Binaryen validation failed.";
}

async function validateWatViaCore(wat) {
    try {
        const core = await importCompilerCore();
        if (typeof core?.validateWat !== "function") return null;
        return await core.validateWat(wat);
    } catch {
        return null;
    }
}

async function resolveBinaryenBackendErrorMessage(wat, error) {
    const normalizeBinaryenMessage = (value) => splitCapturedLines(value)
        .filter((line) => line !== "[object Object]")
        .join("\n") || String(value ?? "");
    const rawMessage = error?.message || String(error);
    const message = normalizeBinaryenMessage(rawMessage);
    if (/\bFatal:\s+\d+:\d+:\s+error:/m.test(message)) return message;

    const coreValidation = await validateWatViaCore(wat);
    const coreMessage = normalizeBinaryenMessage(coreValidation?.message ?? "");
    if (coreMessage && coreMessage !== "Binaryen validation failed." && !message.includes(coreMessage)) {
        return `${message}\n${coreMessage}`;
    }

    const fallback = await validateWatViaSubprocess(wat);
    const fallbackMessage = normalizeBinaryenMessage(fallback?.outputLines?.join("\n") || fallback?.errorMessage || "");
    if (fallbackMessage && fallbackMessage !== "Binaryen validation failed." && !message.includes(fallbackMessage)) {
        return `${message}\n${fallbackMessage}`;
    }

    return message;
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
        const stderr = typeof process === "object" ? process?.stderr : null;
        const canPatchStderr = Boolean(stderr && typeof stderr.write === "function");
        const canPatchConsoleError = typeof console === "object" && typeof console?.error === "function";
        const originalWrite = canPatchStderr ? stderr.write.bind(stderr) : null;
        const originalConsoleError = canPatchConsoleError ? console.error.bind(console) : null;
        let output = "";
        if (canPatchStderr) {
            stderr.write = (chunk, encoding, callback) => {
                output += normalizeOutputChunk(chunk, encoding);
                if (typeof callback === "function") callback();
                return true;
            };
        }
        if (canPatchConsoleError) {
            console.error = (...args) => {
                output += `${args.map(normalizeConsoleArg).join(" ")}\n`;
            };
        }
        binaryenCapture.lines = [];
        try {
            const binaryen = await ensureBinaryen();
            const value = await callback(binaryen);
            binaryenCapture.lines = splitCapturedLines(output);
            return value;
        } catch (error) {
            binaryenCapture.lines = splitCapturedLines(output);
            if (onError) return onError(error);
            throw new Error(`Generated Wasm backend failure: ${formatBinaryenError(error)}`);
        } finally {
            if (canPatchStderr) stderr.write = originalWrite;
            if (canPatchConsoleError) console.error = originalConsoleError;
        }
    });
}

export async function createBinaryenIrFromWat(wat, { metadata = {} } = {}) {
    return captureBinaryen(async (binaryen) => {
        const module = binaryen.parseText(wat);
        let disposed = false;
        module.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.Multivalue);
        const validationMessage = await binaryenValidationMessage(module, wat);
        if (validationMessage) {
            disposed = true;
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
                    if (disposed) throw new Error("Generated Wasm backend failure: Binaryen IR has already been disposed.");
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
                if (disposed) return;
                disposed = true;
                module.dispose();
            },
        };
    }, async (error) => {
        throw new Error(`Generated Wasm backend failure: ${await resolveBinaryenBackendErrorMessage(wat, error)}`);
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
