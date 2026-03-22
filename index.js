import binaryen from 'binaryen';
import bundledGrammarWasm from './tree-sitter-utu.wasm';
import bundledRuntimeWasm from 'web-tree-sitter/web-tree-sitter.wasm';
import { watgen } from './watgen.js';
import { jsgen } from './jsgen.js';
import { createUtuTreeSitterParser, withParsedTree } from './parser.js';
import { childOfType, namedChildren, throwOnParseErrors } from './tree.js';

let parser = null;
const SUPPORTED_WASM_FEATURES = binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.Multivalue;

export async function init({ wasmUrl, runtimeWasmUrl } = {}) {
    if (parser) return;
    parser = await createUtuTreeSitterParser({
        wasmUrl: wasmUrl ?? bundledGrammarWasm,
        runtimeWasmUrl: runtimeWasmUrl ?? bundledRuntimeWasm,
    });
}

export async function compile(source, { wat: emitWat = false, wasmUrl, runtimeWasmUrl, mode = 'program', profile = null, where = 'base64', moduleFormat = 'esm', targetName = null } = {}) {
    if (!parser) await init({ wasmUrl, runtimeWasmUrl });
    return withParsedTree(parser, source, async (tree) => {
        throwOnParseErrors(tree.rootNode);
        const { wat, metadata } = watgen(tree, { mode, profile, targetName });
        let mod, wasm;
        try {
            mod = binaryen.parseText(wat);
            mod.setFeatures(SUPPORTED_WASM_FEATURES);
            ensureValid(mod, 'Binaryen validation failed.');
            binaryen.setOptimizeLevel(3);
            binaryen.setShrinkLevel(2);
            mod.optimize();
            ensureValid(mod, 'Binaryen validation failed after optimization.');
            wasm = mod.emitBinary();
            const module = new WebAssembly.Module(wasm);
            if (!WebAssembly.Module.imports(module).length) await WebAssembly.instantiate(module).catch(() => {});
        } catch (error) {
            throw new Error(error?.message ?? String(error));
        } finally {
            mod?.dispose();
        }
        const generatedShim = jsgen(tree, wasm, { mode, profile, where, moduleFormat, metadata });
        const result = {
            shim: generatedShim,
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
    });
}

export async function get_metadata(source, { wasmUrl, runtimeWasmUrl } = {}) {
    if (!parser) await init({ wasmUrl, runtimeWasmUrl });
    return withParsedTree(parser, source, async (tree) => {
        throwOnParseErrors(tree.rootNode);
        const tests = [], benches = [], exports = [];
        for (const item of namedChildren(tree.rootNode)) {
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
