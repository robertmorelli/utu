import { Parser, Language } from 'web-tree-sitter';

export async function createUtuTreeSitterParser({ wasmUrl, runtimeWasmUrl, grammarWasmPath = wasmUrl, runtimeWasmPath = runtimeWasmUrl } = {}) {
    const grammarWasm = normalizeWasmSource(grammarWasmPath);
    await Parser.init(createTreeSitterInitOptions(runtimeWasmPath));
    const parser = new Parser();
    parser.setLanguage(await Language.load(grammarWasm));
    return parser;
}

export class UtuParserService {
    options;
    parserPromise;
    parserInstance;
    constructor(options = {}) {
        this.options = options;
    }
    async getTreeString(source) {
        return this.withParsedTree(source, ({ rootNode }) => rootNode.toString());
    }
    async parseSource(source) {
        const parser = await this.getParser();
        return parseTree(parser, source);
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
        try {
            const parser = await createUtuTreeSitterParser(this.options);
            this.parserInstance = parser;
            return parser;
        }
        catch (error) {
            this.parserPromise = undefined;
            throw error;
        }
    }
    async withParsedTree(source, callback) {
        const parser = await this.getParser();
        return withParsedTree(parser, source, callback);
    }
}

export function normalizeWasmSource(source) {
    if (typeof source === 'string' || source instanceof URL) {
        return source;
    }
    if (source instanceof ArrayBuffer) {
        return new Uint8Array(source);
    }
    if (ArrayBuffer.isView(source)) {
        return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    }
    return source?.href ?? source ?? null;
}

export function createTreeSitterInitOptions(runtimeWasmSource) {
    const runtimeWasm = normalizeWasmSource(runtimeWasmSource);
    if (runtimeWasm instanceof Uint8Array) {
        return {
            wasmBinary: runtimeWasm,
            instantiateWasm(imports, successCallback) {
                void WebAssembly.instantiate(runtimeWasm, imports).then(({ instance, module }) => {
                    successCallback(instance, module);
                });
                return {};
            },
        };
    }
    return runtimeWasm ? { locateFile: () => String(runtimeWasm) } : {};
}

export function parseTree(parser, source, errorMessage = 'Tree-sitter returned no syntax tree for the document.') {
    const tree = parser.parse(source);
    if (!tree) {
        throw new Error(errorMessage);
    }
    return {
        tree,
        dispose() {
            tree.delete();
        },
    };
}

export async function withParsedTree(parser, source, callback, errorMessage) {
    const parsedTree = parseTree(parser, source, errorMessage);
    try {
        return await callback(parsedTree.tree);
    } finally {
        parsedTree.dispose();
    }
}

export class UtuSourceDocument {
    uri;
    version;
    text;
    lineOffsets;
    constructor(text, { uri = 'memory://utu', version = 0 } = {}) {
        this.uri = uri;
        this.version = version;
        this.text = text;
    }
    getText() {
        return this.text;
    }
    get lineCount() {
        return this.getLineOffsets().length;
    }
    lineAt(line) {
        const offsets = this.getLineOffsets();
        const [start, end] = this.getLineBounds(line, offsets);
        return { text: this.text.slice(start, end) };
    }
    positionAt(offset) {
        const offsets = this.getLineOffsets();
        const clampedOffset = clamp(offset, 0, this.text.length);
        const line = this.findLineForOffset(clampedOffset, offsets);
        return {
            line,
            character: clampedOffset - (offsets[line] ?? 0),
        };
    }
    offsetAt(position) {
        const offsets = this.getLineOffsets();
        const [lineStart, lineEnd] = this.getLineBounds(position.line, offsets);
        return clamp(lineStart + position.character, lineStart, lineEnd);
    }
    getLineOffsets() {
        if (this.lineOffsets) {
            return this.lineOffsets;
        }
        const offsets = [0];
        for (let index = 0; index < this.text.length; index += 1) {
            const code = this.text.charCodeAt(index);
            if (code === 13) {
                if (this.text.charCodeAt(index + 1) === 10) {
                    index += 1;
                }
                offsets.push(index + 1);
                continue;
            }
            if (code === 10) {
                offsets.push(index + 1);
            }
        }
        this.lineOffsets = offsets;
        return offsets;
    }
    getSafeLine(line, offsets) {
        return clamp(line, 0, Math.max(offsets.length - 1, 0));
    }
    getLineBounds(line, offsets) {
        const safeLine = this.getSafeLine(line, offsets);
        const start = offsets[safeLine] ?? 0;
        const nextOffset = offsets[safeLine + 1] ?? this.text.length;
        return [start, trimLineEnding(this.text, start, nextOffset)];
    }
    findLineForOffset(offset, offsets) {
        let low = 0;
        let high = offsets.length;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if ((offsets[mid] ?? 0) > offset) {
                high = mid;
            }
            else {
                low = mid + 1;
            }
        }
        return Math.max(low - 1, 0);
    }
}

