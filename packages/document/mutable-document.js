import { UtuSourceDocument } from './text-document.js';

export class MutableSourceDocument extends UtuSourceDocument {
    constructor(uri, version, text) {
        super(text, { uri, version });
    }

    setText(text, version = this.version) {
        this.replaceText(text);
        this.version = version;
    }

    applyChanges(changes, version = this.version) {
        for (const { range, text } of changes) {
            if (!range) {
                this.replaceText(text);
                continue;
            }
            const start = this.offsetAt(range.start);
            const end = this.offsetAt(range.end);
            this.replaceText(`${this.text.slice(0, start)}${text}${this.text.slice(end)}`);
        }
        this.version = version;
    }

    replaceText(text) {
        this.text = text;
        this.lineOffsets = undefined;
    }
}
