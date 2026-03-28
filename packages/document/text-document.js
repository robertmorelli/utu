const WORD_CHAR_PATTERN = /[A-Za-z0-9_]/;
const WORD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class UtuSourceDocument {
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
        return { text: this.text.slice(...getLineBounds(this.text, this.getLineOffsets(), line)) };
    }

    positionAt(offset) {
        const offsets = this.getLineOffsets();
        const safeOffset = clamp(offset, 0, this.text.length);
        const line = findLineForOffset(offsets, safeOffset);
        return { line, character: safeOffset - offsets[line] };
    }

    offsetAt({ line, character }) {
        const [start, end] = getLineBounds(this.text, this.getLineOffsets(), line);
        return clamp(start + character, start, end);
    }

    getLineOffsets() {
        return this.lineOffsets ??= getLineOffsets(this.text);
    }
}

export const createSourceDocument = (text, options) => new UtuSourceDocument(text, options);

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

export function getWordAtPosition(documentOrSource, position) {
    const document = toSourceDocument(documentOrSource);
    if (position.line < 0 || position.line >= document.lineCount) {
        return undefined;
    }
    const lineText = document.lineAt(position.line).text;
    if (!lineText) {
        return undefined;
    }
    const clampedCharacter = clamp(position.character, 0, lineText.length);
    let start = clampedCharacter
        - Number(clampedCharacter > 0 && !isWordChar(lineText[clampedCharacter] ?? '') && isWordChar(lineText[clampedCharacter - 1] ?? ''));
    let end = start;
    while (isWordChar(lineText[end] ?? '')) {
        end += 1;
    }
    while (start > 0 && isWordChar(lineText[start - 1] ?? '')) {
        start -= 1;
    }
    if (start === end) {
        return undefined;
    }
    const text = lineText.slice(start, end);
    return WORD_PATTERN.test(text)
        ? {
            text,
            range: {
                start: { line: position.line, character: start },
                end: { line: position.line, character: end },
            },
        }
        : undefined;
}

export function isSourceDocument(value) {
    return typeof value === 'object'
        && value !== null
        && typeof value.getText === 'function'
        && typeof value.lineAt === 'function'
        && typeof value.positionAt === 'function'
        && typeof value.lineCount === 'number';
}

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function getLineOffsets(text) {
    const offsets = [0];
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code === 13 && text.charCodeAt(index + 1) === 10) {
            index += 1;
        }
        if (code === 13 || code === 10) {
            offsets.push(index + 1);
        }
    }
    return offsets;
}

export function getLineBounds(text, offsets, line) {
    const safeLine = clamp(line, 0, Math.max(offsets.length - 1, 0));
    const start = offsets[safeLine] ?? 0;
    let end = offsets[safeLine + 1] ?? text.length;
    if (end > start && text.charCodeAt(end - 1) === 10) {
        end -= 1;
    }
    if (end > start && text.charCodeAt(end - 1) === 13) {
        end -= 1;
    }
    return [start, end];
}

export function findLineForOffset(offsets, offset) {
    let low = 0;
    let high = offsets.length;
    while (low < high) {
        const mid = low + high >> 1;
        if ((offsets[mid] ?? 0) > offset) {
            high = mid;
        } else {
            low = mid + 1;
        }
    }
    return Math.max(low - 1, 0);
}

function isWordChar(value) {
    return WORD_CHAR_PATTERN.test(value);
}
