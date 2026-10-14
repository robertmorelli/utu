// Streams in both compilers: examples/streams.utu's values (made in utu,
// transformed, adopted from a host async generator, closed by `break`), a
// stream utu returns read by JS's `for await`, and what an `await for` that
// cannot run is reported as.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { initParser, createCompiler, emitBinary, instantiateLowered, buildImportObject, collectAnalysisDiagnostics } = await import('../src/index.js');
const parser = await initParser({ wasmDir: `${ROOT}/` });
const utu = await loadNodeCompiler();

/** Both compilers' builds of `file`: each its exports (async ones entered through promising) or its errors. */
async function both(file) {
  const out = {};
  const compiler = createCompiler({ parser, target: 'normal', optimize: 'size', readFile: f => fs.readFile(f, 'utf8'), resolvePath: (a, b) => path.resolve(path.dirname(a), b) });
  try {
    const doc = await compiler.compileFile(file);
    const errors = collectAnalysisDiagnostics(doc).filter(d => d.severity === 'error');
    if (errors.length) out.stage0 = { errors: errors.map(e => e.message) };
    else {
      const wasm = emitBinary(doc);
      const { exports } = (await instantiateLowered(wasm, await buildImportObject(doc, { wasm }))).instance;
      out.stage0 = { exports: Object.fromEntries(Object.entries(exports).map(([k, v]) => [k, typeof v === 'function' ? WebAssembly.promising(v) : v])) };
    }
  } catch (error) {
    out.stage0 = { errors: [error.message] };
  }
  const built = await compileFile(utu, file, { optimize: 'size' });
  out.selfhost = built.wasm
    ? { exports: (await instantiateNode(built.wasm, built.spec)).exports }
    : { errors: built.diagnostics.map(d => d.message) };
  return out;
}

const example = await both(path.join(ROOT, 'examples', 'streams.utu'));
for (const compiler of ['stage0', 'selfhost']) {
  const { exports, errors } = example[compiler];
  assert.ok(exports, `${compiler}: ${errors}`);
  assert.equal(await exports.evens(), 120, `${compiler}: of, filter, map`);
  assert.equal(await exports.pieces(), 114, `${compiler}: generate, skip, take, chain`);
  assert.equal(await exports.joined(), 'alpha gamma delta ', `${compiler}: a host async generator, with continue`);
  assert.equal(Boolean(await exports.stopped()), true, `${compiler}: break closes the stream`);
  const values = [];
  for await (const v of await exports.handed()) values.push(v);
  assert.deepEqual(values, [7, 8, 9], `${compiler}: JS reads a stream utu returns`);
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-streams-'));
try {
  const cases = [
    ['fn f() I32 { let t = 0; await for (5) |v| { t += v; }; t; }', "Unknown method 'I32.iterator'"],
    ['fn f() I32 { let t = 0; await for (0 ..< 3) |v| { t += v; }; t; }', 'await for reads a generator call or a stream: `await for (ticks()) |t| { … }`'],
    ['fn f(s: Stream[I32]) I32 { let t = 0; await for (s) |v, w| { t += v; }; t; }', 'a stream loop binds one value: await for (s) |value| { … }'],
  ];
  for (const [i, [body, message]] of cases.entries()) {
    const file = path.join(dir, `case${i}.utu`);
    await fs.writeFile(file, `export lib { ${body} }\n`);
    const built = await both(file);
    // Stage 0 counts the calls the first one's failure causes (`(+4 caused by this)`).
    assert.equal(built.stage0.errors?.[0].replace(/ \(\+\d+ caused by this\)$/, ''), message, `stage 0: ${body}`);
    assert.deepEqual(built.selfhost.errors, [message], `self-hosted: ${body}`);
  }
  console.log(`streams: examples/streams.utu alike in both compilers, JS reads a stream utu returns, and ${cases.length} mistakes reported alike`);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
