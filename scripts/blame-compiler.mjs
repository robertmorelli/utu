// The compiler's own size, blamed (src/selfhost/blame.js): the tools
// (dist/utu-tools.wasm) build selfhost/ again with blame on, which must give dist/utu.wasm
// byte for byte (blame changes nothing built), and each byte is placed in
// its selfhost/ file and line.
//
//   node scripts/blame-compiler.mjs [-o dir] [--top=N] [--sources=dir] [--no-br]
//
//   -o dir        writes utu.blame.json and utu.blame.html there (default dist/blame)
//   --top=N       rows of each list printed (default 15)
//   --sources=dir blames another selfhost/ tree (its files.txt and files),
//                 as this compiler builds it: an older tree, to see what grew
//   --no-br       no compressed estimates (faster)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, SELF_MOVE_LIMIT } from '../src/selfhost/compiler.js';
import { loadNodeTools, nodeHost } from '../src/selfhost/node.js';
import { blame } from '../src/selfhost/blame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const outAt = args.indexOf('-o');
const out = path.resolve(outAt >= 0 ? args[outAt + 1] : path.join(ROOT, 'dist', 'blame'));
const top = Number(flag('top') ?? 15);
const dir = path.resolve(flag('sources') ?? path.join(ROOT, 'selfhost'));

// The files joined as one source, as scripts/selfhost.mjs joins them.
const names = fs.readFileSync(path.join(dir, 'files.txt'), 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
const parts = [];
let at = 0;
for (const name of names) {
  let text = fs.readFileSync(path.join(dir, name), 'utf8');
  if (!text.endsWith('\n')) text += '\n';
  const bytes = Buffer.from(text);
  parts.push({ key: `selfhost/${name}`, at, text, bytes });
  at += bytes.length;
}
const joined = path.join(dir, 'utu.utu');
const text = parts.map(part => part.text).join('');

const utu = await loadNodeTools();
const host = nodeHost({ root: ROOT });
const built = await compile(utu, joined, { ...host, readFile: async file => file === joined ? text : fs.readFileSync(file, 'utf8'), blame: true, moveLimit: SELF_MOVE_LIMIT });
if (!built.wasm) {
  console.error(`selfhost does not build: ${built.diagnostics.slice(0, 5).map(d => `${d.file}:${d.line}: ${d.message}`).join('\n')}`);
  process.exit(1);
}
const dist = path.join(ROOT, 'dist', 'utu.wasm');
if (dir === path.join(ROOT, 'selfhost') && !Buffer.from(built.wasm).equals(fs.readFileSync(dist))) {
  console.error('blame changed the compiler built: it differs from dist/utu.wasm');
  process.exit(1);
}

// The joined source's places, each in its own file (the page shows only theirs).
const offset = built.files.find(f => f.key === joined).offset;
const rep = await blame(utu, {
  wasm: built.wasm, spec: built.spec, name: 'utu.wasm', brotli: !args.includes('--no-br'),
  files: [...built.files.filter(f => f.key !== joined).map(f => ({ ...f, text: null })), ...parts.map(part => ({ ...part, offset: offset + part.at }))],
});
console.log(rep.top(top));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'utu.blame.json'), rep.json());
fs.writeFileSync(path.join(out, 'utu.blame.html'), rep.html());
console.log(`\n${path.relative(process.cwd(), path.join(out, 'utu.blame.json'))}\n${path.relative(process.cwd(), path.join(out, 'utu.blame.html'))}`);
