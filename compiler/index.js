import { Parser, Language } from 'web-tree-sitter';
import { parse }  from './parse.js';
import { watgen } from './watgen.js';
import { opt }    from './opt.js';
import { jsgen }  from './jsgen.js';

let parser = null;

/**
 * Initialize the parser. Called automatically by compile() if not yet done.
 * Pass wasmUrl to override the default grammar WASM location (useful when bundled).
 * @param {{ wasmUrl?: string | URL }} [config]
 */
export async function init(config = {}) {
    if (parser) return;
    await Parser.init();
    const p = new Parser();
    const url = config.wasmUrl ?? new URL('../tree-sitter-utu.wasm', import.meta.url);
    const lang = await Language.load(url);
    p.setLanguage(lang);
    parser = p;
}

/**
 * Compile Utu source to a JS shim (ESM string) wrapping the Wasm binary.
 * @param {string} source
 * @param {{ wat?: boolean, optimize?: boolean, wasmUrl?: string | URL }} [options]
 * @returns {Promise<{ js: string, wasm: Uint8Array, wat?: string }>}
 */
export async function compile(source, options = {}) {
    const { wat: emitWat = false, optimize = true, wasmUrl } = options;
    if (!parser) await init({ wasmUrl });

    const tree = parser.parse(source);
    const ast  = parse(tree);
    const wat  = watgen(ast);
    const wasm = opt(wat, optimize);
    const js   = jsgen(ast, wasm);

    return emitWat ? { js, wat, wasm } : { js, wasm };
}
