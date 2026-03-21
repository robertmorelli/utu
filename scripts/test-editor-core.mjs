import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UtuLanguageService } from '../lsp/src/core/languageService.js';
import { UtuParserService } from '../lsp/src/core/parser.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const parserService = new UtuParserService({
    grammarWasmPath: await readFile(resolve(repoRoot, 'vscode/tree-sitter-utu.wasm')),
    runtimeWasmPath: await readFile(resolve(repoRoot, 'vscode/web-tree-sitter.wasm')),
});
const languageService = new UtuLanguageService(parserService);

const cases = [
    ['static completions', async () => {
        const items = await languageService.getCompletionItems(
            createDocument('file:///static.utu', ''),
            { line: 0, character: 0 },
        );
        expectLabels(items, ['fn', 'array', 'i64', 'true']);
    }],
    ['namespace completions', async () => {
        const items = await languageService.getCompletionItems(
            createDocument('file:///namespace.utu', 'fn main() i32 { array. }'),
            { line: 0, character: 'fn main() i32 { array.'.length },
        );
        expectLabels(items, ['len', 'new_default']);
    }],
    ['top level completions', async () => {
        const items = await languageService.getCompletionItems(
            createDocument('file:///top-level.utu', [
                'fn add_one(value: i64) i64 {',
                '    value + 1',
                '}',
                '',
                'export fn main() i64 {',
                '    add_one(41)',
                '}',
            ].join('\n')),
            { line: 5, character: 8 },
        );
        expectLabels(items, ['add_one', 'main']);
    }],
];

let failed = false;

try {
    for (const [name, run] of cases) {
        try {
            await run();
            console.log(`PASS ${name}`);
        } catch (error) {
            failed = true;
            console.log(`FAIL ${name}`);
            console.log(`  ${String(error?.message ?? error)}`);
        }
    }
} finally {
    languageService.dispose();
    parserService.dispose();
}

if (failed) process.exit(1);

function expectLabels(items, expectedLabels) {
    const labels = new Set(items.map((item) => item.label));

    for (const label of expectedLabels) {
        if (!labels.has(label)) {
            throw new Error(`Missing completion "${label}"`);
        }
    }
}

function createDocument(uri, text) {
    const lines = text.split('\n');

    return {
        uri,
        version: 1,
        getText() {
            return text;
        },
        lineCount: lines.length,
        lineAt(line) {
            return { text: lines[line] ?? '' };
        },
        positionAt(offset) {
            const clamped = Math.max(0, Math.min(offset, text.length));
            let consumed = 0;

            for (let line = 0; line < lines.length; line++) {
                const lineText = lines[line];
                const next = consumed + lineText.length;
                if (clamped <= next) {
                    return { line, character: clamped - consumed };
                }
                consumed = next + 1;
            }

            return {
                line: Math.max(lines.length - 1, 0),
                character: lines.at(-1)?.length ?? 0,
            };
        },
    };
}
