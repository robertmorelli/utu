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
  // Each case: the body, then stage 0's message and the self-hosted compiler's.
  const cases = [
    ['fn f() I32 { let t = 0; await for (5) |v| { t += v; }; t; }', "Unknown method 'I32.iterator'", 'No method I32.iterator'],
    ['fn f() I32 { let t = 0; await for (0 ..< 3) |v| { t += v; }; t; }', 'await for reads a generator call or a stream: `await for (ticks()) |t| { … }`', 'await for needs a generator call or a stream'],
    ['fn f(s: Stream[I32]) I32 { let t = 0; await for (s) |v, w| { t += v; }; t; }', 'a stream loop binds one value: await for (s) |value| { … }', 'A stream loop binds one value'],
    ['fn f(s: ?Stream[I32]) I32 { let t = 0; await for (s) |v| { t += v; }; t; }', "Cannot access field 'iterator' on nullable ?Stream[I32]", '?Stream[I32] may be null'],
    // (A closure utu calls may await: the self-hosted compiler calls its body by call_ref. Stage 0 still reports it.)
  ];
  for (const [i, [body, stage0, selfhost]] of cases.entries()) {
    const file = path.join(dir, `case${i}.utu`);
    await fs.writeFile(file, `export lib { ${body} }\n`);
    const built = await both(file);
    // Stage 0 counts the calls the first one's failure causes (`(+4 caused by this)`), and names Stream[I32] Stream__I32.
    assert.equal(built.stage0.errors?.[0].replace(/ \(\+\d+ caused by this\)$/, '').replace(/(\w)__(\w+)/g, '$1[$2]'), stage0, `stage 0: ${body}`);
    assert.deepEqual(built.selfhost.errors, [selfhost], `self-hosted: ${body}`);
  }
  // Nested loops; a type of its own with the stream's methods (not
  // externrefs); and the source's `return()`, called when the loop is left
  // early, by break or by return.
  const file = path.join(dir, 'more.utu');
  await fs.writeFile(file, `struct Counter:
    | n : I32
struct It:
    | at : I32
fn Counter.iterator |self| () It { It { at: 0 }; }
let resolved: fun(I32) Promise[I32] = @es/\\ (v) => Promise.resolve(v) \\/;
fn Counter.next |self| (it: It) Promise[I32] { it.at += 1; resolved(it.at); }
fn Counter.done |self| (r: I32) Bool { r > self.n; }
fn Counter.value |self| (r: I32) I32 { r * 10; }
fn Counter.close |self| (it: It) void { }
let source: fun() Stream[I32] = @es/\\ () => { const s = (async function* () { yield 1; yield 2; yield 3; })(); const ret = s.return.bind(s); s.return = v => { globalThis.__returns = (globalThis.__returns ?? 0) + 1; return ret(v); }; return s; } \\/;
let closed: fun() I32 = @es/\\ () => { const n = globalThis.__returns ?? 0; globalThis.__returns = 0; return n; } \\/;
fn first(s: Stream[I32]) I32 { await for (s) |v| { return v; }; 0; }
fn apply(f: fun(Stream[I32]) I32, s: Stream[I32]) I32 { f(s) * 100; }
export lib {
    fn nested() I32 {
        let t = 0;
        await for (Stream[I32].of([1, 2])) |a| { await for (Stream[I32].of([10, 20])) |b| { t += a * b; }; };
        t;
    }
    fn custom() I32 { let t = 0; await for (Counter { n: 3 }) |v| { t += v; }; t; }
    fn returned() I32 { first(source()) * 10 + closed(); }
    fn broken() I32 { await for (source()) |v| { break; }; closed(); }
    fn finished() I32 { let t = 0; await for (source()) |v| { t += v; }; t * 10 + closed(); }
    fn passed() I32 { apply(first, source()) + closed(); }
}
`);
  const more = await both(file);
  for (const compiler of ['stage0', 'selfhost']) {
    const { exports, errors } = more[compiler];
    assert.ok(exports, `${compiler}: ${errors}`);
    assert.equal(await exports.nested(), 90, `${compiler}: nested loops`);
    assert.equal(await exports.custom(), 60, `${compiler}: a type with the stream's methods`);
    assert.equal(await exports.returned(), 11, `${compiler}: return closes the stream`);
    assert.equal(await exports.broken(), 1, `${compiler}: break closes the stream`);
    // (Run out, it is closed too, which a finished generator ignores.)
    assert.equal(await exports.finished(), 61, `${compiler}: a stream run out`);
    assert.equal(await exports.passed(), 101, `${compiler}: a function that awaits, called as a fun value`);
  }
  console.log(`streams: examples/streams.utu alike in both compilers, JS reads a stream utu returns, nested loops, types with the methods, closing on break and return, awaiting through a fun value, and ${cases.length} mistakes reported by both`);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
