// Build the utu + wutu Foundry for the browser into dist/wutu.
// The shared stylesheet becomes a generated @css module (utu/style.utu), and
// index.html embeds the game data and the starter map.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBrowserApp } from '../../../tools/dts/build-app.mjs';
import { writePage } from './page.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOUNDRY = path.resolve(HERE, '..');
const out = path.resolve(process.argv[2] ?? path.join(FOUNDRY, 'dist/wutu'));
const optimize = process.argv.includes('--speed') ? 'speed' : 'size';

const css = await fs.readFile(path.join(FOUNDRY, 'data/style.css'), 'utf8');
await fs.writeFile(path.join(FOUNDRY, 'utu/style.utu'),
  `// Generated from data/style.css by tools/build-wutu.mjs. Do not edit.\nmod style {\n    fn sheet() Str {\n        @css/\\\n${css}\\/;\n    }\n}\n`);
const report = await buildBrowserApp({ entry: path.join(FOUNDRY, 'utu/app.utu'), outDir: out, optimize });
await writePage(out, { script: 'app.js', css: false });
console.log(JSON.stringify(report));
