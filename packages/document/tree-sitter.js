import { Parser, Language } from 'web-tree-sitter';

export const normalizeWasmSource = (source) => typeof source === 'string'
    || source instanceof URL
    ? source
    : source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : ArrayBuffer.isView(source)
            ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
            : source?.href ?? source ?? null;

export function createTreeSitterInitOptions(runtimeWasmSource) {
    const runtimeWasm = normalizeWasmSource(runtimeWasmSource);
    if (runtimeWasm instanceof Uint8Array) {
        return {
            wasmBinary: runtimeWasm,
            // Some web-tree-sitter builds still consult locateFile during startup
            // even when instantiateWasm / wasmBinary are supplied.
            locateFile: () => 'web-tree-sitter.wasm',
            instantiateWasm(imports, successCallback) {
                void WebAssembly.instantiate(runtimeWasm, imports)
                    .then(({ instance, module }) => successCallback(instance, module));
                return {};
            },
        };
    }
    return runtimeWasm ? { locateFile: () => String(runtimeWasm) } : {};
}

export async function createUtuTreeSitterParser({
    wasmUrl,
    runtimeWasmUrl,
    grammarWasmPath = wasmUrl,
    runtimeWasmPath = runtimeWasmUrl,
} = {}) {
    await Parser.init(createTreeSitterInitOptions(runtimeWasmPath));
    const parser = new Parser();
    parser.setLanguage(await Language.load(normalizeWasmSource(grammarWasmPath)));
    return parser;
}

export class UtuParserService {
    constructor(options = {}) {
        this.options = options;
    }

    async getTreeString(source) {
        return this.withParsedTree(source, ({ rootNode }) => rootNode.toString());
    }

    async parseSource(source) {
        return parseTree(await this.getParser(), source);
    }

    dispose() {
        this.parserInstance?.delete();
        this.parserInstance = undefined;
        this.parserPromise = undefined;
    }

    async getParser() {
        return this.parserPromise ??= createUtuTreeSitterParser(this.options)
            .then((parser) => (this.parserInstance = parser))
            .catch((error) => {
                this.parserPromise = undefined;
                throw error;
            });
    }

    async withParsedTree(source, callback) {
        return withParsedTree(await this.getParser(), source, callback);
    }
}

export function parseTree(parser, source, errorMessage = 'Tree-sitter returned no syntax tree for the document.') {
    const tree = parser.parse(source);
    if (!tree) {
        throw new Error(errorMessage);
    }
    return { tree, dispose: () => tree.delete() };
}

export async function withParsedTree(parser, source, callback, errorMessage) {
    const { tree, dispose } = parseTree(parser, source, errorMessage);
    try {
        return await callback(tree);
    } finally {
        dispose();
    }
}
