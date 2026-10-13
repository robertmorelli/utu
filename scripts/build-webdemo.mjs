import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'webdemo', 'vendor');
await fs.mkdir(output, { recursive: true });
await fs.copyFile(path.join(root, 'dist', 'utu.js'), path.join(output, 'utu.js'));
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
