import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const grammarCandidates = ['tree-sitter-utu.wasm'];
const runtimeCandidates = [
  'web-tree-sitter.wasm',
  'node_modules/web-tree-sitter/web-tree-sitter.wasm',
];

export async function loadEditorTestAssets(repoRoot) {
  return loadAssetSet(repoRoot, grammarCandidates, runtimeCandidates, 'UTU grammar wasm');
}

export async function loadPackagedEditorTestAssets(repoRoot) {
  return loadAssetSet(repoRoot, grammarCandidates, runtimeCandidates, 'packaged VS Code grammar wasm');
}

export async function loadCliCompilerTestAssets(repoRoot) {
  return loadAssetSet(repoRoot, grammarCandidates, runtimeCandidates, 'CLI grammar wasm');
}

async function findExistingAsset(repoRoot, candidates, label) {
  for (const candidate of candidates) {
    const resolvedPath = resolve(repoRoot, candidate);
    try {
      await access(resolvedPath);
      return resolvedPath;
    } catch {}
  }
  throw new Error(`Could not find ${label}. Checked: ${candidates.join(', ')}`);
}

async function loadAssetSet(repoRoot, grammarAssetCandidates, runtimeAssetCandidates, grammarLabel) {
  const [grammarPath, runtimePath] = await Promise.all([
    findExistingAsset(repoRoot, grammarAssetCandidates, grammarLabel),
    findExistingAsset(repoRoot, runtimeAssetCandidates, 'Tree-sitter runtime wasm'),
  ]);
  const [grammarWasmPath, runtimeWasmPath] = await Promise.all([
    readFile(grammarPath),
    readFile(runtimePath),
  ]);
  return { grammarPath, runtimePath, grammarWasmPath, runtimeWasmPath };
}
