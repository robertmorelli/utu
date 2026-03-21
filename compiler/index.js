import { Parser, Language } from 'web-tree-sitter';
import binaryen from 'binaryen';
import { watgen } from './watgen.js';
import { jsgen } from './jsgen.js';
import { analyzeHostRequirements } from './host_analysis.js';
import { throwOnParseErrors } from './tree.js';
import { createTreeSitterInitOptions, withParsedTree } from '../shared/treeSitter.mjs';

let parser = null;
const SUPPORTED_WASM_FEATURES = binaryen.Features.GC
    | binaryen.Features.ReferenceTypes
    | binaryen.Features.Multivalue;

export async function init({ wasmUrl, runtimeWasmUrl } = {}) {
    if (parser) return;
    await Parser.init(createTreeSitterInitOptions(runtimeWasmUrl));
    parser = new Parser();
    parser.setLanguage(await Language.load(wasmUrl ?? new URL('../cli_artifact/tree-sitter-utu.wasm', import.meta.url)));
}

export async function compile(source, { wat: emitWat = false, wasmUrl, runtimeWasmUrl, mode = 'program' } = {}) {
    if (!parser) await init({ wasmUrl, runtimeWasmUrl });
    return withParsedTree(parser, source, async (tree) => {
        throwOnParseErrors(tree.rootNode);
        const host = analyzeHostRequirements(tree);
        const { wat, metadata } = watgen(tree, { mode });
        let mod;
        let wasm;
        try {
            mod = binaryen.parseText(wat);
            mod.setFeatures(SUPPORTED_WASM_FEATURES);
            if (!mod.validate()) throw new Error('Binaryen validation failed.');
            binaryen.setOptimizeLevel(2);
            binaryen.setShrinkLevel(1);
            mod.optimize();
            if (!mod.validate()) throw new Error('Binaryen validation failed after optimization.');
            wasm = mod.emitBinary();
            const module = new WebAssembly.Module(wasm);
            try {
                if (!WebAssembly.Module.imports(module).length) await WebAssembly.instantiate(module);
            } catch {}
        }
        catch (error) { throw new Error(`${error?.message ?? String(error)}${error?.name === 'ExitStatus' ? ' (see Binaryen stderr above)' : ''}`); }
        finally { mod?.dispose(); }
        const result = { js: jsgen(tree, wasm, { mode, host }), wasm, metadata: { ...metadata, host: host.metadata } };
        return emitWat ? { ...result, wat } : result;
    });
}
