import bundledGrammarWasm from '../../tree-sitter-utu.wasm';
import bundledRuntimeWasm from 'web-tree-sitter/web-tree-sitter.wasm';

const runtimeGlobals = Function('return this')();

// Shared default parser assets for hosts that want a package-owned fallback.
export const DEFAULT_GRAMMAR_WASM = normalizeBundledAsset(bundledGrammarWasm);
export const DEFAULT_RUNTIME_WASM = normalizeBundledAsset(bundledRuntimeWasm);

export const DEFAULT_PARSER_WASM = Object.freeze({
  grammar: DEFAULT_GRAMMAR_WASM,
  runtime: DEFAULT_RUNTIME_WASM,
});

function normalizeBundledAsset(asset) {
  const assetBaseUrl = runtimeGlobals.__utuModuleSourceAssetBaseUrl;
  if (typeof asset !== 'string' || !asset.startsWith('./') || typeof assetBaseUrl !== 'string')
    return asset;
  try {
    return new URL(asset, assetBaseUrl);
  } catch {
    return asset;
  }
}
