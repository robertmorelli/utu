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

  // Control flow the self-hosted compiler once got wrong, the same in every build mode.
  const control = await write(`struct N:
    | next: ?N
    | v: I32
fn pair() .{I32, Str} { let k = 0; defer k = 1; .{2, "bb"}; }
fn triple(c: Bool) .{F64, Str, I32} { let k = 0; defer k = 1; if c { return .{1.5, "x", 3}; }; .{2.5, "yy", 4}; }
export lib {
    // \`continue <state>\` runs the defers it leaves, as break does.
    fn state_defers() I32 {
        let log = 0;
        loop match 0 { 0 => { defer log = log * 10 + 1; continue 1; }, 1 => { defer log = log * 10 + 2; break; }, ~> { break; }, };
        loop match 0 { 0 => { for (0 ..< 3) |i| { defer log = log * 10 + 3; if i == 1 { continue 1; }; }; }, ~> { break; }, };
        log;
    }
    // \`defer a?.b = v;\` runs only when a is there, as in a block.
    fn optional_defer() I32 {
        let b = N { next: null, v: 1 };
        let a = N { next: b, v: 1 };
        { defer a.next?.v = 9; defer b.next?.v = 5; };
        b.v;
    }
    // A name bound to a value that never arrives.
    fn never_let(c: I32) I32 { if c > 0 { let z = return 3; z; } else { 4; }; }
    // Tuples past a defer, dropped whole, and held by one name.
    fn tuples() I32 {
        pair();
        triple(true);
        let .{a, b} = pair();
        let held = triple(false);
        held = if a > 0 { held; } else { triple(true); };
        let .{x, y, z} = held;
        a * 1000 + b.len() * 100 + y.len() * 10 + z + (x * 2.0).to_i32();
    }
    // An inclusive range through the type's largest value ends.
    fn inclusive_max() I32 {
        let c = 0;
        for (2147483645 ... 2147483647) |i| { c += 1; if c > 9 { break; }; };
        let d = 0;
        let hi: I64 = 9223372036854775807;
        for (hi - 1.to_i64() ... hi) |v| { d += 1; if d > 9 { break; }; };
        let e = 0;
        for ((-2).to_u32() ... (-1).to_u32()) |u| { e += 1; if e > 9 { break; }; };
        c * 100 + d * 10 + e;
    }
    // A body that moves its count is not unrolled.
    fn capture_write() I32 { let t = 0; for (0 ..< 8) |i| { t += i; i += 2; }; t; }
}
`);
  const controlWant = { state_defers: 1233, optional_defer: 9, tuples: 2000 + 200 + 20 + 4 + 5, inclusive_max: 322, capture_write: 9 };
  for (const mode of ['small', 'fast', 'smallUnsafe', 'fastUnsafe', 'debug']) {
    const built = await compileFile(utu, control, { mode });
    assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
    const { exports } = await instantiateNode(built.wasm, built.spec);
    for (const [name, value] of Object.entries(controlWant)) assert.equal(exports[name](), value, `${mode}: ${name}`);
    assert.equal(exports.never_let(1), 3, `${mode}: never_let`);
    assert.equal(exports.never_let(0), 4, `${mode}: never_let`);
    checked++;
  }

  // Mistakes the self-hosted compiler reports, in its words.
  const mistakes = [
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
    // `?.` guards a call or an assignment, not a return, an assert, a jump, or a value inside one.
    ...['if c { return a.next?.v; }; -1;', 'assert a.next?.v == 1; 0;', 'let x = 0; x = if a.next?.v == 1 { 5; } else { 6; }; x;',
      'let s = "i"; s = a.next?.s orelse "d"; 0;', 'loop match 0 { 0 => { continue a.next?.v; }, ~> { break; }, }; 0;'].map(body =>
      [`struct N:\n    | next: ?N\n    | v: I32\n    | s: ?Str\nfn f(a: N, c: Bool) I32 { ${body} }\nexport lib { fn run() I32 { 0; } }\n`, '?. only in a statement']),
    // A let of no value (it crashed the compiler).
    ['fn nothing() void {}\nexport main() I32 { let x = nothing(); x; 0; }\n', 'x would hold no value'],
    // A tuple bound to one name is its values, which a closure cannot hold.
    ['fn sw(a: I32, b: I32) .{I32, I32} { .{b, a}; }\nexport main() I32 { let t = sw(3, 4); let f = cl() I32 { let .{a, b} = t; a; }; f(); }\n', 'A closure cannot capture tuple t'],
    // An integer is no variant of an integer enum.
    ['enum(U8) A:\n    | X\n    | Y\nexport main() I32 { match A.X { 0 => 10, 1 => 20, }; }\n', '0 cannot match A'],
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
