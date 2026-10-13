// Build the self-hosted compiler (selfhost/).
//
//   node scripts/selfhost.mjs [--out=file.wasm]
//
// Its mems are top-level declarations of one program, so the files listed in
// selfhost/files.txt are joined, in order, into one source and compiled as
// one file. Errors point at the file and line they came from.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAnalysisDiagnostics, createCompiler, emitBinary, initParser, instantiateLowered, buildImportObject } from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'selfhost');
// The joined source's name; it is never written.
const JOINED = path.join(DIR, 'utu.utu');

/** The joined source, and where each file begins in it (1-based lines). */
export function joinSelfhost() {
  const names = fs.readFileSync(path.join(DIR, 'files.txt'), 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
  const parts = [];
  let line = 1;
  for (const name of names) {
    let text = fs.readFileSync(path.join(DIR, name), 'utf8');
    if (!text.endsWith('\n')) text += '\n';
    parts.push({ name: `selfhost/${name}`, line, text });
    line += text.split('\n').length - 1;
  }
  return { text: parts.map(part => part.text).join(''), parts };
}

/** `selfhost/parse.utu:12` for line `line` of the joined source. */
function placeOf(parts, line) {
  const part = parts.findLast(entry => entry.line <= line) ?? parts[0];
  return `${part.name}:${line - part.line + 1}`;
}

/** The compiled module's bytes; throws with every error, placed in its file. */
export async function buildSelfhost() {
  const { text, parts } = joinSelfhost();
  const relocate = message => message
    .replace(/\(line (\d+)\)/g, (_, line) => `(${placeOf(parts, Number(line))})`)
    .replace(/ at (\d+):(\d+)/g, (_, line, col) => ` at ${placeOf(parts, Number(line))}:${col}`);
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const compiler = createCompiler({
    parser, target: 'normal', optimize: 'speed',
    readFile: file => file === JOINED ? Promise.resolve(text) : fs.promises.readFile(file, 'utf8'),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
  });
  let doc;
  try {
    doc = await compiler.compileFile(JOINED);
  } catch (error) {
    const row = error.diagnostic?.primary?.row;
    if (!row) throw error;
    throw new Error(`${placeOf(parts, row)}: ${relocate(error.message)}`);
  }
  const errors = collectAnalysisDiagnostics(doc).filter(diagnostic => diagnostic.severity === 'error').map(({ message, primary }) =>
    primary?.row ? `${placeOf(parts, primary.row)}: ${relocate(message)}` : relocate(message));
  if (errors.length) throw new Error(errors.join('\n'));
  return { doc, wasm: emitBinary(doc) };
}

/** The self-hosted compiler's exports. */
export async function loadSelfhost() {
  const { doc, wasm } = await buildSelfhost();
  const { instance } = await instantiateLowered(wasm, await buildImportObject(doc, { wasm, projectRoot: ROOT }));
  return instance.exports;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
  try {
    const { wasm } = await buildSelfhost();
    if (out) fs.writeFileSync(out, wasm);
    console.log(`selfhost: ${wasm.length} bytes${out ? ` → ${out}` : ''}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
