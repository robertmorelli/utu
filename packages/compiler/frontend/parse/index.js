import { DEFAULT_GRAMMAR_WASM, DEFAULT_RUNTIME_WASM } from '../../../document/default-wasm.js';
import {
    UtuParserService,
} from '../../../document/index.js';
import { runCompilerSyntaxPipeline } from '../../syntax-pipeline.js';

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
    const syntaxPipeline = await runCompilerSyntaxPipeline({
        source: sourceText,
        parser: await parserService.getParser(),
        uri,
        version,
    });
    try {
        return {
            diagnostics: syntaxPipeline.artifacts.parse.diagnostics,
            document: syntaxPipeline.artifacts.parse.document,
            normalizedTree: syntaxPipeline.artifacts.syntaxNormalize,
        };
    } finally {
        syntaxPipeline.dispose();
        if (ownsParserService)
            parserService.dispose();
    }
}

export { UtuParserService } from '../../../document/index.js';
