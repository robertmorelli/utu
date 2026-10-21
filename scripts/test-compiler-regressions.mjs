// Programs that once went wrong, in both compilers: what each builds to, or
// the mistake each reports (where only the self-hosted compiler reports it
// as it should, that is said).
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

async function stage0(file) {
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
}

async function selfhost(file) {
  const built = await compileFile(utu, file, { optimize: 'size' });
  return built.wasm ? { exports: (await instantiateNode(built.wasm, built.spec)).exports } : { errors: built.diagnostics.map(d => d.message) };
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-regressions-'));
let checked = 0;
try {
  let n = 0;
  const write = async text => { const file = path.join(dir, `case${n++}.utu`); await fs.writeFile(file, text); return file; };

  // Programs both compilers build, and what their exports return.
  const literal = Array.from({ length: 25000 }, (_, i) => i % 7).join(', ');
  const programs = [
    // Wasm makes at most 10,000 elements with one array.new_fixed.
    [`export lib { fn total() I32 { let a = [${literal}]; let t = 0; for (a) |v| { t += v; }; t + a.len() * 1000; } }`,
      { total: Array.from({ length: 25000 }, (_, i) => i % 7).reduce((a, b) => a + b) + 25000 * 1000 }],
    // A field holding a closure, called as a method is.
    [`struct P:\n    | f : cl(I32) I32\nexport lib { fn run() I32 { let p = P { f: cl(x: I32) I32 { x + 1; } }; p.f(4); } }`, { run: 5 }],
    // A replacement is its text, \`$\` and all.
    ['export lib { fn run() Str { "ab-ab".replace("a", "$&$$") + "|" + "xay".replace("a", "$\'"); } }', { run: "$&$$b-$&$$b|x$'y" }],
  ];
  for (const [source, expected] of programs) {
    const file = await write(source);
    for (const [compiler, build] of [['stage0', stage0], ['selfhost', selfhost]]) {
      const { exports, errors } = await build(file);
      assert.ok(exports, `${compiler}: ${errors?.join('\n')}`);
      for (const [name, value] of Object.entries(expected)) assert.equal(exports[name](), value, `${compiler}: ${source.slice(0, 60)}`);
      checked++;
    }
  }

  // An @ir function named as a value, in the middle of another function's
  // locals, which its making once overwrote (stage 0 cannot build this).
  const valued = await selfhost(await write(`fn plus(a: I32, b: I32) I32 { @ir/\\ <ir-i32-add><ir-ident name="a"/><ir-ident name="b"/></ir-i32-add> \\/; }
fn apply(f: fun(I32, I32) I32, a: I32, b: I32) I32 { f(a, b); }
export lib {
    fn run() F64 {
        let s = "text";
        let x: F64 = 1.5;
        let r = apply(plus, 1, 2);
        let z: F64 = 10.0;
        r.to_f64() * 1000.0 + x * 100.0 + z + s.len().to_f64();
    }
}
`));
  assert.equal(valued.exports?.run(), 3164, valued.errors?.join('\n'));
  checked++;

  // At -O3, a struct made into locals and then a second, stored into the
  // first's field (the second pass read the first's rewritten nodes).
  const stored = await compileFile(utu, await write(`struct Task:
    | identity: I32
struct Holder:
    | task: Task
export lib {
    fn run() I32 {
        let a: Task = &{ identity: 3 };
        let h: Holder = &{ task: a };
        let b: Task = &{ identity: 7 };
        h.task = b;
        h.task.identity;
    }
}
`), { optimize: 'speed' });
  assert.equal((await instantiateNode(stored.wasm, stored.spec)).exports.run(), 7, stored.diagnostics?.map(d => d.message).join('\n'));
  checked++;

  // Programs only the self-hosted compiler builds right, in every mode.
  const tree = `struct Node:
    | v: I32
    | kids: Array[Node]
fn walk(n: Node) yield Node { yield n; for (n.kids) |k| { for (walk(k)) |d| { yield d; }; }; }
fn tree() Node { Node { v: 1, kids: [Node { v: 2, kids: [] }] }; }
fn show(xs: Array[I32]) Str { xs fold("") |acc, v, i| { if i == 0 { \`\${v}\`; } else { \`\${acc},\${v}\`; }; }; }
mod Box {
    struct &:
        | v: I32
    fn &.new(v: I32) & { &{ v: v }; }
    fn &.len |self| () I32 { self.v += 100; self.v; }
}
`;
  const selfhostPrograms = [
    // A recursive generator's loop, run again, starts over (it yielded nothing).
    [`${tree}export lib {
    fn again() Str { let out = ""; for (0 ..< 3) |r| { for (walk(tree())) |n| { out = \`\${out}\${n.v}\`; }; out = \`\${out}|\`; }; out; }
    fn nested() Str { let out = ""; for (walk(tree())) |a| { for (walk(tree())) |b| { out = \`\${out}\${a.v}\${b.v} \`; }; }; out; }
}`, { again: '12|12|12|', nested: '11 12 21 22 ' }],
    // (… collect(T)) … is one loop only when no one can tell.
    [`${tree}export lib {
    fn writes() Str { let xs = [1, 2, 3, 4]; let k = 10; show((xs map |n| { n * k; } collect(I32)) map |v| { k += 1; v; } collect(I32)); }
    fn source() Str { let ys = [1, 2, 3, 4]; show((ys map |n| { ys[0] + n; } collect(I32)) map |v| { ys[0] = 100; v; } collect(I32)); }
    fn own_len() I32 { let bs = [Box.new(1), Box.new(2), Box.new(3)]; let r = (bs map |b| { b.len(); } collect(I32)) take(1) sum; r * 1000 + bs[2].v; }
    fn fused_bisect() I32 { ([1, 2, 3, 4] map |n| { n * 2; } collect(I32)) bisect |n| { n < 5; }; }
}`, { writes: '10,20,30,40', source: '2,3,4,5', own_len: 101103, fused_bisect: 2 }],
    // Ranges as sources: to the type's greatest, wider than 2^31, of I64, U32 and U64.
    [`export lib {
    fn to_max() I32 { let hi = 2147483647; (hi - 2 ... hi) count; }
    fn wide_take() I32 { (-2000000000 ..< 2000000000) take(3) count; }
    fn wide_skip() I32 { (-2147483648 ..< 2147483647) skip(2147483647) take(2) sum; }
    fn longs() I64 { let big: I64 = 5000000000; (big ..< big + 4) sum; }
    fn unsigned() I32 { let u: U32 = 4294967294; (u ... 4294967295) count; }
    fn u64_max() I32 { let u: U64 = 18446744073709551614; (u ... 18446744073709551615) count; }
    fn to_max_bisect() I32 { let hi = 2147483647; (hi - 3 ... hi) bisect |v| { v < hi; }; }
}`, { to_max: 3, wide_take: 3, wide_skip: -1, longs: 20000000006n, unsigned: 2, u64_max: 2, to_max_bisect: 3 }],
  ];
  for (const [source, expected] of selfhostPrograms) {
    const file = await write(source);
    for (const mode of ['debug', 'small', 'fast', 'smallUnsafe', 'fastUnsafe']) {
      const built = await compileFile(utu, file, { mode });
      assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
      const { exports } = await instantiateNode(built.wasm, built.spec);
      for (const [name, value] of Object.entries(expected)) assert.equal(exports[name](), value, `${mode} ${name}`);
      checked++;
    }
  }
  // A trap in a collected pipeline stays when the consumer takes less.
  const trapping = await compileFile(utu, await write(`export lib {
    fn run() I32 { let xs = [1, 0]; let ys = [5]; (xs map |v, i| { ys[i.to_i32()] / v; } collect(I32)) take(1) sum; }
}`));
  await assert.rejects(async () => (await instantiateNode(trapping.wasm, trapping.spec)).exports.run());
  checked++;

  // Mistakes the self-hosted compiler reports, in its words.
  const mistakes = [
    // A generator's body cannot leave its consumer's loop.
    ['fn g() yield I32 { yield 1; break; }\nexport lib { fn run() I32 { let t = 0; for (0 ..< 2) |i| { for (g()) |v| { t += v; }; }; t; } }\n', 'break outside a loop'],
    // Element types the pipeline's values are not (these built invalid Wasm).
    ['export lib { fn run() I32 { [1, 2, 3] chain(["a"]) count; } }\n', 'Expected I32, got Str'],
    ['export lib { fn run() I32 { let w = [1, 2] windows(Str, 1); w.len(); } }\n', 'Expected Str, got I32'],
    ['export lib { fn run() Str { ["a", "b"] sum; } }\n', 'sum needs numbers, not Str'],
    ['export lib { fn run() I32 { [1, 2] bisect |v, i, j| { true; }; } }\n', 'bisect takes 1 name and an optional index'],
    ['mod B {\n    struct &:\n        | x: I32\n    fn &.each |b| () yield I32 { yield b.x; }\n}\nexport lib { fn run() I32 { 0; } }\n', 'A method cannot be a generator'],
    ['export lib { fn run() I32 { (0.5 ..< 2.0) count; } }\n', 'Cannot pipe a range of F64'],
    ['export lib { fn a() I32 { 1; } }\nexport lib { fn b() I32 { 2; } }\n', 'Two export lib'],
    ['export main() I32 { 1; }\nexport main() I32 { 2; }\n', 'Two export main'],
    ['export lib { fn a() I32 { 1; } }\nexport main() I32 { 2; }\n', 'export lib and export main together'],
    // A function of a type without self, called on a value of it.
    ['struct P:\n    | x : I32\nfn P.make() I32 { 1; }\nexport lib { fn run() I32 { P { x: 1 }.make(); } }\n', 'Takes 0, given 1'],
    // An implementation of a protocol for a type that is not there (this trapped).
    ['proto P:\n    | perimeter() F32\ntag enum Shape[P]:\n    | Circle {\n    }\nfn P[Nope].perimeter |self| () F32 { 0.0; }\nfn sum(l: Array[P]) F32 { l[0].perimeter(); }\nexport lib { fn run() I32 { 0; } }\n',
      'Unknown type Nope'],
    // What the parser wanted, spelled by its token kind (once off by the template kinds: "expected '...'").
    ['fn f() I32 {\n    let x = 1\n    x;\n}\n', "Expected ';', got 'x'"],
  ];
  for (const [source, message] of mistakes) {
    const { errors } = await selfhost(await write(source));
    assert.ok(errors?.includes(message), `${source}\n  reported: ${errors}`);
    checked++;
  }
  console.log(`compiler regressions: ${checked} builds as they should be`);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
