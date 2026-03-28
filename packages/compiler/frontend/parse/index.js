import {
    UtuParserService,
    collectParseDiagnostics,
    createSourceDocument,
} from '../../../document/index.js';

const bundledGrammarWasm = new URL('../../../../tree-sitter-utu.wasm', import.meta.url);
const bundledRuntimeWasm = new URL('../../../../web-tree-sitter.wasm', import.meta.url);

export async function parseDocument({
    sourceText,
    uri = 'memory://utu-parse',
    version = 0,
    parserService: providedParserService = null,
    grammarWasmPath = bundledGrammarWasm,
    runtimeWasmPath = bundledRuntimeWasm,
} = {}) {
    const ownsParserService = !providedParserService;
    const parserService = providedParserService ?? new UtuParserService({
        grammarWasmPath,
        runtimeWasmPath,
    });
    const document = createSourceDocument(sourceText, { uri, version });
    const parsed = await parserService.parseSource(sourceText);
    try {
        return {
            tree: parsed.tree,
            diagnostics: collectParseDiagnostics(parsed.tree.rootNode, document),
            document,
        };
    } finally {
        if (ownsParserService)
            parserService.dispose();
    }
}

export { UtuParserService } from '../../../document/index.js';
