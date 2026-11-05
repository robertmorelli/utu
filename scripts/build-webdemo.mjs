import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'webdemo', 'vendor');
await fs.mkdir(output, { recursive: true });
// The self-hosted compiler and its JavaScript API (built by `bun run build`).
await fs.rm(path.join(output, 'selfhost'), { recursive: true, force: true });
await fs.cp(path.join(root, 'dist', 'selfhost'), path.join(output, 'selfhost'), { recursive: true });
await fs.copyFile(path.join(root, 'dist', 'utu.wasm'), path.join(output, 'utu.wasm'));
await fs.copyFile(path.join(root, 'dist', 'utu.host.json'), path.join(output, 'utu.host.json'));
await fs.rm(path.join(output, 'utu.js'), { force: true });
await build({
  entryPoints: [path.join(root, 'webdemo', 'preview-runtime.js')],
  outfile: path.join(output, 'preview-runtime.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
});
console.log('Built webdemo/vendor. Serve webdemo/ with a local HTTP server.');
