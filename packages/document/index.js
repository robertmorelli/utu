import { Parser, Language } from 'web-tree-sitter';

export const createUtuTreeSitterParser = async ({ wasmUrl: w, runtimeWasmUrl: r, grammarWasmPath: g = w, runtimeWasmPath: p = r } = {}) => {
    await Parser.init(createTreeSitterInitOptions(p));
    const parser = new Parser();
    parser.setLanguage(await Language.load(normalizeWasmSource(g)));
    return parser;
};

export class UtuParserService {
    constructor(options = {}) { this.options = options; }
    async getTreeString(source) { return this.withParsedTree(source, ({ rootNode }) => rootNode.toString()); }
    async parseSource(source) { return parseTree(await this.getParser(), source); }
    dispose() { this.parserInstance?.delete(); this.parserInstance = this.parserPromise = undefined; }
    async getParser() {
        return this.parserPromise ??= createUtuTreeSitterParser(this.options).then((parser) => (this.parserInstance = parser)).catch((error) => { this.parserPromise = undefined; throw error; });
    }
    async withParsedTree(source, callback) { return withParsedTree(await this.getParser(), source, callback); }
}

export const normalizeWasmSource = (source) => typeof source === 'string' || source instanceof URL ? source : source instanceof ArrayBuffer ? new Uint8Array(source) : ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : source?.href ?? source ?? null;

export const createTreeSitterInitOptions = (runtimeWasmSource) => {
    const runtimeWasm = normalizeWasmSource(runtimeWasmSource);
    return runtimeWasm instanceof Uint8Array ? { wasmBinary: runtimeWasm, instantiateWasm(imports, successCallback) { void WebAssembly.instantiate(runtimeWasm, imports).then(({ instance, module }) => successCallback(instance, module)); return {}; } } : runtimeWasm ? { locateFile: () => String(runtimeWasm) } : {};
};

export const parseTree = (parser, source, errorMessage = 'Tree-sitter returned no syntax tree for the document.') => {
    const tree = parser.parse(source);
    if (!tree) throw new Error(errorMessage);
    return { tree, dispose: () => tree.delete() };
};

export const withParsedTree = async (parser, source, callback, errorMessage) => {
    const { tree, dispose } = parseTree(parser, source, errorMessage);
    try { return await callback(tree); } finally { dispose(); }
};

export class UtuSourceDocument {
    constructor(text, { uri = 'memory://utu', version = 0 } = {}) { this.uri = uri; this.version = version; this.text = text; }
    getText() { return this.text; }
    get lineCount() { return this.getLineOffsets().length; }
    lineAt(line) { return { text: this.text.slice(...getLineBounds(this.text, this.getLineOffsets(), line)) }; }
    positionAt(offset) {
        const offsets = this.getLineOffsets(), safeOffset = clamp(offset, 0, this.text.length), line = findLineForOffset(offsets, safeOffset);
        return { line, character: safeOffset - offsets[line] };
    }
    offsetAt({ line, character }) {
        const [start, end] = getLineBounds(this.text, this.getLineOffsets(), line);
        return clamp(start + character, start, end);
    }
    getLineOffsets() { return this.lineOffsets ??= getLineOffsets(this.text); }
}

export class MutableSourceDocument extends UtuSourceDocument {
    constructor(uri, version, text) { super(text, { uri, version }); }
    setText(text, version = this.version) {
        this.replaceText(text);
        this.version = version;
    }
    applyChanges(changes, version = this.version) {
        for (const { range, text } of changes) {
            if (!range) this.replaceText(text);
            else {
                const start = this.offsetAt(range.start);
                const end = this.offsetAt(range.end);
                this.replaceText(`${this.text.slice(0, start)}${text}${this.text.slice(end)}`);
            }
        }
        this.version = version;
    }
    replaceText(text) {
        this.text = text;
        this.lineOffsets = undefined;
    }
}

export const createSourceDocument = (text, options) => new UtuSourceDocument(text, options);
export const toSourceDocument = (documentOrSource, options) => typeof documentOrSource === 'string' ? createSourceDocument(documentOrSource, options) : isSourceDocument(documentOrSource) ? documentOrSource : typeof documentOrSource?.getText === 'function' ? createSourceDocument(documentOrSource.getText(), { uri: documentOrSource.uri, version: documentOrSource.version, ...options }) : (() => { throw new TypeError('Expected a source string or a text-document-like object.'); })();

