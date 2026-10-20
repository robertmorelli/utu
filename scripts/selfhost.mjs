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
import { builtModule, compileProgram as driverCompileProgram, instantiate, loadProgram as driverLoadProgram } from '../src/selfhost/compiler.js';
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

/**
 * Stage -1: selfhost/ built by the JavaScript compiler. The compiled module's
 * bytes; throws with every error, placed in its file.
 */
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
  // With a source map, the binary also names its functions, so a trap in
  // the compiler says where it happened.
  return { doc, wasm: emitBinary(doc, { sourceMap: true }).binary };
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

// Stage 0 is a self-hosted compiler checked in as Wasm (stage0/utu.wasm, and
// its host spec beside it). Stage -1, the JavaScript compiler, is the last
// resort: it builds stage 1 only when stage 0 cannot (selfhost/ uses something
// newer than stage 0 understands), or when UTU_STAGE0=js asks for it.
export const STAGE0 = path.join(ROOT, 'stage0', 'utu.wasm');
const STAGE0_SPEC = path.join(ROOT, 'stage0', 'utu.host.json');

/**
 * Stage 1, the compiler as stage 0 builds it from selfhost/ (or stage -1, the
 * JavaScript compiler, when stage 0 cannot): its exports, and which built it.
 */
export async function loadStage1({ log = message => console.error(message) } = {}) {
  if (process.env.UTU_STAGE0 !== 'js' && fs.existsSync(STAGE0)) {
    try {
      const stage0 = (await instantiateBuilt(fs.readFileSync(STAGE0), JSON.parse(fs.readFileSync(STAGE0_SPEC, 'utf8')))).instance.exports;
      const { wasm, spec } = await buildWith(stage0);
      return { exports: (await instantiateBuilt(wasm, spec)).instance.exports, builder: 'stage 0' };
    } catch (error) {
      log(`stage 0 (stage0/utu.wasm) does not build selfhost/: ${error.message.split('\n')[0]}\n`
        + 'falling back to stage -1, the JavaScript compiler; once the build passes, run `bun run stage0` to update stage 0');
    }
  }
  const { doc, wasm } = await buildSelfhost();
  const { instance } = await instantiateLowered(wasm, await buildImportObject(doc, { wasm, projectRoot: ROOT }));
  return { exports: instance.exports, builder: 'stage -1' };
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
export async function buildWith(compiler) {
  const { text } = joinSelfhost();
  const files = await loadProgram(compiler, JOINED, { readFile: async file => file === JOINED ? text : host.readFile(file) });
  const size = await compileProgram(compiler, 0);
  if (size < 0) throw new Error(`the self-hosted compiler does not build itself: ${files.diagnostics} diagnostics`);
  return builtModule(compiler, size);
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