export function createSourceDocument(text, options) {
    return new UtuSourceDocument(text, options);
}

export function toSourceDocument(documentOrSource, options) {
    if (typeof documentOrSource === 'string') {
        return createSourceDocument(documentOrSource, options);
    }
    if (isSourceDocument(documentOrSource)) {
        return documentOrSource;
    }
    if (typeof documentOrSource?.getText === 'function') {
        return createSourceDocument(documentOrSource.getText(), {
            uri: documentOrSource.uri,
            version: documentOrSource.version,
            ...options,
        });
    }
    throw new TypeError('Expected a source string or a text-document-like object.');
}

export function offsetRangeFromNode(node) {
    return offsetRangeFromOffsets(node.startIndex, node.endIndex);
}

export function offsetRangeFromOffsets(startOffset, endOffset) {
    return {
        start: startOffset,
        end: endOffset,
    };
}

export function spanFromNode(documentOrSource, node) {
    return spanFromOffsets(documentOrSource, node.startIndex, node.endIndex);
}

export function spanFromOffsets(documentOrSource, startOffset, endOffset) {
    const document = toSourceDocument(documentOrSource);
    const sourceLength = document.getText().length;
    const safeStartOffset = clamp(startOffset, 0, sourceLength);
    const safeEndOffset = clamp(endOffset, 0, sourceLength);
    const start = clampPosition(document, copyPosition(document.positionAt(safeStartOffset)));
    const end = clampPosition(document, copyPosition(document.positionAt(safeEndOffset)));
    return {
        range: comparePositions(start, end) < 0
            ? { start, end }
            : { start, end: widenEmptyRange(document, start) },
        offsetRange: offsetRangeFromOffsets(safeStartOffset, safeEndOffset),
    };
}

export function rangeFromNode(documentOrSource, node) {
    return spanFromNode(documentOrSource, node).range;
}

export function rangeFromOffsets(documentOrSource, startOffset, endOffset) {
    return spanFromOffsets(documentOrSource, startOffset, endOffset).range;
}

export function collectParseDiagnostics(rootNode, documentOrSource) {
    const document = toSourceDocument(documentOrSource);
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
        const span = spanFromNode(document, node);
        const key = `${message}:${rangeKey(span.range)}`;
        if (seen.has(key))
            return;
        seen.add(key);
        diagnostics.push({
            message,
            range: span.range,
            offsetRange: span.offsetRange,
            severity: 'error',
            source: 'utu',
        });
    }
}

function isSourceDocument(value) {
    return typeof value === 'object'
        && value !== null
        && typeof value.getText === 'function'
        && typeof value.lineAt === 'function'
        && typeof value.positionAt === 'function'
        && typeof value.lineCount === 'number';
}

function copyPosition(position) {
    return { line: position.line, character: position.character };
}

function comparePositions(left, right) {
    return left.line - right.line || left.character - right.character;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function rangeKey(range) {
    return `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
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

function trimLineEnding(text, start, end) {
    let trimmedEnd = end;
    if (trimmedEnd > start && text.charCodeAt(trimmedEnd - 1) === 10) {
        trimmedEnd -= 1;
    }
    if (trimmedEnd > start && text.charCodeAt(trimmedEnd - 1) === 13) {
        trimmedEnd -= 1;
    }
    return trimmedEnd;
}
