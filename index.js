// Set up binaryen stderr capture before the module loads so its bound console.error
// points at our wrapper, not the original. This must run before ensureBinaryen().
const _binaryenCapture = { active: false, lines: [] };
{
    const _origErr = console.error;
    console.error = function (...args) {
        if (_binaryenCapture.active) _binaryenCapture.lines.push(args.map(String).join(' '));
        else _origErr.apply(console, args);
    };
}

import bundledGrammarWasm from './tree-sitter-utu.wasm';
import bundledRuntimeWasm from 'web-tree-sitter/web-tree-sitter.wasm';
import { expandSource } from './expand.js';
import { watgen } from './watgen.js';
import { jsgen } from './jsgen.js';
import { createUtuTreeSitterParser, withParsedTree } from './parser.js';
import { childOfType, namedChildren, throwOnParseErrors } from './tree.js';

let _binaryenModule = null;
let _binaryenQueue = Promise.resolve();
async function ensureBinaryen() {
    return _binaryenModule ??= (await import('binaryen')).default;
}

let parser = null;

export async function init({ wasmUrl, runtimeWasmUrl } = {}) {
    if (parser) return;
    parser = await createUtuTreeSitterParser({
        wasmUrl: wasmUrl ?? bundledGrammarWasm,
        runtimeWasmUrl: runtimeWasmUrl ?? bundledRuntimeWasm,
    });
}

export async function compile(source, { wat: emitWat = false, wasmUrl, runtimeWasmUrl, mode = 'program', profile = null, where = 'base64', moduleFormat = 'esm', targetName = null, includeSource = false, optimize = true } = {}) {
    return withActiveTree(source, { wasmUrl, runtimeWasmUrl }, async (tree) => {
        const { wat, metadata } = watgen(tree, { mode, profile, targetName });
        const fullMetadata = { ...metadata, targetName, artifact: { where, moduleFormat } };
        const wasm = await compileWat(wat, { optimize });
        const js = jsgen(tree, wasm, { mode, profile, where, moduleFormat, metadata: fullMetadata, source: includeSource ? source : null });
        return {
            shim: where === 'packed_base64' ? btoa(js) : js,
            js,
            wasm,
            metadata: fullMetadata,
            ...(emitWat ? { wat } : {}),
        };
    });
}

// Validates WAT text using binaryen (no optimization). Returns null on success,
// or { message, binaryenOutput } on failure. Never throws and never writes to stderr.
export async function validateWat(wat) {
    return withParsedWat(wat, (mod) => {
        const message = binaryenValidationMessage(mod);
        return message ? { message, binaryenOutput: [..._binaryenCapture.lines] } : null;
    }, (error) => ({
        message: formatBinaryenError(error),
        binaryenOutput: [..._binaryenCapture.lines],
    }));
}

export async function get_metadata(source, { wasmUrl, runtimeWasmUrl } = {}) {
    return withActiveTree(source, { wasmUrl, runtimeWasmUrl }, (tree) => collectMetadata(tree.rootNode));
}

function binaryenValidationMessage(mod) {
    return mod.validate() ? null : _binaryenCapture.lines.join('\n').trim() || 'Binaryen validation failed.';
}

function formatBinaryenError(error) {
    const message = error?.message || String(error);
    const detail = _binaryenCapture.lines.join('\n').trim();
    return detail && !message.includes(detail) ? `${message}\n${detail}` : message;
}

async function withActiveTree(source, initOptions, callback) {
    if (!parser) await init(initOptions);
    return withParsedTree(parser, source, (tree) => {
        throwOnParseErrors(tree.rootNode);
        const expandedSource = expandSource(tree, source);
        return expandedSource === source
            ? callback(tree)
            : withParsedTree(parser, expandedSource, (expandedTree) => {
                throwOnParseErrors(expandedTree.rootNode);
                return callback(expandedTree);
            });
    });
}

async function compileWat(wat, { optimize = true } = {}) {
    return withParsedWat(wat, (mod, binaryen) => {
        const message = binaryenValidationMessage(mod);
        if (message) throw new Error(`Generated Wasm failed validation: ${message}`);
        if (optimize) {
            binaryen.setOptimizeLevel(3);
            binaryen.setShrinkLevel(2);
            mod.optimize();
        }
        return mod.emitBinary();
    });
}

async function withParsedWat(wat, callback, onError = null) {
    return withBinaryenLock(async () => {
        const binaryen = await ensureBinaryen();
        let mod;
        _binaryenCapture.active = true;
        _binaryenCapture.lines = [];
        try {
            mod = binaryen.parseText(wat);
            mod.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.Multivalue);
            return await callback(mod, binaryen);
        } catch (error) {
            if (onError) return onError(error);
            throw new Error(`Generated Wasm backend failure: ${formatBinaryenError(error)}`);
        } finally {
            _binaryenCapture.active = false;
            mod?.dispose();
        }
    });
}

async function withBinaryenLock(callback) {
    const previous = _binaryenQueue;
    let release;
    _binaryenQueue = new Promise((resolve) => { release = resolve; });
    await previous.catch(() => {});
    try {
        return await callback();
    } finally {
        release();
    }
}

function collectMetadata(root) {
    const metadata = { exports: [], tests: [], benches: [], hasMain: false };
    for (const item of namedChildren(root)) {
        const name = item.type === 'export_decl'
            ? childOfType(childOfType(item, 'fn_decl'), 'identifier')?.text
            : namedChildren(item)[0]?.text.slice(1, -1);
        if (!name) continue;
        if (item.type === 'export_decl') {
            metadata.exports.push({ name });
            metadata.hasMain ||= name === 'main';
        } else if (item.type === 'test_decl') metadata.tests.push({ name });
        else if (item.type === 'bench_decl') metadata.benches.push({ name });
    }
    return metadata;
}
