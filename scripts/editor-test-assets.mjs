import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const grammarCandidates = [
  'tree-sitter-utu.wasm',
  'vscode/tree-sitter-utu.wasm',
  'cli_artifact/tree-sitter-utu.wasm',
  'web_artifact/tree-sitter-utu.wasm',
];

const runtimeCandidates = [
  'vscode/web-tree-sitter.wasm',
  'node_modules/web-tree-sitter/web-tree-sitter.wasm',
  'web_artifact/web-tree-sitter.wasm',
];

export async function loadEditorTestAssets(repoRoot) {
  const [grammarPath, runtimePath] = await Promise.all([
    findExistingAsset(repoRoot, grammarCandidates, 'UTU grammar wasm'),
    findExistingAsset(repoRoot, runtimeCandidates, 'Tree-sitter runtime wasm'),
  ]);
  const [grammarWasmPath, runtimeWasmPath] = await Promise.all([
    readFile(grammarPath),
    readFile(runtimePath),
  ]);

  return {
    grammarWasmPath,
    runtimeWasmPath,
  };
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
