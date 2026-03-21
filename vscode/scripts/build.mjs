import { context, build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const extensionRoot = resolve(__dirname, '..');
const watchMode = process.argv.includes('--watch');

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  sourcemap: 'linked',
  sourcesContent: false,
  logLevel: 'info',
};

const configs = [
  {
    ...shared,
    entryPoints: [resolve(extensionRoot, 'src/extension.ts')],
    outfile: resolve(extensionRoot, 'dist/extension.js'),
    format: 'cjs',
    external: ['vscode', 'web-tree-sitter/web-tree-sitter.wasm'],
  },
  {
    ...shared,
    entryPoints: [resolve(extensionRoot, '../compiler/index.js')],
    outfile: resolve(extensionRoot, 'dist/compiler.mjs'),
    format: 'esm',
    external: ['binaryen', 'web-tree-sitter'],
  },
];

if (watchMode) {
  const contexts = await Promise.all(configs.map((config) => context(config)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('Watching UTU extension sources...');
  await new Promise(() => {});
} else {
  await Promise.all(configs.map((config) => build(config)));
}
