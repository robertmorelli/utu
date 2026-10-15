// Build the TypeScript + React Foundry for the browser into dist/react, and
// print its size in the shape build-wutu.mjs prints. Like the wutu build, the
// page embeds the game data and starter map, and the stylesheet ships inside
// the script (bundled as text), so the two payloads compare like for like.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writePage } from './page.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOUNDRY = path.resolve(HERE, '..');
const out = path.resolve(process.argv[2] ?? path.join(FOUNDRY, 'dist/react'));

execFileSync('node', ['build.mjs'], { cwd: path.join(FOUNDRY, 'js'), stdio: 'inherit' });
await fs.mkdir(out, { recursive: true });
const script = await fs.readFile(path.join(FOUNDRY, 'js/dist/app/app.js'));
await fs.writeFile(path.join(out, 'app.js'), script);
await writePage(out, { script: 'app.js', css: false });
const sizes = bytes => ({
  raw: bytes.length,
  gzip: zlib.gzipSync(bytes, { level: 9 }).length,
  brotli: zlib.brotliCompressSync(bytes).length,
});
console.log(JSON.stringify({ javascript: sizes(script), total: sizes(script) }));
