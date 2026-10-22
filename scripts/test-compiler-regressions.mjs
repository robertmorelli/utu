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

  // Bounded module parameters (self-hosted only), in every build mode: a
  // struct T, a scalar T (`fn Ord[I32].cmp`), two bounds, and a T that is a
  // generic module's instance (`fn Ord[&].cmp`) passed on by a bounded T.
  const ord = `proto Ord:\n    | cmp(&) I32\nproto Named:\n    | get name : Str\n`
    + `fn Ord[I32].cmp |a| (b: I32) I32 { a - b; }\n`
    + `mod Sorted[T[Ord]] {\n    fn max(a: T, b: T) T { if a.cmp(b) >= 0 { a; } else { b; }; }\n`
    + `    fn sort(xs: Array[T]) void { for (1 ..< xs.len()) |i| { let j = i; while (j > 0 and xs[j - 1].cmp(xs[j]) > 0) { let t = xs[j]; xs[j] = xs[j - 1]; xs[j - 1] = t; j -= 1; }; }; }\n}\n`;
  const bounded = [
    [`${ord}struct P[Ord]:\n    | x: I32\nfn Ord[P].cmp |a| (b: P) I32 { a.x - b.x; }\nexport lib { fn run() I32 { Sorted[P].max(P { x: 4 }, P { x: 9 }).x; } }\n`, 9],
    [`${ord}export lib { fn run() I32 { let xs = [5, 2, 9, 1]; Sorted[I32].sort(xs); xs[0] * 1000 + xs[1] * 100 + xs[2] * 10 + xs[3] + Sorted[I32].max(3, 7); } }\n`, 1266],
    [`${ord}struct P[Ord, Named]:\n    | name: Str\n    | x: I32\nfn Ord[P].cmp |a| (b: P) I32 { a.x - b.x; }\n`
      + `mod Best[T[Ord, Named]] {\n    fn best(a: T, b: T) Str { Sorted[T].max(a, b).name; }\n}\n`
      + `export lib { fn run() Str { Best[P].best(P { name: "a", x: 7 }, P { name: "b", x: 2 }); } }\n`, 'a'],
    [`${ord}mod Box[T[Ord]] {\n    struct &:\n        | v: T\n    fn &.new(v: T) & { &{ v: v }; }\n    fn Ord[&].cmp |a| (b: &) I32 { a.v.cmp(b.v); }\n}\n`
      + `export lib { fn run() I32 { Sorted[Box[I32]].max(Box[I32].new(4), Box[I32].new(8)).v; } }\n`, 8],
  ];
  for (const [source, expected] of bounded) {
    const file = await write(source);
    for (const mode of ['small', 'fast', 'smallUnsafe', 'fastUnsafe', 'debug']) {
      const built = await compileFile(utu, file, { mode });
      assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
      assert.equal((await instantiateNode(built.wasm, built.spec)).exports.run(), expected, `${mode}: ${source.slice(-80)}`);
      checked++;
    }
  }

  // Mistakes the self-hosted compiler reports, in its words.
  const mistakes = [
    // A bound the type argument does not implement, an unbounded call, a bound that is not a protocol.
    [`${ord}struct Q:\n    | x: I32\nexport lib { fn run() I32 { Sorted[Q].max(Q { x: 1 }, Q { x: 2 }).x; } }\n`, "Q does not implement Ord (Sorted's T needs it)"],
    [`${ord}mod Top[T] {\n    fn top(a: T, b: T) T { if a.cmp(b) > 0 { a; } else { b; }; }\n}\nexport lib { fn run() I32 { Top[I32].top(1, 2); } }\n`, 'T has no method cmp; bound it: mod Top[T[Ord]]'],
    [`${ord}mod Top[T] {\n    fn top(a: T, b: T) T { Sorted[T].max(a, b); }\n}\nexport lib { fn run() I32 { Top[I32].top(1, 2); } }\n`, "T does not implement Ord (Sorted's T needs it)"],
    [`struct Q:\n    | x: I32\nmod Top[T[Q]] {\n    fn top(a: T) T { a; }\n}\nexport lib { fn run() I32 { Top[I32].top(1); } }\n`, 'Q is not a protocol; a bound names one'],
    [`${ord}export lib { fn run() I32 { let xs: Array[Ord] = []; xs[0].cmp(xs[1]); } }\n`, 'Ord.cmp uses &, so only a bounded T calls it: mod M[T[Ord]]'],
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
