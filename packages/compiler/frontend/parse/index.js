import { DEFAULT_GRAMMAR_WASM, DEFAULT_RUNTIME_WASM } from '../../../document/default-wasm.js';
import {
    UtuParserService,
} from '../../../document/index.js';
import { runCompilerNewStage1 } from '../../stage1.js';

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
    const stage1 = await runCompilerNewStage1({
        source: sourceText,
        parser: await parserService.getParser(),
        uri,
        version,
    });
    if (ownsParserService)
        parserService.dispose();
    return {
        diagnostics: stage1.artifacts.parse.diagnostics,
        document: stage1.artifacts.parse.document,
        normalizedTree: stage1.artifacts.syntaxNormalize,
    };
}

export { UtuParserService } from '../../../document/index.js';
