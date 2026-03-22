import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UtuParserService, createSourceDocument, spanFromOffsets } from '../parser.js';
import { UtuLanguageService, UtuWorkspaceSymbolIndex } from '../lsp_core/languageService.js';
import { loadEditorTestAssets } from './editor-test-assets.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const { grammarWasmPath, runtimeWasmPath } = await loadEditorTestAssets(repoRoot);

const parserService = new UtuParserService({
    grammarWasmPath,
    runtimeWasmPath,
});
const languageService = new UtuLanguageService(parserService);

const cases = [
    ['static completions', async () => {
        const items = await languageService.getCompletionItems(
            createDocument('file:///static.utu', ''),
            { line: 0, character: 0 },
        );
        expectLabels(items, ['fun', 'while', 'array', 'i64', 'true']);
    }],
    ['namespace completions', async () => {
        const items = await languageService.getCompletionItems(
            createDocument('file:///namespace.utu', 'fun main() i32 { array. }'),
            { line: 0, character: 'fun main() i32 { array.'.length },
        );
        expectLabels(items, ['len', 'new_default']);
    }],
    ['top level completions', async () => {
        const items = await languageService.getCompletionItems(
            createDocument('file:///top-level.utu', [
                'fun add_one(value: i64) i64 {',
                '    value + 1',
                '}',
                '',
                'export fun main() i64 {',
                '    add_one(41)',
                '}',
            ].join('\n')),
            { line: 5, character: 8 },
        );
        expectLabels(items, ['add_one', 'main']);
    }],
    ['compiler source documents expose offset and line ranges', async () => {
        const document = createSourceDocument('alpha\nbeta', {
            uri: 'file:///ranges.utu',
            version: 7,
        });
        const span = spanFromOffsets(document, 2, 7);
        expectEqual(document.offsetAt({ line: 1, character: 2 }), 8);
        expectDeepEqual(span, {
            range: {
                start: { line: 0, character: 2 },
                end: { line: 1, character: 1 },
            },
            offsetRange: {
                start: 2,
                end: 7,
            },
        });
    }],
    ['workspace symbol index caches unchanged versions', async () => {
        let getDocumentIndexCalls = 0;
        const workspaceSymbols = new UtuWorkspaceSymbolIndex({
            async getDocumentIndex(document) {
                getDocumentIndexCalls += 1;
                return {
                    uri: document.uri,
                    topLevelSymbols: [
                        {
                            name: document.symbolName,
                            detail: `${document.symbolName} detail`,
                            kind: 'function',
                            uri: document.uri,
                            range: {
                                start: { line: 0, character: 0 },
                                end: { line: 0, character: document.symbolName.length },
                            },
                        },
                    ],
                };
            },
        });

        const alphaV1 = { uri: 'file:///alpha.utu', version: 1, symbolName: 'alpha' };
        const betaV1 = { uri: 'file:///beta.utu', version: 1, symbolName: 'beta' };

        await workspaceSymbols.syncDocuments([alphaV1, betaV1], { replace: true });
        expectEqual(getDocumentIndexCalls, 2);
        expectDeepEqual(workspaceSymbols.getWorkspaceSymbols('').map((symbol) => symbol.name).sort(), ['alpha', 'beta']);

        await workspaceSymbols.syncDocuments([alphaV1, betaV1], { replace: true });
        expectEqual(getDocumentIndexCalls, 2);

        await workspaceSymbols.updateDocument({ ...alphaV1, version: 2, symbolName: 'alpha2' });
        expectEqual(getDocumentIndexCalls, 3);
        expectDeepEqual(workspaceSymbols.getWorkspaceSymbols('alpha').map((symbol) => symbol.name), ['alpha2']);

        await workspaceSymbols.syncDocuments([betaV1], { replace: true });
        expectDeepEqual(workspaceSymbols.getWorkspaceSymbols('').map((symbol) => symbol.name), ['beta']);
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

function expectEqual(actual, expected) {
    if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
    }
}

function expectDeepEqual(actual, expected) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
        throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
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
