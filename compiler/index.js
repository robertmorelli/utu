import { Parser, Language } from 'web-tree-sitter';
import binaryen from 'binaryen';
import { watgen } from './watgen.js';
import { jsgen } from './jsgen.js';
import { analyzeHostRequirements } from './host_analysis.js';
import { throwOnParseErrors } from './tree.js';

let parser = null;
const SUPPORTED_WASM_FEATURES = binaryen.Features.GC
    | binaryen.Features.ReferenceTypes
    | binaryen.Features.Multivalue;

export async function init({ wasmUrl, runtimeWasmUrl } = {}) {
    if (parser) return;
    const runtimeWasmBinary = toWasmBinary(runtimeWasmUrl);
    await Parser.init(
        runtimeWasmBinary
            ? {
                wasmBinary: runtimeWasmBinary,
                instantiateWasm(imports, successCallback) {
                    void WebAssembly.instantiate(runtimeWasmBinary, imports).then(({ instance, module }) => {
                        successCallback(instance, module);
                    });
                    return {};
                },
            }
            : runtimeWasmUrl ? {
                locateFile(scriptName) {
                    return scriptName === 'web-tree-sitter.wasm' ? runtimeWasmUrl : scriptName;
                },
            } : void 0,
    );
    parser = new Parser();
    parser.setLanguage(await Language.load(wasmUrl ?? new URL('../tree-sitter-utu.wasm', import.meta.url)));
}

export async function compile(source, { wat: emitWat = false, wasmUrl, runtimeWasmUrl, mode = 'program' } = {}) {
    if (!parser) await init({ wasmUrl, runtimeWasmUrl });
    const tree = parser.parse(source);
    throwOnParseErrors(tree.rootNode);
    const host = analyzeHostRequirements(tree);
    const { wat, metadata } = watgen(tree, { mode }), mod = binaryen.parseText(wat);
    // Keep optimization mandatory without letting Binaryen upgrade modules to
    // exact heap types that current runtimes reject.
    mod.setFeatures(SUPPORTED_WASM_FEATURES);
    binaryen.setOptimizeLevel(2);
    binaryen.setShrinkLevel(1);
    mod.optimize();
    const wasm = mod.emitBinary();
    mod.dispose();
    const result = { js: jsgen(tree, wasm, { mode, host }), wasm, metadata: { ...metadata, host: host.metadata } };
    return emitWat ? { ...result, wat } : result;
}

function toWasmBinary(value) {
    if (ArrayBuffer.isView(value)) {
        return value instanceof Uint8Array
            ? value
            : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }

    return value instanceof ArrayBuffer ? new Uint8Array(value) : undefined;
}
