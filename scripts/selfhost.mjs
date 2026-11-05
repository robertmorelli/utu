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
import { builtModule, compileProgram as driverCompileProgram, instantiate, loadProgram as driverLoadProgram, SELF_MOVE_LIMIT } from '../src/selfhost/compiler.js';
import { nodeHost } from '../src/selfhost/node.js';

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

// The program side of the driver is the shipped one (src/selfhost/), with
// packages resolved from this repository.
const host = nodeHost({ root: ROOT });

/** Give the self-hosted compiler a program (see src/selfhost/compiler.js). */
export function loadProgram(utu, entry, options = {}) {
  return driverLoadProgram(utu, entry, { ...host, ...options });
}

/** Compile the loaded program for a target (0: exports, 1: tests). */
export function compileProgram(utu, target) {
  return driverCompileProgram(utu, target, host);
}

export { builtModule };

/** Instantiate a module the self-hosted compiler built, with its spec. */
export function instantiateBuilt(wasm, spec = {}) {
  return instantiate(wasm, spec, host);
}

// A checked-in compiler builds stage 1. UTU_STAGE0 can point to another
// compiler Wasm for recovery.
export const STAGE0 = path.join(ROOT, 'stage0', 'utu.wasm');

/**
 * Stage 1, the compiler as stage 0 builds it from selfhost/.
 */
export async function loadStage1() {
  const selected = process.env.UTU_STAGE0 ? path.resolve(process.env.UTU_STAGE0) : STAGE0;
  const specPath = selected.replace(/\.wasm$/, '.host.json');
  const stage0 = (await instantiateBuilt(fs.readFileSync(selected), JSON.parse(fs.readFileSync(specPath, 'utf8')))).instance.exports;
  const { wasm, spec } = await buildWith(stage0);
  return { exports: (await instantiateBuilt(wasm, spec)).instance.exports, builder: selected };
}

/**
 * The self-hosted compiler's exports. Stage 1 is the compiler as stage 0
 * builds it; stage 2, as stage 1 builds it (the compiler built by itself).
 */
export async function loadSelfhost({ stage = Number(process.env.UTU_STAGE ?? 1) } = {}) {
  const { exports } = await loadStage1();
  if (stage === 1) return exports;
  let compiler = exports;
  for (let s = 2; s <= stage; s++) {
    const { wasm, spec } = await buildWith(compiler);
    compiler = (await instantiateBuilt(wasm, spec)).instance.exports;
  }
  return compiler;
}

/** The self-hosted compiler (its bytes and host spec), built by a loaded self-hosted compiler. */
export async function buildWith(compiler, { source } = {}) {
  const text = source ?? joinSelfhost().text;
  const files = await loadProgram(compiler, JOINED, { readFile: async file => file === JOINED ? text : host.readFile(file) });
  // (A compiler older than the limit builds without it.)
  compiler.set_move_limit?.(SELF_MOVE_LIMIT);
  const size = await compileProgram(compiler, 0);
  compiler.set_move_limit?.(0);
  if (size < 0) throw new Error(`the self-hosted compiler does not build itself: ${files.diagnostics} diagnostics`);
  return builtModule(compiler, size);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
  try {
    const stage0 = (await instantiateBuilt(fs.readFileSync(STAGE0), JSON.parse(fs.readFileSync(STAGE0.replace(/\.wasm$/, '.host.json'), 'utf8')))).instance.exports;
    const { wasm } = await buildWith(stage0);
    if (out) fs.writeFileSync(out, wasm);
    console.log(`selfhost: ${wasm.length} bytes${out ? ` → ${out}` : ''}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
