import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const treeSitterJsSource = resolve(repoRoot, 'node_modules', 'web-tree-sitter', 'web-tree-sitter.js');
const treeSitterJsDest = resolve(repoRoot, 'web-tree-sitter.js');
const treeSitterWasmSource = resolve(repoRoot, 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm');
const treeSitterWasmDest = resolve(repoRoot, 'web-tree-sitter.wasm');

const sharedOptions = {
  bundle: true,
  entryPoints: [resolve(repoRoot, 'compiler/index.js')],
  external: ['module', 'web-tree-sitter'],
  format: 'esm',
  logLevel: 'info',
};

await Promise.all([
  build({
    ...sharedOptions,
    outfile: resolve(repoRoot, 'dist/index.mjs'),
  }),
  copyFile(treeSitterJsSource, treeSitterJsDest),
  copyFile(treeSitterWasmSource, treeSitterWasmDest),
]);
