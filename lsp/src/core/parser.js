import { clamp, comparePositions, copyPosition, rangeKey, } from './types.js';
export class UtuParserService {
    options;
    parserPromise;
    parserInstance;
    constructor(options) {
        this.options = options;
    }
    async getDiagnostics(document) {
        return this.withParsedTree(document.getText(), ({ rootNode }) => collectDiagnostics(rootNode, document));
    }
    async getTreeString(source) {
        return this.withParsedTree(source, ({ rootNode }) => rootNode.toString());
    }
    async parseSource(source) {
        const parser = await this.getParser();
        const tree = parser.parse(source);
        if (!tree) {
            throw new Error('Tree-sitter returned no syntax tree for the document.');
        }
        return {
            tree,
            dispose() {
                tree.delete();
            },
        };
    }
    dispose() {
        this.parserInstance?.delete();
        this.parserInstance = undefined;
        this.parserPromise = undefined;
    }
    async getParser() {
        return this.parserPromise ??= this.loadParser();
    }
    async loadParser() {
        const treeSitter = (await import('web-tree-sitter'));
        const runtimeWasm = normalizeWasmSource(this.options.runtimeWasmPath);
        const grammarWasm = normalizeWasmSource(this.options.grammarWasmPath);
        const initOptions = runtimeWasm instanceof Uint8Array
            ? createTreeSitterModuleOptions(runtimeWasm)
            : {
                locateFile(scriptName) {
                    return scriptName === 'web-tree-sitter.wasm' ? runtimeWasm : scriptName;
                },
            };
        try {
            await treeSitter.Parser.init(initOptions);
            const parser = new treeSitter.Parser();
            parser.setLanguage(await treeSitter.Language.load(grammarWasm));
            this.parserInstance = parser;
            return parser;
        }
        catch (error) {
            this.parserPromise = undefined;
            throw error;
        }
    }
    async withParsedTree(source, callback) {
        const parsedTree = await this.parseSource(source);
        try {
            return callback(parsedTree.tree);
        }
        finally {
            parsedTree.dispose();
        }
    }
}
export function rangeFromNode(document, node) {
    return rangeFromOffsets(document, node.startIndex, node.endIndex);
}
export function rangeFromOffsets(document, startOffset, endOffset) {
    const start = clampPosition(document, copyPosition(document.positionAt(startOffset)));
    const end = clampPosition(document, copyPosition(document.positionAt(endOffset)));
    return comparePositions(start, end) < 0
        ? { start, end }
        : { start, end: widenEmptyRange(document, start) };
}
export function collectDiagnostics(rootNode, document) {
    const diagnostics = [];
    const seen = new Set();
    visit(rootNode);
    diagnostics.sort((left, right) => comparePositions(left.range.start, right.range.start));
    return diagnostics;
    function visit(node) {
        if (node.isError) {
            pushDiagnostic('Unexpected token', node);
        }
        if (node.isMissing) {
            pushDiagnostic(`Missing ${node.type}`, node);
        }
        for (const child of node.children) {
            visit(child);
        }
    }
    function pushDiagnostic(message, node) {
        const range = rangeFromNode(document, node);
        const key = `${message}:${rangeKey(range)}`;
        if (seen.has(key))
            return;
        seen.add(key);
        diagnostics.push({
            message,
            range,
            severity: 'error',
            source: 'utu',
        });
    }
}
function clampPosition(document, position) {
    const lastLine = Math.max(document.lineCount - 1, 0);
    const line = clamp(position.line, 0, lastLine);
    const lineLength = getLineText(document, line).length;
    return {
        line,
        character: clamp(position.character, 0, lineLength),
    };
}
function getLineText(document, line) {
    return document.lineAt(clamp(line, 0, Math.max(document.lineCount - 1, 0))).text;
}
function widenEmptyRange(document, position) {
    return {
        line: position.line,
        character: Math.min(position.character + 1, getLineText(document, position.line).length),
    };
}
function normalizeWasmSource(source) {
    return typeof source === 'string' && source.startsWith('file://')
        ? decodeURIComponent(source.slice('file://'.length))
        : source;
}
function createTreeSitterModuleOptions(runtimeWasm) {
    return {
        wasmBinary: runtimeWasm,
        instantiateWasm(imports, successCallback) {
            void WebAssembly.instantiate(runtimeWasm, imports)
                .then(({ instance, module }) => {
                successCallback(instance, module);
            });
            return {};
        },
    };
}
