import { DEFAULT_GRAMMAR_WASM, DEFAULT_RUNTIME_WASM } from '../document/default-wasm.js';
import { createUtuTreeSitterParser } from '../document/index.js';
import { runCompilerCompile, runCompilerMetadata } from './pipeline.js';

let binaryenModulePromise = null;
const importBinaryen = Function(
    'return ((Function("return this")()).__utuBinaryenLoader ? (Function("return this")()).__utuBinaryenLoader() : import("binaryen"))',
);
const importNodeChildProcess = Function('return import("node:child_process")');
const validateWatSubprocessScript = resolveLocalScriptPath('./subprocess/validate-wat-subprocess.mjs');

function splitCapturedLines(buffer) {
    return String(buffer ?? '')
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
}

function normalizeOutputChunk(chunk, encoding) {
    if (typeof chunk === 'string') return chunk;
    if (chunk instanceof Uint8Array) {
        return new TextDecoder(typeof encoding === 'string' ? encoding : 'utf-8').decode(chunk);
    }
    return String(chunk ?? '');
}

function normalizeConsoleArg(value) {
    if (value instanceof Error) return value.stack || value.message;
    return typeof value === 'string' ? value : String(value);
}

function isNodeRuntime() {
    return typeof process === 'object' && Boolean(process?.versions?.node) && typeof process?.execPath === 'string';
}

function resolveLocalScriptPath(relativePath) {
    const url = new URL(relativePath, import.meta.url);
    if (url.protocol !== 'file:') return url.href;
    const pathname = decodeURIComponent(url.pathname);
    if (typeof process === 'object' && process?.platform === 'win32' && /^\/[A-Za-z]:/.test(pathname)) {
        return pathname.slice(1);
    }
    return pathname;
}

async function withProcessOutputCapture(action) {
    const stderr = typeof process === 'object' ? process?.stderr : null;
    const canPatchStderr = Boolean(stderr && typeof stderr.write === 'function');
    const canPatchConsoleError = typeof console === 'object' && typeof console?.error === 'function';
    if (!canPatchStderr && !canPatchConsoleError) {
        try {
            return { value: await action(), outputLines: [] };
        } catch (error) {
            return { error, outputLines: [] };
        }
    }

    const originalWrite = canPatchStderr ? stderr.write.bind(stderr) : null;
    const originalConsoleError = canPatchConsoleError ? console.error.bind(console) : null;
    let output = '';
    if (canPatchStderr) {
        stderr.write = (chunk, encoding, callback) => {
            output += normalizeOutputChunk(chunk, encoding);
            if (typeof callback === 'function') callback();
            return true;
        };
    }
    if (canPatchConsoleError) {
        console.error = (...args) => {
            output += `${args.map(normalizeConsoleArg).join(' ')}\n`;
        };
    }
    try {
        return { value: await action(), outputLines: splitCapturedLines(output) };
    } catch (error) {
        return { error, outputLines: splitCapturedLines(output) };
    } finally {
        if (canPatchStderr) stderr.write = originalWrite;
        if (canPatchConsoleError) console.error = originalConsoleError;
    }
}

async function validateWatViaSubprocess(wat) {
    if (!isNodeRuntime()) return null;
    let spawn = null;
    try {
        ({ spawn } = await importNodeChildProcess());
    } catch {
        return null;
    }
    if (typeof spawn !== 'function') return null;

    return await new Promise((resolve) => {
        const child = spawn(process.execPath, [validateWatSubprocessScript], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += normalizeOutputChunk(chunk); });
        child.stderr.on('data', (chunk) => { stderr += normalizeOutputChunk(chunk); });
        child.on('error', () => resolve(null));
        child.on('close', () => {
            let parsed = null;
            try {
                parsed = JSON.parse(stdout);
            } catch {
                parsed = null;
            }
            resolve({
                valid: Boolean(parsed?.valid),
                errorMessage: typeof parsed?.errorMessage === 'string' ? parsed.errorMessage : null,
                outputLines: splitCapturedLines(stderr),
            });
        });
        child.stdin.end(JSON.stringify({ wat }));
    });
}

async function getBinaryenModule() {
    if (!binaryenModulePromise) {
        binaryenModulePromise = importBinaryen().then((module) => module?.default ?? module);
    }
    return binaryenModulePromise;
}

function formatValidationMessage(baseMessage, outputLines) {
    if (!Array.isArray(outputLines) || outputLines.length === 0) return baseMessage;
    const text = outputLines.join('\n');
    return String(baseMessage).includes(text) ? baseMessage : `${baseMessage}\n${text}`;
}

export async function validateWat(wat) {
    if (typeof wat !== 'string') {
        throw new TypeError('validateWat expects a WAT string.');
    }
    const binaryen = await getBinaryenModule();
    const captured = await withProcessOutputCapture(async () => {
        const module = binaryen.parseText(wat);
        try {
            module.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.Multivalue);
            return module.validate();
        } finally {
            module.dispose();
        }
    });

    if (captured.error) {
        let outputLines = captured.outputLines;
        let baseMessage = captured.error instanceof Error ? captured.error.message : String(captured.error);
        if (outputLines.length === 0) {
            const fallback = await validateWatViaSubprocess(wat);
            if (fallback?.outputLines?.length) outputLines = fallback.outputLines;
            if ((baseMessage === 'Binaryen validation failed.' || !baseMessage) && fallback?.errorMessage) {
                baseMessage = fallback.errorMessage;
            }
        }
        const message = formatValidationMessage(
            baseMessage,
            outputLines,
        );
        return { message, binaryenOutput: outputLines };
    }
    if (captured.value) return null;

    let outputLines = captured.outputLines;
    if (outputLines.length === 0) {
        const fallback = await validateWatViaSubprocess(wat);
        if (fallback?.outputLines?.length) outputLines = fallback.outputLines;
        if (outputLines.length === 0 && fallback?.errorMessage) {
            outputLines = splitCapturedLines(fallback.errorMessage);
        }
    }

    return {
        message: outputLines.join('\n') || 'Binaryen validation failed.',
        binaryenOutput: outputLines,
    };
}

const bundledGrammarWasm = DEFAULT_GRAMMAR_WASM;
const bundledRuntimeWasm = DEFAULT_RUNTIME_WASM;

let parser = null;

export async function init({ wasmUrl, runtimeWasmUrl } = {}) {
    if (parser) return;
    parser = await createUtuTreeSitterParser({
        wasmUrl: wasmUrl ?? bundledGrammarWasm,
        runtimeWasmUrl: runtimeWasmUrl ?? bundledRuntimeWasm,
    });
}

export async function compile(source, { wat: emitWat = false, wasmUrl, runtimeWasmUrl, mode = 'program', profile = null, where = 'base64', provided_wasm_bytes = false, providedWasmBytes = false, moduleFormat = 'esm', targetName = null, includeSource = false, optimize = true, uri = null, loadImport = null } = {}) {
    if (!parser) await init({ wasmUrl, runtimeWasmUrl });
    return runCompilerCompile({
        source,
        parser,
        uri,
        loadImport,
        compileOptions: {
            wat: emitWat,
            mode,
            profile,
            where,
            provided_wasm_bytes,
            providedWasmBytes,
            moduleFormat,
            targetName,
            includeSource,
            optimize,
        },
    });
}

export async function get_metadata(source, { wasmUrl, runtimeWasmUrl, uri = null, loadImport = null } = {}) {
    if (!parser) await init({ wasmUrl, runtimeWasmUrl });
    return runCompilerMetadata({
        source,
        parser,
        uri,
        loadImport,
    });
}
