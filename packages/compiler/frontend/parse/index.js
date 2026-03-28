import {
    UtuParserService,
    collectParseDiagnostics,
    createSourceDocument,
} from '../../../document/index.js';

const runtimeGlobals = Function('return this')();
const bundledGrammarWasm = resolveBundledAssetUrl('../../../../tree-sitter-utu.wasm');
const bundledRuntimeWasm = resolveBundledAssetUrl('../../../../web-tree-sitter.wasm');

function resolveBundledAssetUrl(relativePath) {
    const assetName = relativePath.split('/').at(-1);
    const baseUrl = typeof runtimeGlobals.__utuModuleSourceAssetBaseUrl === 'string'
        ? runtimeGlobals.__utuModuleSourceAssetBaseUrl
        : typeof import.meta?.url === 'string'
        ? import.meta.url
        : typeof runtimeGlobals.location?.href === 'string'
            ? runtimeGlobals.location.href
            : null;
    if (!baseUrl)
        return undefined;
    const rootUrl = deriveAssetRootUrl(baseUrl);
    return resolveAssetUrl(rootUrl && assetName ? assetName : relativePath, rootUrl ?? baseUrl);
}

function deriveAssetRootUrl(baseUrl) {
    let url;
    try {
        url = new URL(baseUrl);
    } catch {
        return null;
    }
    const segments = url.pathname.split('/');
    const markerIndex = Math.max(segments.lastIndexOf('dist'), segments.lastIndexOf('packages'));
    if (markerIndex <= 0)
        return null;
    url.pathname = `${segments.slice(0, markerIndex).join('/')}/`;
    url.search = '';
    url.hash = '';
    return url;
}

function resolveAssetUrl(pathname, baseUrl) {
    try {
        return new URL(pathname, baseUrl);
    } catch {
        return undefined;
    }
}

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
