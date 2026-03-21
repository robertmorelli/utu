import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

await build({
  bundle: true,
  entryPoints: [resolve(repoRoot, 'compiler/index.js')],
  external: ['module', 'web-tree-sitter'],
  format: 'esm',
  logLevel: 'info',
  outfile: resolve(repoRoot, 'dist/index.mjs'),
});
