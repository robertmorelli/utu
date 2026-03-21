import { build } from 'esbuild';
import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const lspRoot = resolve(__dirname, '..');
const repoRoot = resolve(lspRoot, '..');
const distRoot = resolve(lspRoot, 'dist');
const serverOutputPath = resolve(distRoot, 'utu-lsp.js');
const parserRuntimeSource = resolve(repoRoot, 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm');
const parserRuntimeDest = resolve(distRoot, 'web-tree-sitter.wasm');
const grammarDest = resolve(distRoot, 'tree-sitter-utu.wasm');
const grammarCandidates = [
  resolve(repoRoot, 'tree-sitter-utu.wasm'),
  resolve(repoRoot, 'vscode', 'tree-sitter-utu.wasm'),
  resolve(repoRoot, 'cli_artifact', 'tree-sitter-utu.wasm'),
  resolve(repoRoot, 'web_artifact', 'tree-sitter-utu.wasm'),
];

await mkdir(distRoot, { recursive: true });
await build({
  bundle: true,
  entryPoints: [resolve(lspRoot, 'src', 'server', 'node.ts')],
  outfile: serverOutputPath,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: 'linked',
  sourcesContent: false,
  logLevel: 'info',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
await copyFile(parserRuntimeSource, parserRuntimeDest);
await copyFile(await findExistingGrammar(), grammarDest);
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
