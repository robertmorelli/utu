import { DEFAULT_GRAMMAR_WASM, DEFAULT_RUNTIME_WASM } from '../../../document/default-wasm.js';
import {
    UtuParserService,
    collectParseDiagnostics,
    createSourceDocument,
} from '../../../document/index.js';

const bundledGrammarWasm = DEFAULT_GRAMMAR_WASM;
const bundledRuntimeWasm = DEFAULT_RUNTIME_WASM;

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
