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

export async function compile(source, { wat: emitWat = false, wasmUrl, runtimeWasmUrl, mode = 'program', profile = null, where = 'base64', moduleFormat = 'esm', targetName = null, includeSource = false } = {}) {
    if (!parser) await init({ wasmUrl, runtimeWasmUrl });
    return withParsedTree(parser, source, async (tree) => {
        throwOnParseErrors(tree.rootNode);
        const expandedSource = expandSource(tree, source);
        const runCompile = async (activeTree) => {
            const { wat, metadata } = watgen(activeTree, { mode, profile, targetName });
            metadata.targetName = targetName;
            const binaryen = await ensureBinaryen();
            let mod, wasm;
            _binaryenCapture.active = true;
            _binaryenCapture.lines = [];
            try {
                mod = binaryen.parseText(wat);
                mod.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.Multivalue);
                ensureValid(mod, 'Binaryen validation failed.');
                binaryen.setOptimizeLevel(3);
                binaryen.setShrinkLevel(2);
                mod.optimize();
                ensureValid(mod, 'Binaryen validation failed after optimization.');
                wasm = mod.emitBinary();
                const module = new WebAssembly.Module(wasm);
                let importDescriptors = null;
                try {
                    importDescriptors = WebAssembly.Module.imports(module);
                } catch { }
                if (importDescriptors?.length === 0) await WebAssembly.instantiate(module).catch(() => {});
            } catch (error) {
                const msg = error?.message || String(error);
                const binaryenDetail = _binaryenCapture.lines.join('\n').trim();
                throw new Error(binaryenDetail ? `${msg}\n${binaryenDetail}` : msg);
            } finally {
                _binaryenCapture.active = false;
                mod?.dispose();
            }
            const generatedShim = jsgen(activeTree, wasm, { mode, profile, where, moduleFormat, metadata, source: includeSource ? source : null });
            const result = {
                shim: where === 'packed_base64' ? btoa(generatedShim) : generatedShim,
                js: generatedShim,
                wasm,
                metadata: {
                    ...metadata,
                    targetName,
                    artifact: { where, moduleFormat },
                },
            };
            if (emitWat) result.wat = wat;
            return result;
        };
        if (expandedSource === source) return runCompile(tree);
        return withParsedTree(parser, expandedSource, async (expandedTree) => {
            throwOnParseErrors(expandedTree.rootNode);
            return runCompile(expandedTree);
        });
    });
}

// Validates WAT text using binaryen (no optimization). Returns null on success,
// or { message, binaryenOutput } on failure. Never throws and never writes to stderr.
export async function validateWat(wat) {
    const binaryen = await ensureBinaryen();
    let mod;
    _binaryenCapture.active = true;
    _binaryenCapture.lines = [];
    try {
        mod = binaryen.parseText(wat);
        mod.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.Multivalue);
        if (mod.validate()) return null;
        let message;
        try {
            new WebAssembly.Module(mod.emitBinary());
            message = 'Binaryen validation failed.';
        } catch (error) {
            message = error?.message || 'Binaryen validation failed.';
        }
        return { message, binaryenOutput: [..._binaryenCapture.lines] };
    } catch (error) {
        process.exitCode = 0;
        return {
            message: error?.message || String(error),
            binaryenOutput: [..._binaryenCapture.lines],
        };
    } finally {
        _binaryenCapture.active = false;
        mod?.dispose();
    }
}

export async function get_metadata(source, { wasmUrl, runtimeWasmUrl } = {}) {
    if (!parser) await init({ wasmUrl, runtimeWasmUrl });
    return withParsedTree(parser, source, async (tree) => {
        throwOnParseErrors(tree.rootNode);
        const expandedSource = expandSource(tree, source);
        const readMetadata = (activeTree) => {
            const tests = [], benches = [], exports = [];
            for (const item of namedChildren(activeTree.rootNode)) {
                if (item.type === 'export_decl') {
                    const fn = childOfType(item, 'fn_decl');
                    const name = childOfType(fn, 'identifier')?.text;
                    if (name) exports.push({ name });
                    continue;
                }
                if (item.type === 'test_decl') {
                    const name = namedChildren(item)[0]?.text.slice(1, -1);
                    if (name) tests.push({ name });
                    continue;
                }
                if (item.type === 'bench_decl') {
                    const name = namedChildren(item)[0]?.text.slice(1, -1);
                    if (name) benches.push({ name });
                }
            }
            return {
                exports,
                tests,
                benches,
                hasMain: exports.some((entry) => entry.name === 'main'),
            };
        };
        if (expandedSource === source) return readMetadata(tree);
        return withParsedTree(parser, expandedSource, async (expandedTree) => {
            throwOnParseErrors(expandedTree.rootNode);
            return readMetadata(expandedTree);
        });
    });
}

function ensureValid(mod, message) {
    if (mod.validate()) return;
    try {
        new WebAssembly.Module(mod.emitBinary());
    } catch (error) {
        throw new Error(error?.message ?? message);
    }
    throw new Error(message);
}
