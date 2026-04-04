const runtimeGlobals = Function('return this')();
const assetBaseUrl = runtimeGlobals.__utuModuleSourceAssetBaseUrl;
const hasProcessCwd = typeof runtimeGlobals?.process?.cwd === 'function';
const cwd = hasProcessCwd ? runtimeGlobals.process.cwd() : null;
const preferRelativeAssets = !hasProcessCwd && typeof assetBaseUrl === 'string' && assetBaseUrl.length > 0;
const cwdPrefix = typeof cwd === 'string' && /\/dist\/cli-package\/?$/.test(cwd)
  ? `${cwd}/../..`
  : cwd;
const bundledGrammarWasm = preferRelativeAssets
  ? './tree-sitter-utu.wasm'
  : (typeof cwdPrefix === 'string' && cwdPrefix.length > 0
      ? `${cwdPrefix}/tree-sitter-utu.wasm`
      : './tree-sitter-utu.wasm');
const bundledRuntimeWasm = preferRelativeAssets
  ? './web-tree-sitter.wasm'
  : (typeof cwdPrefix === 'string' && cwdPrefix.length > 0
      ? `${cwdPrefix}/web-tree-sitter.wasm`
      : './web-tree-sitter.wasm');

// Shared default parser assets for hosts that want a package-owned fallback.
export const DEFAULT_GRAMMAR_WASM = normalizeBundledAsset(bundledGrammarWasm);
export const DEFAULT_RUNTIME_WASM = normalizeBundledAsset(bundledRuntimeWasm);

export const DEFAULT_PARSER_WASM = Object.freeze({
  grammar: DEFAULT_GRAMMAR_WASM,
  runtime: DEFAULT_RUNTIME_WASM,
});

function normalizeBundledAsset(asset) {
  if (typeof asset !== 'string')
    return asset;
  if (asset.startsWith('/')) {
    try {
      return new URL(`file://${asset}`);
    } catch {
      return asset;
    }
  }
  if (!asset.startsWith('./') || typeof assetBaseUrl !== 'string')
    return asset;
  try {
    return new URL(asset, assetBaseUrl);
  } catch {
    return asset;
  }
}
