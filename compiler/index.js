import { Parser, Language } from 'web-tree-sitter';
import binaryen from 'binaryen';
import { watgen } from './watgen.js';
import { jsgen } from './jsgen.js';
import { throwOnParseErrors } from './tree.js';

let parser = null;

export async function init({ wasmUrl } = {}) {
    if (parser) return;
    await Parser.init();
    parser = new Parser();
    parser.setLanguage(await Language.load(wasmUrl ?? new URL('../tree-sitter-utu.wasm', import.meta.url)));
}

export async function compile(source, { wat: emitWat = false, optimize = true, wasmUrl, mode = 'program' } = {}) {
    if (!parser) await init({ wasmUrl });
    const tree = parser.parse(source);
    throwOnParseErrors(tree.rootNode);
    const { wat, metadata } = watgen(tree, { mode }), mod = binaryen.parseText(wat);
    mod.setFeatures(binaryen.Features.All);
    if (optimize) { binaryen.setOptimizeLevel(2); binaryen.setShrinkLevel(1); mod.optimize(); }
    const wasm = mod.emitBinary();
    mod.dispose();
    const result = { js: jsgen(tree, wasm, { mode }), wasm, metadata };
    return emitWat ? { ...result, wat } : result;
}