export const offsetRangeFromNode = (node) => ({ start: node.startIndex, end: node.endIndex });
export const offsetRangeFromOffsets = (start, end) => ({ start, end });
export const spanFromNode = (documentOrSource, node) => spanFromOffsets(documentOrSource, node.startIndex, node.endIndex);
export const spanFromOffsets = (documentOrSource, startOffset, endOffset) => {
    const document = toSourceDocument(documentOrSource), sourceLength = document.getText().length, start = clamp(startOffset, 0, sourceLength), end = clamp(endOffset, 0, sourceLength), startPosition = document.positionAt(start), endPosition = document.positionAt(end);
    return {
        range: startPosition.line < endPosition.line || startPosition.line === endPosition.line && startPosition.character < endPosition.character
            ? { start: startPosition, end: endPosition }
            : { start: startPosition, end: { line: startPosition.line, character: Math.min(startPosition.character + 1, document.lineAt(startPosition.line).text.length) } },
        offsetRange: { start, end },
    };
};
export const rangeFromNode = (documentOrSource, node) => spanFromOffsets(documentOrSource, node.startIndex, node.endIndex).range;
export const rangeFromOffsets = (documentOrSource, startOffset, endOffset) => spanFromOffsets(documentOrSource, startOffset, endOffset).range;

export const getWordAtPosition = (documentOrSource, position) => {
    const document = toSourceDocument(documentOrSource);
    if (position.line < 0 || position.line >= document.lineCount) return undefined;
    const lineText = document.lineAt(position.line).text;
    if (!lineText) return undefined;
    const clampedCharacter = clamp(position.character, 0, lineText.length);
    let start = clampedCharacter - Number(clampedCharacter > 0 && !isWordChar(lineText[clampedCharacter] ?? '') && isWordChar(lineText[clampedCharacter - 1] ?? '')), end = start;
    while (isWordChar(lineText[end] ?? '')) end += 1;
    while (start > 0 && isWordChar(lineText[start - 1] ?? '')) start -= 1;
    if (start === end) return undefined;
    const text = lineText.slice(start, end);
    return WORD_PATTERN.test(text) ? { text, range: { start: { line: position.line, character: start }, end: { line: position.line, character: end } } } : undefined;
};

export const findNamedChild = (node, type) => node?.namedChildren.find((child) => child.type === type);
export const findNamedChildren = (node, type) => node?.namedChildren.filter((child) => child.type === type) ?? [];
export const walkNamedChildren = (node, visit) => node.namedChildren.forEach(visit);
export const stringLiteralName = (node) => node.text.startsWith('"') && node.text.endsWith('"') ? node.text.slice(1, -1) : node.text;

export const parseHostImportName = (name) => {
    if (!name.startsWith('_')) return { hostName: name, hostPath: [name] };
    const hostPath = name.slice(1).replace(/__/g, '\0').split('_').map((segment) => segment.replace(/\0/g, '_'));
    return { hostName: hostPath.join('.'), hostPath };
};

export const collectParseDiagnostics = (rootNode, documentOrSource) => {
    const document = toSourceDocument(documentOrSource), diagnostics = [], seen = new Set();
    const pushDiagnostic = (message, node) => {
        const span = spanFromNode(document, node), { start, end } = span.range, key = `${message}:${start.line}:${start.character}:${end.line}:${end.character}`;
        if (!seen.has(key)) {
            seen.add(key);
            diagnostics.push({ message, range: span.range, offsetRange: span.offsetRange, severity: 'error', source: 'utu' });
        }
    };
    const visit = (node) => {
        if (node.isError) pushDiagnostic('Unexpected token', node);
        if (node.isMissing) pushDiagnostic(`Missing ${node.type}`, node);
        node.children.forEach(visit);
    };
    visit(rootNode);
    return diagnostics.sort((left, right) => left.range.start.line - right.range.start.line || left.range.start.character - right.range.start.character);
};

const isSourceDocument = (value) => typeof value === 'object' && value !== null && typeof value.getText === 'function' && typeof value.lineAt === 'function' && typeof value.positionAt === 'function' && typeof value.lineCount === 'number';
const getLineOffsets = (text) => {
    const offsets = [0];
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code === 13 && text.charCodeAt(index + 1) === 10) index += 1;
        if (code === 13 || code === 10) offsets.push(index + 1);
    }
    return offsets;
};
const getLineBounds = (text, offsets, line) => {
    const safeLine = clamp(line, 0, Math.max(offsets.length - 1, 0)), start = offsets[safeLine] ?? 0;
    let end = offsets[safeLine + 1] ?? text.length;
    if (end > start && text.charCodeAt(end - 1) === 10) end -= 1;
    if (end > start && text.charCodeAt(end - 1) === 13) end -= 1;
    return [start, end];
};
const findLineForOffset = (offsets, offset) => {
    let low = 0, high = offsets.length;
    while (low < high) {
        const mid = low + high >> 1;
        if ((offsets[mid] ?? 0) > offset) high = mid; else low = mid + 1;
    }
    return Math.max(low - 1, 0);
};
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const isWordChar = (value) => WORD_CHAR_PATTERN.test(value);
const WORD_CHAR_PATTERN = /[A-Za-z0-9_]/;
const WORD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
