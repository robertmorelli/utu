// compiler/opt.js
//
// WAT string → Wasm binary using binaryen.
// Input:  WAT string from watgen.js
// Output: Uint8Array — compiled (and optionally optimized) Wasm binary

import binaryen from 'binaryen';

/**
 * @param {string}  wat
 * @param {boolean} optimize
 * @returns {Uint8Array}
 */
export function opt(wat, optimize = true) {
    const mod = binaryen.parseText(wat);
    mod.setFeatures(binaryen.Features.All);

    if (!mod.validate()) {
        mod.dispose();
        throw new Error('Wasm validation failed after WAT parse');
    }

    if (optimize) {
        binaryen.setOptimizeLevel(2);
        binaryen.setShrinkLevel(1);
        mod.optimize();
    }

    const binary = mod.emitBinary();
    mod.dispose();
    return binary;
}
