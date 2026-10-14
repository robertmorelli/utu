// @wat: the assembler (src/wat/assemble.js) on every instruction it knows,
// against wasm-tools when it is installed (else the engine validates them);
// examples/wat.utu in both compilers; and mistakes, reported alike, at their
// place in the text.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';
import { assembleFunction, watInstructions } from '../src/wat/assemble.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-wat-'));
try {
  // Every instruction, in a function whose parameters it takes.
  const types = ['i32', 'i64', 'f32', 'f64', 'v128'];
  const signatures = [[], ...types.map(t => [t]), ...types.flatMap(a => types.map(b => [a, b])), ['v128', 'v128', 'v128']];
  const immediate = name => name === 'v128.const' ? ' i32x4 1 -2 0x7fffffff 4'
    : name === 'i8x16.shuffle' ? ` ${Array.from({ length: 16 }, (_, i) => (i * 3) % 32).join(' ')}`
    : /_lane(_[su])?$/.test(name) ? ' 1'
    : { 'i32.const': ' -123456', 'i64.const': ' -0x123456789', 'f32.const': ' 1.5', 'f64.const': ' -0x1.8p3' }[name] ?? '';
  const functions = watInstructions().map(name => {
    for (const params of signatures) {
      for (const result of [null, ...types]) {
        const text = `${params.map((_, i) => `local.get $p${i}`).join(' ')} ${name}${immediate(name)}`;
        const assembled = assembleFunction({ params: params.map((type, i) => ({ name: `p${i}`, type })), result, text });
        if (assembled.code) return { name, params, result, text, code: assembled.code };
      }
    }
    assert.fail(`no signature assembles ${name}`);
  });
  const wat = `(module ${functions.map(f => `(func ${f.params.map((t, i) => `(param $p${i} ${t})`).join(' ')} ${f.result ? `(result ${f.result})` : ''} ${f.text})`).join('\n')})`;
  let checked = 'the engine validates them';
  try {
    await fs.writeFile(path.join(dir, 'all.wat'), wat);
    execFileSync('wasm-tools', ['parse', path.join(dir, 'all.wat'), '-o', path.join(dir, 'all.wasm')], { stdio: 'ignore' });
    const bytes = await fs.readFile(path.join(dir, 'all.wasm'));
    assert.ok(WebAssembly.validate(bytes));
    let at = 8;
    const leb = () => { let v = 0, shift = 0, b; do { b = bytes[at++]; v |= (b & 127) << shift; shift += 7; } while (b & 128); return v >>> 0; };
    const bodies = [];
    while (at < bytes.length) {
      const id = bytes[at++];
      const end = leb() + at;
      if (id === 10) for (let i = 0, n = leb(); i < n; i++) { const size = leb(); bodies.push(bytes.subarray(at, at + size)); at += size; }
      at = end;
    }
    functions.forEach((f, i) => assert.deepEqual([...f.code], [...bodies[i]], `${f.name}: as wasm-tools assembles it`));
    checked = 'each as wasm-tools assembles it';
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Without wasm-tools: one module of all of them, which the engine validates.
  {
    const leb = n => { const o = []; do { let b = n & 127; n >>>= 7; if (n) b |= 128; o.push(b); } while (n); return o; };
    const VT = { i32: 0x7f, i64: 0x7e, f32: 0x7d, f64: 0x7c, v128: 0x7b };
    const section = (id, body) => [id, ...leb(body.length), ...body];
    const typeSec = [...leb(functions.length), ...functions.flatMap(f => [0x60, ...leb(f.params.length), ...f.params.map(t => VT[t]), ...(f.result ? [1, VT[f.result]] : [0])])];
    const funcSec = [...leb(functions.length), ...functions.flatMap((_, i) => leb(i))];
    const codeSec = [...leb(functions.length), ...functions.flatMap(f => [...leb(f.code.length), ...f.code])];
    const module = Uint8Array.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, ...section(1, typeSec), ...section(3, funcSec), ...section(10, codeSec)]);
    assert.ok(WebAssembly.validate(module), 'every instruction, in one module');
  }

  // examples/wat.utu in both compilers.
  const { initParser, createCompiler, emitBinary, instantiateLowered, buildImportObject, collectAnalysisDiagnostics } = await import('../src/index.js');
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const utu = await loadNodeCompiler();
  const stage0 = async file => {
    const compiler = createCompiler({ parser, target: 'normal', optimize: 'size', readFile: f => fs.readFile(f, 'utf8'), resolvePath: (a, b) => path.resolve(path.dirname(a), b) });
    try {
      const doc = await compiler.compileFile(file);
      const errors = collectAnalysisDiagnostics(doc).filter(d => d.severity === 'error');
      if (errors.length) return { errors: errors.map(e => e.message) };
      const wasm = emitBinary(doc);
      return { exports: (await instantiateLowered(wasm, await buildImportObject(doc, { wasm }))).instance.exports };
    } catch (error) {
      return { errors: [error.message] };
    }
  };
  const selfhost = async file => {
    const built = await compileFile(utu, file, { optimize: 'size' });
    return built.wasm ? { exports: (await instantiateNode(built.wasm, built.spec)).exports } : { errors: built.diagnostics.map(d => `${d.line}:${d.column} ${d.message}`) };
  };
  const expected = { rotated: 3, signed: -2.5, summed: 5050, dotted: 50, extended: -1 };
  const example = path.join(ROOT, 'examples', 'wat.utu');
  for (const [compiler, build] of [['stage0', stage0], ['selfhost', selfhost]]) {
    const { exports, errors } = await build(example);
    assert.ok(exports, `${compiler}: ${errors}`);
    for (const [name, value] of Object.entries(expected)) assert.equal(exports[name](), value, `${compiler}: ${name}`);
  }

  // Mistakes: each at its place.
  const mistakes = [
    ['fn f(x: I32) I32 { @wat/\\ (i64.add (local.get $x) (local.get $x)) \\/; }', '1:27 i64.add needs an i64, not an i32'],
    ['fn f(x: I32) I32 {\n    @wat/\\\n        local.get $x\n        i32.lodd\n    \\/;\n}', "4:9 unknown instruction 'i32.lodd'"],
    ['fn f(x: I32) I32 { @wat/\\ (i32.load (local.get $x)) \\/; }', '1:28 i32.load: a @wat function computes on its arguments; it has no memories, globals, calls, or references'],
    ['fn f(x: I32) I32 { @wat/\\ local.get $x local.get $x \\/; }', '1:40 the function returns i32, but its body leaves 1 more value'],
    ['fn f(x: Str) I32 { @wat/\\ i32.const 1 \\/; }', '1:20 a @wat function takes and returns I32, U32, I64, U64, F32, F64, Bool, or V128, not Str'],
    ['fn f() I32 { let y = 1; @wat/\\ i32.const 1 \\/; }', "1:25 @wat is a function's whole body: fn f(x: I32) I32 { @wat/\\ … \\/; }"],
  ];
  for (const [i, [source, want]] of mistakes.entries()) {
    const file = path.join(dir, `mistake${i}.utu`);
    await fs.writeFile(file, `${source}\nexport lib { fn g() I32 { 0; } }\n`);
    const got = await selfhost(file);
    assert.deepEqual(got.errors, [want], source);
    const theirs = await stage0(file);
    assert.equal(theirs.errors?.[0], want.replace(/^\d+:\d+ /, ''), `stage 0: ${source}`);
  }
  console.log(`wat: ${functions.length} instructions (${checked}), examples/wat.utu alike in both compilers, ${mistakes.length} mistakes at their places`);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
