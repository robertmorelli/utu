// The everyday standard library (examples/stdlib.utu: Str's text methods,
// F64's math, std:StrMap, std:Random, std:Console, std:Time), alike in
// both compilers and as expected.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(ROOT, 'examples', 'stdlib.utu');
const expected = {
  text: 'HELLO, WORLD|8|8|true|true|false',
  pieces: 'a-b--c|x, y, z',
  padded: '007|ab..|ababab|[x ][ x]',
  parsed: 42 - 16 + 1000 - 1,
  floats: 12.5,
  math: 500 + 1024 + 5 + 1 + 2 + 3 + 1,
  specials: 111,
  words: '4 3 1 -1 true',
  // Keys 0..199 but the multiples of 3: their sum, and how many.
  removals: (19900 - 3 * (66 * 67) / 2) * 1000 + 133,
  dice: 116,
  logged: 1,
};

const { initParser, createCompiler, emitBinary, instantiateLowered, buildImportObject, collectAnalysisDiagnostics } = await import('../src/index.js');
const parser = await initParser({ wasmDir: `${ROOT}/` });
const compiler = createCompiler({ parser, target: 'normal', optimize: 'size', readFile: f => fs.readFile(f, 'utf8'), resolvePath: (a, b) => path.resolve(path.dirname(a), b) });
const doc = await compiler.compileFile(file);
const errors = collectAnalysisDiagnostics(doc).filter(d => d.severity === 'error');
assert.deepEqual(errors.map(e => e.message), [], 'stage 0');
const wasm = emitBinary(doc);
const stage0 = (await instantiateLowered(wasm, await buildImportObject(doc, { wasm }))).instance.exports;
const built = await compileFile(await loadNodeCompiler(), file, { optimize: 'size' });
assert.ok(built.wasm, built.diagnostics.map(d => d.message).join('\n'));
const selfhost = (await instantiateNode(built.wasm, built.spec)).exports;

const log = console.log;
const printed = [];
console.log = (...args) => printed.push(args.join(' '));
try {
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(stage0[name](), value, `stage 0: ${name}`);
    assert.equal(selfhost[name](), value, `self-hosted: ${name}`);
  }
} finally {
  console.log = log;
}
assert.deepEqual(printed, ['to stdout', 'to stdout']);
console.log(`stdlib: ${Object.keys(expected).length} uses of text, math, maps, random numbers, the console and clocks, alike in both compilers`);
