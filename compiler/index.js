import { Parser, Language } from 'web-tree-sitter';
import binaryen from 'binaryen';
import { watgen } from './watgen.js';
import { jsgen } from './jsgen.js';
import { analyzeHostRequirements } from './host_analysis.js';
import { throwOnParseErrors } from './tree.js';
import { createTreeSitterInitOptions } from '../shared/treeSitter.mjs';

let parser = null;
const SUPPORTED_WASM_FEATURES = binaryen.Features.GC
    | binaryen.Features.ReferenceTypes
    | binaryen.Features.Multivalue;

export async function init({ wasmUrl, runtimeWasmUrl } = {}) {
    if (parser) return;
    await Parser.init(createTreeSitterInitOptions(runtimeWasmUrl));
    parser = new Parser();
    parser.setLanguage(await Language.load(wasmUrl ?? new URL('../tree-sitter-utu.wasm', import.meta.url)));
}

export async function compile(source, { wat: emitWat = false, wasmUrl, runtimeWasmUrl, mode = 'program' } = {}) {
    if (!parser) await init({ wasmUrl, runtimeWasmUrl });
    const tree = parser.parse(source);
    throwOnParseErrors(tree.rootNode);
    const host = analyzeHostRequirements(tree);
    const { wat, metadata } = watgen(tree, { mode }), mod = binaryen.parseText(wat);
    mod.setFeatures(SUPPORTED_WASM_FEATURES);
    binaryen.setOptimizeLevel(2);
    binaryen.setShrinkLevel(1);
    mod.optimize();
    const wasm = mod.emitBinary();
    mod.dispose();
    const result = { js: jsgen(tree, wasm, { mode, host }), wasm, metadata: { ...metadata, host: host.metadata } };
    return emitWat ? { ...result, wat } : result;
}
