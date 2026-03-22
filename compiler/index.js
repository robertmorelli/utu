import binaryen from 'binaryen';
import { watgen } from './watgen.js';
import { jsgen } from './jsgen.js';
import { analyzeHostRequirements } from './host_analysis.js';
import { throwOnParseErrors } from './tree.js';
import { withParsedTree } from '../shared/treeSitter.mjs';
import { createUtuTreeSitterParser } from './treeSitterParser.js';
export { loadWebModuleFromSource } from '../shared/moduleLoaders.web.mjs';

let parser = null;
const SUPPORTED_WASM_FEATURES = binaryen.Features.GC
    | binaryen.Features.ReferenceTypes
    | binaryen.Features.Multivalue;

export async function init({ wasmUrl, runtimeWasmUrl } = {}) {
    if (parser) return;
    parser = await createUtuTreeSitterParser({
        wasmUrl: wasmUrl ?? new URL('../cli_artifact/tree-sitter-utu.wasm', import.meta.url),
        runtimeWasmUrl,
    });
}

export async function compile(source, { wat: emitWat = false, wasmUrl, runtimeWasmUrl, mode = 'program', profile = null, shim = 'inline-wasm', moduleFormat = 'esm' } = {}) {
    if (!parser) await init({ wasmUrl, runtimeWasmUrl });
    return withParsedTree(parser, source, async (tree) => {
        throwOnParseErrors(tree.rootNode);
        const host = analyzeHostRequirements(tree);
        const { wat, metadata } = watgen(tree, { mode, profile });
        let mod;
        let wasm;
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
            try {
                if (!WebAssembly.Module.imports(module).length) await WebAssembly.instantiate(module);
            } catch {}
        } catch (error) {
            throw new Error(error?.message ?? String(error));
        } finally {
            mod?.dispose();
        }
        const generatedShim = jsgen(tree, wasm, { mode, host, profile, shim, moduleFormat });
        const result = {
            shim: generatedShim,
            js: generatedShim,
            wasm,
            metadata: {
                ...metadata,
                host: host.metadata,
                artifact: { shim, moduleFormat },
            },
        };
        return emitWat ? { ...result, wat } : result;
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
