import { build } from 'esbuild';
import { access, chmod, copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const lspRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(lspRoot, '..');
const distRoot = resolve(lspRoot, 'dist');
const serverOutputPath = resolve(distRoot, 'utu-lsp.js');
const parserRuntimeSource = resolve(repoRoot, 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm');
const parserRuntimeDest = resolve(distRoot, 'web-tree-sitter.wasm');
const grammarDest = resolve(distRoot, 'tree-sitter-utu.wasm');
const grammarCandidates = [
  '',
  'vscode',
].map((path) => resolve(repoRoot, path, 'tree-sitter-utu.wasm'));

await mkdir(distRoot, { recursive: true });
await build({
  bundle: true,
  entryPoints: [resolve(lspRoot, 'src', 'server', 'node.js')],
  outfile: serverOutputPath,
  platform: 'node',
  target: 'esnext',
  format: 'esm',
  sourcemap: 'linked',
  sourcesContent: false,
  logLevel: 'info',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
await Promise.all([
  copyFile(parserRuntimeSource, parserRuntimeDest),
  copyFile(await findExistingGrammar(), grammarDest),
]);
await chmod(serverOutputPath, 0o755);

async function findExistingGrammar() {
  for (const candidate of grammarCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }

  throw new Error(
    'Could not find tree-sitter-utu.wasm. Run the root build first so the grammar artifact exists.',
  );
}
