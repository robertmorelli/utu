// dist/utu.wasm, the compiler with its tools: the bootstrap's compiler
// (dist/utu-core.wasm) building selfhost/ with selfhost/tools/ (see
// joinTools in src/selfhost/node.js).
//
//   node scripts/selfhost-tools.mjs [--out=dist/utu.wasm]
//
// Writes NAME.wasm, NAME.host.json and NAME.sources, as the bootstrap does
// for the compiler. A mistake is reported at its file and line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SELF_MOVE_LIMIT } from '../src/selfhost/compiler.js';
import { COMPILER_WASM, CORE_WASM, compileFile, joinTools, loadNodeCompiler, sourcesRecord } from '../src/selfhost/node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The joined source's name; it is never written.
const JOINED = path.join(ROOT, 'selfhost', 'utu.utu');

/** `selfhost/tools/format.utu:12` for line `line` of the joined source. */
const placeOf = (parts, line) => {
  const part = parts.findLast(entry => entry.line <= line) ?? parts[0];
  return `${part.name}:${line - part.line + part.first}`;
};

export async function buildTools({ out = COMPILER_WASM } = {}) {
  const { text, parts } = joinTools();
  const utu = await loadNodeCompiler({ file: CORE_WASM });
  const started = performance.now();
  const built = await compileFile(utu, JOINED, {
    root: ROOT,
    moveLimit: SELF_MOVE_LIMIT,
    readFile: async file => file === JOINED ? text : fs.readFileSync(file, 'utf8'),
  });
  if (!built.wasm) {
    const lines = built.diagnostics.map(d => `${d.file === JOINED && d.line ? placeOf(parts, d.line) : d.file ?? ''}: ${d.message}`);
    throw new Error(`the tools do not build:\n${lines.join('\n')}`);
  }
  const base = out.replace(/\.wasm$/, '');
  fs.writeFileSync(out, built.wasm);
  fs.writeFileSync(`${base}.host.json`, JSON.stringify(built.spec));
  fs.writeFileSync(`${base}.sources`, `${JSON.stringify(sourcesRecord(text, true))}\n`);
  return { size: built.wasm.length, ms: performance.now() - started };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
  try {
    const { size, ms } = await buildTools(out ? { out: path.resolve(out) } : {});
    console.log(`dist/utu.wasm: ${size} bytes (the compiler with its tools), built by it in ${ms.toFixed(0)} ms`);
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }
}
