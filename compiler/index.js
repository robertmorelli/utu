import { Parser, Language } from 'web-tree-sitter';
import binaryen from 'binaryen';
import { watgen } from './watgen.js';
import { jsgen } from './jsgen.js';

let parser = null;

export async function init(config = {}) {
    if (parser) return;
    await Parser.init();

    const next = new Parser();
    const url = config.wasmUrl ?? new URL('../tree-sitter-utu.wasm', import.meta.url);
    next.setLanguage(await Language.load(url));
    parser = next;
}

export async function compile(source, options = {}) {
    const { wat: emitWat = false, optimize = true, wasmUrl } = options;
    if (!parser) await init({ wasmUrl });

    const tree = parser.parse(source);
    throwOnParseErrors(tree.rootNode);

    const wat = watgen(tree);
    const mod = binaryen.parseText(wat);
    mod.setFeatures(binaryen.Features.All);

    if (optimize) {
        binaryen.setOptimizeLevel(2);
        binaryen.setShrinkLevel(1);
        mod.optimize();
    }

    const wasm = mod.emitBinary();
    mod.dispose();

    const js = jsgen(tree, wasm);
    return emitWat ? { js, wat, wasm } : { js, wasm };
}

function throwOnParseErrors(node) {
    const errors = [];
    collectParseErrors(node, errors);
    if (errors.length === 0) return;

    const lines = errors.map(error => `  ${error.message} at ${error.row + 1}:${error.col + 1}`);
    throw new Error(`Parse errors:\n${lines.join('\n')}`);
}

function collectParseErrors(node, out) {
    if (node.type === 'ERROR') {
        out.push({
            message: 'Unexpected token',
            row: node.startPosition.row,
            col: node.startPosition.column,
        });
    } else if (node.isMissing) {
        out.push({
            message: `Missing ${node.type}`,
            row: node.startPosition.row,
            col: node.startPosition.column,
        });
    }

    for (const child of node.children) collectParseErrors(child, out);
}
