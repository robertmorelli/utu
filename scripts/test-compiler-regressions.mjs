// Programs that once went wrong, in both compilers: what each builds to, or
// the mistake each reports (where only the self-hosted compiler reports it
// as it should, that is said).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';
import { MODES } from '../src/selfhost/compiler.js';

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

/** How many function types in a module's type section have several results. */
function severalResults(bytes) {
  let i = 8, count = 0;
  const leb = () => { let r = 0, s = 0, b; do { b = bytes[i++]; r += (b & 127) * 2 ** s; s += 7; } while (b & 128); return r; };
  const value = () => { const t = bytes[i++]; if (t === 0x63 || t === 0x64) leb(); };
  const composite = () => {
    const kind = bytes[i++];
    if (kind === 0x60) {
      for (let n = leb(); n > 0; n--) value();
      const results = leb();
      for (let n = results; n > 0; n--) value();
      if (results > 1) count++;
    } else if (kind === 0x5f) {
      for (let n = leb(); n > 0; n--) { value(); i++; }
    } else { value(); i++; }
  };
  const sub = () => {
    if (bytes[i] === 0x50 || bytes[i] === 0x4f) { i++; for (let n = leb(); n > 0; n--) leb(); }
    composite();
  };
  while (i < bytes.length) {
    const id = bytes[i++], size = leb(), end = i + size;
    if (id === 1) {
      for (let n = leb(); n > 0; n--) {
        if (bytes[i] === 0x4e) { i++; for (let m = leb(); m > 0; m--) sub(); } else sub();
      }
      return count;
    }
    i = end;
  }
  return count;
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

  // Structs returned as their fields (selfhost/inline.utu, -O small and
  // fast): every build mode gives what debug gives, and the optimized ones
  // return fields (a function type of several results) where `fields` says.
  const P = 'struct P:\n    | x: I32\n    | y: I32\n\nstruct Box:\n    | p: P\n\n'
    + 'fn same(a: P, b: P) Bool { @ir/\\ <ir-ref-eq><ir-ident name="a"/><ir-ident name="b"/></ir-ref-eq> \\/; }\n\n'
    // Recursive (so it stays a call), several paths, one returning a call.
    + 'fn make(a: I32, n: I32) P {\n    if n > 0 { return make(a + 1, n - 1); };\n    if a > 100 { return &{ x: 100, y: a }; };\n    &{ x: a, y: a * 2 };\n}\n\n';
  const returned = [
    // Read only for its fields; copied and changed through the copy; kept in
    // a box and changed through it; compared by reference; dropped.
    [P + `export lib {
    fn fields() I32 { let p = make(3, 2); let q = make(200, 1); p.x + p.y + q.x + q.y; }
    fn alias() I32 { let p = make(3, 1); let q = p; q.x = 50; let r = make(1, 1); p.x + q.y + r.x + r.y; }
    fn kept() I32 {
        let b = Box { p: P { x: 0, y: 0 } };
        let p = make(5, 1);
        b.p = p;
        b.p.x = 9;
        let r = make(2, 2);
        let s = make(4, 0);
        p.x * 100 + b.p.y + r.x + s.y;
    }
    fn identity() I32 {
        let p = make(1, 1);
        let q = p;
        let r = make(1, 1);
        let s = make(1, 1);
        make(2, 2);
        (if same(p, q) { 1; } else { 0; }) + (if same(p, r) { 10; } else { 0; }) + s.x + s.y;
    }
}
`, { fields: 316, alias: 64, kept: 924, identity: 7 }, true],
    // Escaping: captured, stored in an array, passed on, taken as a value.
    [P + `fn id(p: P) P { p; }
export lib {
    fn escapes() I32 {
        let arr: Array[P] = [make(6, 1), make(7, 0)];
        arr[0].x = 40;
        let c = make(8, 2);
        let read = cl() I32 { c.x + c.y; };
        c.x = 1;
        let d = id(make(2, 0));
        d.y = 5;
        arr[0].x + arr[1].y + read() + d.y + make(9, 1).y;
    }
    fn as_value() I32 { let f: fun(I32, I32) P = make; let p = make(4, 1); f(2, 2).y + p.x; }
}
`, { escapes: 100, as_value: 13 }, false],
    // The callee keeps what it returns: it is returned as itself.
    [P + `fn stash(b: Box, a: I32, n: I32) P {
    if n > 0 { return stash(b, a, n - 1); };
    let p: P = &{ x: a, y: 1 };
    b.p = p;
    p;
}
export lib {
    fn callee_keeps() I32 {
        let b = Box { p: P { x: 0, y: 0 } };
        let r = stash(b, 4, 2);
        b.p.x = 77;
        r.x + if same(r, b.p) { 1000; } else { 0; };
    }
}
`, { callee_keeps: 1077 }, false],
    // Generic structs (a pair, a result), a local made and changed and
    // returned, and alt arms each making one.
    [`mod Pair[T] {
    struct &:
        | a: T
        | b: T
    fn &.of(a: T, b: T) & { &{ a: a, b: b }; }
}
mod Res[T, E] {
    struct &:
        | ok: Bool
        | value: T
        | err: E
    fn &.good(v: T, e: E) & { &{ ok: true, value: v, err: e }; }
    fn &.bad(v: T, e: E) & { &{ ok: false, value: v, err: e }; }
}
tag enum Shape:
    | Dot { at: I32 }
    | Bar { from: I32, to: I32 }
fn divmod(a: I32, b: I32) Pair[I32] {
    if a < b { return Pair[I32].of(0, a); };
    let d = divmod(a - b, b);
    Pair[I32].of(d.a + 1, d.b);
}
fn parse(s: I32, n: I32) Res[I32, Str] {
    if n > 0 { return parse(s, n - 1); };
    if s < 0 { Res[I32, Str].bad(0, "negative"); } else { Res[I32, Str].good(s * 2, ""); };
}
fn built(a: I32, n: I32) Pair[I32] {
    if n > 0 { return built(a, n - 1); };
    let p = Pair[I32].of(a, 0);
    p.b = p.a + 7;
    p;
}
fn span(s: Shape, n: I32) Pair[I32] {
    if n > 0 { return span(s, n - 1); };
    alt s {
        Dot |d| => Pair[I32].of(d.at, d.at),
        Bar |b| => if b.from < b.to { Pair[I32].of(b.from, b.to); } else { Pair[I32].of(b.to, b.from); },
    };
}
export lib {
    fn generic() I32 {
        let t = 0;
        for (0 ..< 50) |i| { let d = divmod(i * 7 + 3, 5); t += d.a * 10 + d.b; };
        t;
    }
    fn result() I32 {
        let g = parse(21, 3);
        let b = parse(-1, 2);
        (if g.ok { g.value; } else { -1; }) + (if b.ok { 1000; } else { b.err.len(); });
    }
    fn local_made() I32 { let p = built(4, 3); p.a * 10 + p.b; }
    fn shapes() I32 {
        let a = span(Dot { at: 4 }, 2);
        let b = span(Bar { from: 9, to: 2 }, 1);
        let c = span(Bar { from: 1, to: 5 }, 0);
        a.a + a.b * 10 + b.a * 100 + b.b * 1000 + c.a * 10000 + c.b * 100000;
    }
}
`, { generic: 17350, result: 50, local_made: 51, shapes: 519244 }, true],
  ];
  for (const [source, expected, fields] of returned) {
    const file = await write(source);
    for (const [mode, options] of Object.entries(MODES)) {
      const built = await compileFile(utu, file, options);
      assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
      const { exports } = await instantiateNode(built.wasm, built.spec);
      for (const [name, value] of Object.entries(expected)) assert.equal(exports[name](), value, `${mode}: ${name}`);
      if (fields || mode === 'debug') assert.equal(severalResults(built.wasm) > 0, mode !== 'debug', `${mode}: fields returned in ${Object.keys(expected)}`);
      checked++;
    }
  }

  // `await` through closures: utu calls a closure's body by call_ref, so the
  // stack suspends through it (once "trying to suspend without
  // WebAssembly.promising"). In every mode; a closure stays the JS function
  // the host sees, and a JS function still calls as a closure.
  const awaiting = await write(`let delay: fun(I32, I32) Promise[I32] = @es/\\ (v, ms) => new Promise(r => setTimeout(() => r(v), ms)) \\/;
let same: fun(cl(I32) I32, cl(I32) I32) Bool = @es/\\ (a, b) => a === b \\/;
let js_double: fun() cl(I32) I32 = @es/\\ () => (x) => x * 2 \\/;
let js_call: fun(cl(I32) I32, I32) I32 = @es/\\ (f, x) => f(x) \\/;
struct Box:
    | f: cl(I32) I32
fn slow(n: I32) I32 { await delay(n, 1) + 1; }
fn apply(f: cl(I32) I32, x: I32) I32 { f(x); }
fn ticks(n: I32) yield I32 { for (0 ..< n) |i| { yield await delay(i, 1); }; }
export lib {
    fn through() I32 { apply(cl(n) { slow(n); }, 41); }
    fn nested() I32 {
        let k = 10;
        let outer = cl(n: I32) I32 { let inner = cl(m: I32) I32 { await delay(m + k, 1); }; inner(n) + await delay(1, 1); };
        outer(5);
    }
    fn stored() I32 {
        let b = Box { f: cl(n) { await delay(n * 3, 1); } };
        let fs = [cl(n: I32) I32 { slow(n); }, cl(n: I32) I32 { n; }];
        b.f(7) * 100 + fs[0](1) + fs[1](2);
    }
    fn generator() I32 { let total = cl() I32 { let t = 0; for (ticks(4)) |v| { t += v; }; t; }; total(); }
    fn pipeline() I32 {
        let piped = cl(xs: Array[I32]) I32 { xs filter |x| { await delay(x, 1) > 1; } fold(0) |s, x| { s + await delay(x, 1); }; };
        piped([1, 2, 3]);
    }
    fn identity() I32 { let f = cl(n: I32) I32 { n + 1; }; if same(f, f) { js_call(f, 1); } else { 0; }; }
    fn js_function() I32 { apply(js_double(), 21); }
    fn calls() I32 {
        let k = 3;
        let s = 0;
        for (0 ..< 2000000) |i| { s = s + apply(cl(n) { n * k; }, i) % 7; };
        s;
    }
}
`);
  const awaited = { through: 42, nested: 16, stored: 2104, generator: 6, pipeline: 5, identity: 2, js_function: 42, calls: 5999997 };
  for (const [mode, options] of Object.entries(MODES)) {
    const built = await compileFile(utu, awaiting, options);
    assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
    const { exports } = await instantiateNode(built.wasm, built.spec);
    for (const [name, value] of Object.entries(awaited)) assert.equal(await exports[name](), value, `${mode}: ${name}`);
    checked++;
  }

  // Literals read as 64 unsigned bits and rounded once, in every mode: into
  // a float, an F32 (once rounded through F64), a mem, an enum, a @comptime
  // U32 mem (once sign-extended). Stage 0 reads several of these wrong.
  const literalSource = `const mem zero: F64 = [-0.0];
const mem ones: U32 = @comptime/\\ ones_list() \\/;
fn ones_list() Array[U32] { let a: U32 = 4294967295; [a]; }
enum(U32) Big:
    | A = 3000000000
export lib {
    fn big() F64 { let a: F64 = 10000000000000000000; a; }
    fn below() F64 { let a: F64 = -18446744073709551615; a; }
    fn near() F64 { let a: F32 = 1.000000059604644775390625001; a.to_f64(); }
    fn wide() F64 { let a: F32 = 1152921573326323713; a.to_f64(); }
    fn tie() F64 { let a: F32 = 1.000000178813934326171875; a.to_f64(); }
    fn negzero() F64 { 1.0 / zero[0]; }
    fn all_ones() F64 { ones[0].to_f64(); }
    fn variant() I32 { Big.A.to_i32(); }
}
`;
  const literalFile = await write(literalSource);
  for (const mode of ['small', 'fast', 'smallUnsafe', 'fastUnsafe', 'debug']) {
    const built = await compileFile(utu, literalFile, { mode });
    assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
    const { exports } = await instantiateNode(built.wasm, built.spec);
    const want = { big: 1e19, below: -18446744073709551615, near: 1.0000001192092896, wide: 2 ** 60 + 2 ** 37,
      tie: 1 + 2 ** -22, negzero: -Infinity, all_ones: 4294967295, variant: 3000000000 | 0 };
    for (const [name, value] of Object.entries(want)) assert.equal(exports[name](), value, `${mode}: ${name}`);
    checked++;
  }

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

  // Programs only the self-hosted compiler builds as it should, in every
  // build mode: what `run` returns.
  const modes = ['debug', 'small', 'fast', 'smallUnsafe', 'fastUnsafe'];
  const everyMode = [
    // An alt arm whose value is a bare name (it was read as the arm's binding).
    ['enum E:\n    | Ka {}\n    | Kc {}\nfn f(p: E, q: I32) I32 { alt p { Ka => 1, Kc => q, }; }\nexport lib { fn run() I32 { f(Kc {}, 5); } }\n', 5],
    // A parameter assigned after an alt tested it: the inner test still runs.
    ['enum Shape:\n    | Circle {}\n    | Sq {}\nfn f(sh: Shape) I32 { alt sh { Circle => { sh = Sq {}; alt sh { Circle |c| => 1, Sq |s| => 2, }; }, Sq => 0, }; }\nexport lib { fn run() I32 { let fp: fun(Shape) I32 = f; fp(Circle {}); } }\n', 2],
    // Closures see writes to captured for, alt, and promote bindings, and their own.
    ['enum E:\n    | A { n: I32 }\n    | B {}\nexport lib { fn run() I32 {\n    let t = 0;\n    for ([1, 2]) |x| { let f = cl() { x += 10; }; f(); t += x; };\n    for (0 ..< 5) |i| { let g = cl() I32 { i; }; i = i + 1; t += g() * 100; };\n    let e: E = A { n: 3 };\n    t += alt e { A |a| => { let h = cl() { a = A { n: 9 }; }; h(); a.n * 1000; }, B => 0, };\n    let s: ?Str = "hi";\n    promote s { |v| => { let h = cl() { v = v + "!"; }; h(); t += v.len() * 100000; }, ~> {}, };\n    let c = 0;\n    let inc = cl() { c += 1; };\n    inc(); inc();\n    t + c * 10000;\n} }\n', 23 + 900 + 9000 + 20000 + 300000],
    // A write in a loop match, after the closure.
    ['export lib { fn run() I32 { let n = 10; let f = cl() I32 { n; }; let k = 0; loop match k { 0 => { n = 30; continue 1; }, ~> break, }; f(); } }\n', 30],
    // A recursive closure assigned with `=`.
    ['export lib { fn run() I32 { let fact: cl(I32) I32 = cl(x) { 0; }; fact = cl(x) { if x <= 1 { 1; } else { x * fact(x - 1); }; }; fact(5); } }\n', 120],
    // A generator's parameter, captured, then assigned.
    ['fn g(a: I32) yield I32 { let c: cl(I32) I32 = cl(x) { x + a; }; a = 5; yield c(1); }\nexport lib { fn run() I32 { let t = 0; for (g(1)) |v| { t += v; }; t; } }\n', 6],
    // A name from a tuple, captured, then assigned.
    ['fn two() .{I32, I32} { .{1, 2}; }\nexport lib { fn run() I32 { let .{a, b} = two(); let c: cl() I32 = cl() { a + b; }; a = 10; c(); } }\n', 12],
    // Operators declared on a distinct type.
    ['type Id = distinct I32;\nfn Id:eq |a, b| Bool { false; }\nfn Id:add |a, b| Id { Id.from_i32(a.to_i32() + b.to_i32() + 100); }\nexport lib { fn run() I32 { let a = Id.from_i32(3); (a + a).to_i32() + (if a == a { 1000; } else { 0; }); } }\n', 106],
    // `op=` on a protocol member.
    ['proto Sh:\n    | get set k: I32\nstruct Sq[Sh]:\n    | k: I32\nexport lib { fn run() I32 { let s: Sh = Sq { k: 3 }; s.k += 4; s.k; } }\n', 7],
    // Struct literal fields run in the order written.
    ['struct P:\n    | a: I32\n    | b: I32\n    | c: I32\nexport lib { fn run() I32 { let n = 0; let p = P { b: { n += 1; n * 10; }, c: 7, a: { n += 1; n; } }; p.a * 1000 + p.b * 10 + p.c; } }\n', 2107],
    // A generic module's own name, with its arguments, inside it.
    ['mod m[T] {\n    struct &:\n        | v: T\n        | next: ?m[T]\n    fn &.mk(v: T) m[T] { &{ v: v, next: null }; }\n}\nexport lib { fn run() I32 { let a = m[I32].mk(3); a.next = m[I32].mk(4); let n = a.next orelse fatal; a.v + n.v; } }\n', 7],
    // Labeled blocks: `break name v` leaves nested loops with a value; the
    // block's defers run; the type comes from the tail, else the breaks.
    ['fn find(xs: Array[I32], want: I32) I32 {\n    found: {\n        for (0 ..< xs.len()) |i| { for (0 ..< 3) |j| { if xs[i] + j == want { break found i * 10 + j; }; }; };\n        -1;\n    };\n}\n'
      + 'fn early() I32 { let n = 0; out_: { defer n += 100; n += 1; if n > 0 { break out_; }; n += 1000; }; n; }\n'
      + 'export lib { fn run() I32 {\n    let a = blk: { 3; };\n    let b: I64 = big: { break big 7; };\n    let c = word: { if a > 2 { break word "yes"; }; "no"; };\n    let d = done: { for ([3, 5, 8]) |x| { if x % 2 == 0 { break done x; }; }; break done 0; };\n'
      + '    find([5, 9, 12], 13) + a * 100 + b.to_i32() * 1000 + c.len() * 10000 + d * 100000 + early() * 1000000;\n} }\n', 21 + 300 + 7000 + 30000 + 800000 + 101000000],
    // A module's and a type's functions as values (`m.f`, `T.f`, an alias's).
    ['mod m { fn twice(x: I32) I32 { x * 2; } }\nmod Box[T] {\n    struct &:\n        | v: T\n    fn &.make(v: T) & { &{ v: v }; }\n    fn &.get |b| () T { b.v; }\n    fn wrap(v: T) & { &{ v: v }; }\n}\nusing Box[I32] |ints|;\n'
      + 'struct P:\n    | x: I32\nfn P.make(x: I32) P { P { x: x }; }\nfn P.get |self| () I32 { self.x; }\nfn apply(f: fun(I32) I32, x: I32) I32 { f(x); }\nfn apply_cl(f: cl(I32) I32, x: I32) I32 { f(x); }\n'
      + 'export lib { fn run() I32 { let g = m.twice; let mk = P.make; let get = P.get; let w = ints.wrap; let bm = ints.make;\n    g(1) + apply(m.twice, 10) + apply_cl(m.twice, 100) + get(mk(1000)) + w(10000).get() + bm(100000).get(); } }\n', 111222],
    // Compound assignment on host fields and indexes: the object and index once each.
    ['using JS from std:JS;\nexport lib { fn run() I32 {\n    let a = new JS.Int32Array(4);\n    a[1] = 5;\n    a[1] += 3;\n    a[1] *= 2;\n    let b = new JS.Array();\n    b.length += 2;\n    b.length *= 3;\n    a[1].to_i32() * 100 + b.length.to_i32();\n} }\n', 1606],
    // Computed globals: each set after the globals it reads (directly or
    // through a function); structs, arrays, strings, nullables, and funs.
    ['struct Pt:\n    | x: I32\n    | y: I32\nfn compute() I32 { 3 * 7; }\nfn twice_base() I32 { base * 2; }\nfn twice(x: I32) I32 { x * 2; }\n'
      + 'let doubled: I32 = twice_base();\nlet base: I32 = compute();\nlet origin: Pt = Pt { x: base, y: 2 };\nlet squares: Array[I32] = [1, 4, 9, 16];\nlet name: Str = "utu " + base.to_str();\nlet maybe: ?Pt = null;\nlet total: I64 = squares.len().to_i64() * 1000.to_i64();\nlet pick: fun(I32) I32 = twice;\n'
      + 'export lib { fn run() I32 { let n = if maybe == null { 1; } else { 0; }; doubled + origin.x * 100 + squares[3] * 10000 + total.to_i32() * 1000 + n * 100000000 + pick(name.len()) * 1000000; } }\n', 42 + 2100 + 160000 + 4000000 + 100000000 + 12000000],
    // Generators through a module, an alias, a type, and a method (`x.each()`).
    ['mod seq { fn squares(n: I32) yield I32 { for (0 ..< n) |i| { yield i * i; }; } }\nmod Stack[T] {\n    struct &:\n        | items: Array[T]\n        | size: I32\n    fn &.new(fill: T) & { &{ items: Array[T].new(16, fill), size: 0 }; }\n    fn &.push |s| (v: T) void { s.items[s.size] = v; s.size += 1; }\n'
      + '    fn &.each |s| () yield T { let i = s.size - 1; while (i >= 0) { yield s.items[i]; i -= 1; }; }\n    fn &.upto(n: I32) yield I32 { for (0 ..< n) |i| { yield i; }; }\n}\nusing seq |s|;\nstruct Range:\n    | lo: I32\n    | hi: I32\n'
      + 'fn Range.each |r| () yield I32 { for (r.lo ..< r.hi) |i| { yield i; }; }\nfn Range.below(n: I32) yield I32 { for (0 ..< n) |i| { yield i; }; }\n'
      + 'export lib { fn run() I32 {\n    let total = 0;\n    for (seq.squares(4)) |v| { total += v; };\n    for (s.squares(3)) |v| { total += v * 100; };\n    let st = Stack[I32].new(0);\n    st.push(1);\n    st.push(2);\n    st.push(3);\n    let order = 0;\n    for (st.each()) |v| { order = order * 10 + v; };\n'
      + '    for (Stack[I32].upto(3)) |v| { total += v * 1000; };\n    for (Range { lo: 2, hi: 5 }.each()) |v| { total += v * 10000; };\n    for (Range.below(3)) |v| { total += v * 100000; };\n    total + order * 1000000;\n} }\n', 321393514],
  ];
  for (const [source, value] of everyMode) {
    const file = await write(source);
    for (const mode of modes) {
      const built = await compileFile(utu, file, { mode });
      assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}\n${source}`);
      assert.equal((await instantiateNode(built.wasm, built.spec)).exports.run(), value, `${mode}: ${source}`);
      checked++;
    }
  }

  // A mem resized below zero traps, where the build checks.
  const resized = await write('mem m: I32;\nexport lib { fn run() I32 { m.push(1); m.resize(-1); m.len(); } }\n');
  for (const mode of ['debug', 'small', 'fast']) {
    const built = await compileFile(utu, resized, { mode });
    const { exports } = await instantiateNode(built.wasm, built.spec);
    assert.throws(() => exports.run(), `${mode}: resize(-1)`);
    checked++;
  }

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

  // Values at the JavaScript boundary, and @json, in the self-hosted compiler,
  // in every build mode: what each export returns.
  const boundary = [
    // Results as JS has them: Bool true/false, U32 and U64 unsigned.
    ['export lib { fn u() U32 { 4000000000; } fn w() U64 { 18446744073709551615; } fn yes() Bool { true; } }',
      { u: 4000000000, w: 18446744073709551615n, yes: true }],
    // @es arguments and results convert; undefined is absent.
    [`let none: fun() ?Str = @es/\\ () => undefined \\/;
let two: fun() Bool = @es/\\ () => 2 \\/;
let show: fun(Bool, U32, U64) Str = @es/\\ (b, u, w) => typeof b + " " + u + " " + w \\/;
export lib {
    fn absent() Bool { promote none() { |v| => false, ~> true, }; }
    fn bool() Bool { two() == true; }
    fn shown() Str { show(true, 4000000000, 18446744073709551615); }
}`, { absent: true, bool: true, shown: 'boolean 4000000000 18446744073709551615' }],
    // A dynamic value into ?Str: undefined is absent, a number a TypeError; orelse and promote take it.
    [`using JS from std:JS;
export lib {
    fn missing() Bool { let m = new JS.Map(); let h: ?Str = m.get("nope"); h == null; }
    fn wrong() Str { try { let x: ?Str = JS.JSON.parse("5"); "accepted"; } catch |e| { "caught"; }; }
    fn fallback() Str { let m = new JS.Map(); let s: Str = m.get("nope") orelse "d"; s; }
    fn code() F64 { "x".codePointAt(5.0) orelse -1.0; }
    fn chars() Str { JS.Array.from("abc").join("-"); }
}`, { missing: true, wrong: 'caught', fallback: 'd', code: -1, chars: 'a-b-c' }],
    // @json: depth, -0, escaped and exponent literals, required objects, int enums, lone surrogates, error places.
    [`enum(U8) Level:
    | Low
    | High
struct L:
    | l: Level
struct N:
    | next: ?N
struct Z:
    | x: F64
fn deep() Str { let a = ""; let b = ""; for (0 ..< 20000) |i| { a = a + "{\\"next\\":"; b = b + "}"; }; a + b; }
export lib {
    fn depth() Str { @json/\\ error N deep() \\/; }
    fn negzero() F64 { let z = @json/\\ decode Z "{\\"x\\":-0}" \\/ orelse fatal; 1.0 / z.x; }
    fn literal(text: Str) Str {
        @json/\\ match text {
            { a: "q\\"t" } => "quote",
            { "q\\"k": |v| I32 } => "key",
            { b: 1e5 } => "exp",
            { plan: { tier: |t| ?Str } } => "plan",
            { d: |d| Str = \`x,y\` } => d,
            ~> |e| e,
        }\\/;
    }
    fn level() Str { @json/\\ encode L L { l: Level.High } \\/; }
    fn lone() Str { @json/\\ encode Array[Str] [Str.from_code_point(55296)] \\/; }
    fn range() Str { @json/\\ error L "{\\"l\\":\\"Mid\\"}" \\/; }
}`, { depth: 'nested too deeply at line 1, column 4098', negzero: -Infinity, level: '{"l":"High"}', lone: '["\\ud800"]', range: 'unknown Level variant at line 1, column 6' },
      { literal: [['{"a":"q\\"t"}', 'quote'], ['{"q\\"k":1}', 'key'], ['{"b":100000}', 'exp'], ['{"plan":{}}', 'plan'], ['{}', 'x,y']] }],
  ];
  for (const [source, expected, calls = {}] of boundary) {
    const file = await write(source);
    for (const mode of ['small', 'fast', 'smallUnsafe', 'fastUnsafe', 'debug']) {
      const built = await compileFile(utu, file, { mode });
      assert.ok(built.wasm, `${mode}: ${built.diagnostics.map(d => d.message).join('\n')}`);
      const { exports } = await instantiateNode(built.wasm, built.spec);
      for (const [name, value] of Object.entries(expected)) assert.equal(exports[name](), value, `${mode} ${name}: ${source.slice(0, 60)}`);
      for (const [name, pairs] of Object.entries(calls)) {
        for (const [arg, value] of pairs) assert.equal(exports[name](arg), value, `${mode} ${name}(${arg})`);
      }
      checked++;
    }
  }

  // Benches: a bench build exports `__bench_k(n)`, its setup once and its
  // measured block n times; a test build checks them.
  const benchFile = await write('let calls: Array[I32] = [0];\nexport lib { fn count() I32 { calls[0]; } }\nbench "adds" {\n    let k = 2;\n    measure { calls[0] += k; }\n}\nbench "nothing" {\n    measure {}\n}\n');
  for (const mode of modes) {
    const benched = await compileFile(utu, benchFile, { target: 'bench', mode });
    assert.deepEqual(benched.benches, [{ export: '__bench_0', name: 'adds' }, { export: '__bench_1', name: 'nothing' }], `${mode}: ${benched.diagnostics?.map(d => d.message)}`);
    const { exports } = await instantiateNode(benched.wasm, benched.spec);
    exports.__bench_0(5);
    exports.__bench_0(0);
    exports.__bench_1(3);
    checked++;
  }
  const badBench = await compileFile(utu, await write('export main() I32 { 0; }\nbench "sum" {\n    measure { let s: I32 = "x"; }\n}\n'), { target: 'test' });
  assert.deepEqual(badBench.diagnostics.map(d => d.message), ['s is I32, got Str']);
  checked++;

  // Test names with utu escapes that JSON lacks.
  const named = await compileFile(utu, await write('export main() void {}\ntest "it\\\'s \\$5\tok" { assert 1 == 1; }\n'), { target: 'test' });
  assert.deepEqual(named.tests.map(t => t.name), ["it's $5\tok"]);
  checked++;

  // Text that is not UTF-8 (a byte no text can hold), and CRLF line ends,
  // which are LF in multiline and template strings.
  const bad = path.join(dir, 'not_utf8.utu');
  await fs.writeFile(bad, Buffer.concat([Buffer.from('export main() I32 {\n    let s = \\\\a'), Buffer.from([0xc0, 0xaf]), Buffer.from('b\n    ;\n    s.len();\n}\n')]));
  assert.deepEqual((await selfhost(bad)).errors, ['Not UTF-8']);
  checked++;
  const crlf = await selfhost(await write('export lib {\r\n    fn m() Str { let m = \\\\a\r\n        \\\\b\r\n    ; m; }\r\n    fn t() Str { `a\r\nb`; }\r\n}\r\n'));
  assert.equal(crlf.exports?.m(), 'a\nb', crlf.errors?.join('\n'));
  assert.equal(crlf.exports.t(), 'a\nb');
  checked++;

  // Mistakes the self-hosted compiler reports, in its words.
  const mistakes = [
    // A bound the type argument does not implement, an unbounded call, a bound that is not a protocol.
    [`${ord}struct Q:\n    | x: I32\nexport lib { fn run() I32 { Sorted[Q].max(Q { x: 1 }, Q { x: 2 }).x; } }\n`, "Q does not implement Ord (Sorted's T needs it)"],
    [`${ord}mod Top[T] {\n    fn top(a: T, b: T) T { if a.cmp(b) > 0 { a; } else { b; }; }\n}\nexport lib { fn run() I32 { Top[I32].top(1, 2); } }\n`, 'T has no method cmp; bound it: mod Top[T[Ord]]'],
    [`${ord}mod Top[T] {\n    fn top(a: T, b: T) T { Sorted[T].max(a, b); }\n}\nexport lib { fn run() I32 { Top[I32].top(1, 2); } }\n`, "T does not implement Ord (Sorted's T needs it)"],
    [`struct Q:\n    | x: I32\nmod Top[T[Q]] {\n    fn top(a: T) T { a; }\n}\nexport lib { fn run() I32 { Top[I32].top(1); } }\n`, 'Q is not a protocol; a bound names one'],
    [`${ord}export lib { fn run() I32 { let xs: Array[Ord] = []; xs[0].cmp(xs[1]); } }\n`, 'Ord.cmp uses &, so only a bounded T calls it: mod M[T[Ord]]'],
    // A generator's body cannot leave its consumer's loop.
    ['fn g() yield I32 { yield 1; break; }\nexport lib { fn run() I32 { let t = 0; for (0 ..< 2) |i| { for (g()) |v| { t += v; }; }; t; } }\n', 'break outside a loop'],
    // Element types the pipeline's values are not (these built invalid Wasm).
    ['export lib { fn run() I32 { [1, 2, 3] chain(["a"]) count; } }\n', 'Elements are I32, got Str'],
    ['export lib { fn run() I32 { let w = [1, 2] windows(Str, 1); w.len(); } }\n', 'Expected Str, got I32'],
    ['export lib { fn run() Str { ["a", "b"] sum; } }\n', 'sum needs numbers, not Str'],
    ['export lib { fn run() I32 { [1, 2] bisect |v, i, j| { true; }; } }\n', 'bisect takes 1 name and an optional index'],
    ['mod B {\n    struct &:\n        | x: I32\n    fn &.new() & { &{ x: 1 }; }\n    fn &.each |b| () yield I32 { yield b.x; }\n}\nexport lib { fn run() I32 { B.new().each(); 0; } }\n', 'each is a generator: for (each(…)) |v| { … }'],
    ['mod seq { fn squares(n: I32) yield I32 { yield n; } }\nexport lib { fn run() I32 { let f = seq.squares; 0; } }\n', 'squares is a generator: for (squares(…)) |v| { … }'],
    ['export lib {\n    fn squares(n: I32) yield I32 { yield n; }\n}\n', 'squares is a generator: it expands into each for that reads it, so it cannot be exported'],
    // Labeled blocks.
    ['export lib { fn run() I32 { outer: { break nowhere 1; 2; }; } }\n', 'No block labeled nowhere around this break'],
    ['export lib { fn run() I32 { outer: { let f = cl() I32 { break outer 1; }; f(); }; } }\n', 'No block labeled outer around this break'],
    ['export lib { fn run() I32 { let b: I32 = outer: { break outer "x"; }; b; } }\n', 'Expected I32, got Str'],
    ['export lib { fn run() I32 { outer: { defer { break outer; }; }; 0; } }\n', 'break in defer'],
    // Computed globals that need each other.
    ['fn get_b() I32 { b + 1; }\nlet a: I32 = get_b();\nlet b: I32 = a * 2;\nexport lib { fn run() I32 { a; } }\n', 'Globals b and a each need the other set first'],
    ['let c: I32 = c + 1;\nexport lib { fn run() I32 { c; } }\n', 'Global c is read while it is being set'],
    ['let d: cl() I32 = cl() I32 { e; };\nlet e: I32 = d();\nexport lib { fn run() I32 { e; } }\n', 'Globals e and d each need the other set first'],
    // Names that are not values, and other plain mistakes (once "Not supported yet").
    ['mod m { fn f() I32 { 1; } }\nexport lib { fn run() I32 { let x = m; 0; } }\n', 'm is a module, not a value'],
    ['mod m {\n    struct P:\n        | x: I32\n}\nexport lib { fn run() I32 { m.P(1); 0; } }\n', 'P is a type, not a value'],
    ['struct P:\n    | x: I32\nexport lib { fn run() I32 { let v = P.x; 0; } }\n', 'x is a field: read it from a value'],
    ['mod m { let k: I32 = 3; }\nexport lib { fn run() I32 { m.k(1); } }\n', 'I32 is not callable'],
    ['enum(U8) E:\n    | A\n    | B\nexport lib { fn run() I32 { let e = E { x: 1 }; 0; } }\n', 'E is not a struct: it has no fields to set'],
    ['struct P:\n    | x: I32\nfn mk() P { P { x: 1 }; }\nexport lib { fn run() I32 { let p = new mk(); 0; } }\n', 'new makes host objects; mk is not a host class'],
    ['fn sq(a: I32) I32 {\n    @ir/\\ <ir-i32-mull><ir-ident name="a"/><ir-ident name="a"/></ir-i32-mull> \\/;\n}\nexport lib { fn run() I32 { sq(7); } }\n', 'No @ir element <ir-i32-mull>'],
    ['fn sq(a: I32) I32 {\n    @ir/\\ <ir-i32-mul><ir-ident name="b"/><ir-ident name="a"/></ir-i32-mul> \\/;\n}\nexport lib { fn run() I32 { sq(7); } }\n', '@ir names no parameter b'],
    ['using JS from std:JS;\nexport lib { fn run() I32 { let f = cl(x) { x; }; 0; } }\n', 'x needs a type'],
    ['export lib { fn run() I32 { (0.5 ..< 2.0) count; } }\n', 'Cannot pipe a range of F64'],
    // Only Externref holds any host value: not Str.
    ['using JS from std:JS;\nexport main() I32 { let s: Str = new JS.Map(); s.len(); }\n', 's is Str, got JS.Map<any, any>'],
    ['fn take(s: Str) I32 { s.len(); }\nexport main() I32 { take(cl() void {}); }\n', 'take takes Str, got cl() void'],
    ['using JS from std:JS;\nexport main() Str { "hello".replace("l", cl(m) Str { m; }); }\n', 'replace takes Str, got cl(unknown) Str'],
    // A bare /\\ in a body nests.
    ['let f: fun(Str) I32 = @es/\\ (s) => s.split(/\\s\\//).length \\/;\nexport main() I32 { f("a"); }\n', 'This /\\ opens a nested body, so the body ends at a later \\/'],
    ['let f: fun(Str) Str = @es/\\ (s) => s.replace(/\\//g, "-") \\/;\nexport main() I32 { 0; }\n', 'No \\/ ends this body: the /\\ at line 1 opens another'],
    ['export lib { fn a() I32 { 1; } }\nexport lib { fn b() I32 { 2; } }\n', 'Two export lib'],
    ['export main() I32 { 1; }\nexport main() I32 { 2; }\n', 'Two export main'],
    ['export lib { fn a() I32 { 1; } }\nexport main() I32 { 2; }\n', 'export lib and export main together'],
    // A function of a type without self, called on a value of it.
    ['struct P:\n    | x : I32\nfn P.make() I32 { 1; }\nexport lib { fn run() I32 { P { x: 1 }.make(); } }\n', 'Takes 0, given 1'],
    // An implementation of a protocol for a type that is not there (this trapped).
    ['proto P:\n    | perimeter() F32\ntag enum Shape[P]:\n    | Circle {\n    }\nfn P[Nope].perimeter |self| () F32 { 0.0; }\nfn sum(l: Array[P]) F32 { l[0].perimeter(); }\nexport lib { fn run() I32 { 0; } }\n',
      'Unknown type Nope'],
    // What the parser wanted, spelled by its token kind (once off by the template kinds: "expected '...'").
    // Literals past their type, once wrapped as they were read.
    ['export lib { fn run() I32 { let a = 18446744073709551615; a; } }\n', '18446744073709551615 does not fit I32'],
    ['export lib { fn run() I32 { let a: I32 = -18446744073709551615; a; } }\n', '-18446744073709551615 does not fit I32'],
    ['export lib { fn run() I64 { let a: I64 = -9223372036854775809; a; } }\n', '-9223372036854775809 does not fit I64'],
    ['export lib { fn run() U64 { let a: U64 = -5; a; } }\n', '-5 does not fit U64'],
    ['export lib { fn run() I32 { let m: M64 = -1; 0; } }\n', '-1 does not fit M64'],
    ['export lib { fn run() F32 { let a: F32 = 1.0e39; a; } }\n', '1.0e39 does not fit F32'],
    ['let g: I32 = 0xffffffffffffffff;\nexport lib { fn run() I32 { g; } }\n', '0xffffffffffffffff does not fit I32'],
    ['fn s(x: I64) I32 { match x { 18446744073709551615 => 1, ~> 2, }; }\nexport lib { fn run() I32 { s(0); } }\n', '18446744073709551615 is out of range for I64'],
    ['const mem t: I32 = [~5, 3];\nexport lib { fn run() I32 { t[0]; } }\n', 'mem t: numbers only'],
    ['const mem t: I32 = [not 5];\nexport lib { fn run() I32 { t[0]; } }\n', 'mem t: numbers only'],
    ['const mem t: I32 = [4294967296];\nexport lib { fn run() I32 { t[0]; } }\n', '4294967296 does not fit I32'],
    // Integer enums: counted in 64 bits, over an integer of at most 32.
    ['enum(I32) E:\n    | A = 2147483647\n    | B\nexport lib { fn run() I32 { E.A.to_i32(); } }\n', '2147483648 does not fit I32'],
    ['enum(I32) E:\n    | A = 4294967296\nexport lib { fn run() I32 { E.A.to_i32(); } }\n', '4294967296 does not fit I32'],
    ['enum(U32) E:\n    | A = 4294967295\n    | B\nexport lib { fn run() I32 { E.A.to_i32(); } }\n', '4294967296 does not fit U32'],
    ['enum(I64) E:\n    | A = 5000000000\nexport lib { fn run() I32 { 0; } }\n', 'enum(I64) is not an integer enum; use U8, I8, U16, I16, I32, or U32'],
    ['enum(Str) E:\n    | A\nexport lib { fn run() I32 { 0; } }\n', 'enum(Str) is not an integer enum; use U8, I8, U16, I16, I32, or U32'],
    ['enum L:\n    | A = 3\n    | B {}\nexport lib { fn run() I32 { 0; } }\n', "L.A has a value; only an integer enum's variants do"],
    ['type Id = distinct U32;\nexport lib { fn run() I32 { let i = Id.from_i32(5); 0; } }\n', 'No method Id.from_i32'],
    // Arrays new_default cannot fill: their elements are never null.
    ['export lib { fn run() I32 { Array[Str].new_default(2).len(); } }\n', 'Str has no default: Array[Str].new(n, fill)'],
    ['export lib { fn run() I32 { Array[cl() I32].new_default(2).len(); } }\n', 'cl() I32 has no default: Array[cl() I32].new(n, fill)'],
    ['proto Sh:\n    | area() I32\nexport lib { fn run() I32 { Array[Sh].new_default(2).len(); } }\n', 'Sh has no default: Array[Sh].new(n, fill)'],
    // Scalars that cannot be null, also once a generic is instantiated.
    ['type Id = distinct I32;\nexport lib { fn run() I32 { let x: ?Id = null; 0; } }\n', 'Id cannot be nullable'],
    ['enum(I32) L:\n    | A\n    | B\nexport lib { fn run() I32 { let x: ?L = null; 0; } }\n', 'L cannot be nullable'],
    ['mod Box[T] {\n    struct &:\n        | v: ?T\n    fn &.empty() & { &{ v: null }; }\n}\nexport lib { fn run() I32 { let b = Box[I32].empty(); 0; } }\n', 'I32 cannot be nullable'],
    // A generic type listing a protocol (this crashed the compiler).
    ['proto Sh:\n    | name() I32\nmod Box[T] {\n    struct &[Sh]:\n        | v: T\n}\nfn Sh[Box[I32]].name |b| () I32 { 1; }\nexport lib { fn run() I32 { 0; } }\n', 'A generic type cannot list protocol Sh'],
    // A closure naming itself with no type to go by.
    ['export lib { fn run() I32 { let f = cl() { f; }; f(); 1; } }\n', 'f needs a type annotation to call itself'],
    // Protocol get and set.
    ['proto Sh:\n    | get size: I32\nstruct Sq[Sh]:\n    | size: I32\nexport lib { fn run() I32 { let s: Sh = Sq { size: 2 }; s.size = 5; 0; } }\n', 'Sh.size is get-only'],
    ['proto Sh:\n    | set size: I32\nstruct Sq[Sh]:\n    | size: I32\nexport lib { fn run() I32 { let s: Sh = Sq { size: 2 }; s.size; } }\n', 'Sh.size is set-only'],
    // Two things `p.f()` could call.
    ['struct P:\n    | f: cl() I32\nfn P.f |p| () I32 { 2; }\nexport lib { fn run() I32 { 0; } }\n', 'P.f is both a field and a method'],
    ['proto Sh:\n    | area() I32\nfn Sh.area |x| () I32 { 0; }\nexport lib { fn run() I32 { 0; } }\n', 'Sh.area is already a protocol member'],
    ['enum Color:\n    | R\n    | G\nexport lib { fn run() I32 { let c = Color.R; 0; } }\n', 'Color.R is a type, not a value'],
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
    // Two opened modules with one name: neither is meant (this said "Unknown variable v").
    ['mod a { fn v() I32 { 1; } }\nmod b { fn v() I32 { 2; } }\nusing a;\nusing b;\nexport main() I32 { v(); }\n', 'v is ambiguous: a.v or b.v'],
    // A declaration named like a prelude module (the prelude's own `using Found` once found it).
    ['struct Found:\n    | x: I32\nexport main() I32 { let s = Found { x: 4 }; s.x; }\n', 'Found is a standard type'],
    // A generic module's function called with no instance (this built invalid Wasm).
    ['mod gb[T] { fn id(v: T) T { v; } }\nexport main() F64 { gb.id(1.5); }\n', 'gb takes 1 type arguments, given 0'],
    // Two types of one name, told apart.
    ['mod a {\n    struct S:\n        | x: I32\n    fn mk() S { S { x: 1 }; }\n}\nstruct S:\n    | x: I32\nexport main() I32 { let s: S = a.mk(); s.x; }\n', 's is S, got a.S'],
    // A module instantiating a bigger type each time it recurses (this ran for a minute, then crashed).
    ['mod m[T] {\n    fn f(n: I32) I32 { if n == 0 { 0; } else { m[Array[T]].f(n - 1) + 1; }; }\n}\nexport main() I32 { m[I32].f(3); }\n', "m's instances nest more than 64 deep"],
    // Past what a Wasm function takes (the engine refused the module).
    [`fn f(${Array.from({ length: 1001 }, (_, i) => `a${i}: I32`).join(', ')}) I32 { a0; }\nexport main() I32 { 1; }\n`, 'f has 1001 parameters (max 1000)'],
    // Nesting past the compiler's stack: a diagnostic, not a JavaScript stack.
    [`export main() I32 {\n    ${'('.repeat(30000)}1${')'.repeat(30000)};\n}\n`, 'Program nested too deeply (at about line 2)'],
    ['fn f() I32 {\n    let x = 1 2;\n    x;\n}\n', "Expected ';', got '2'"],
    // A token missing at the end of a line: after the token before it.
    ['fn f() I32 {\n    let x = 1\n    x;\n}\n', 'Missing ; after 1'],
    // Other languages' habits, and names that are nearly right.
    ['fn f(a: Bool, b: Bool) Bool { a && b; }\n', 'Write and, not &&'],
    ['fn f() I32 {\n    let total = 1;\n    totl;\n}\n', 'Unknown variable totl; did you mean total?'],
    // Where an expected type came from: a parameter, a result.
    ['fn g(n: I32) I32 { n; }\nfn f() I32 { g("x"); }\n', 'g takes I32, got Str'],
    ['fn f() I32 { "x"; }\n', 'f returns I32, got Str'],
    // A closure the host calls cannot suspend: JSPI cannot suspend through the host's frame.
    ['let each: fun(cl(I32) void) void = @es/\\ (f) => f(1) \\/;\nlet later: fun(I32) Promise[I32] = @es/\\ (v) => Promise.resolve(v) \\/;\nexport main() void { each(cl(v) { let w: I32 = await later(v); }); }\n',
      'A closure the host calls cannot await'],
  ];
  for (const [source, message] of mistakes) {
    const { errors } = await selfhost(await write(source));
    assert.ok(errors?.includes(message), `${source.slice(0, 300)}\n  reported: ${errors}`);
    checked++;
  }
  // A std module not imported: the note names the module, and its file.
  for (const [source, note] of [
    ['export main() F64 { Time.now(); }\n', 'using time from std:Time; (the module is time)'],
    ['using Time from std:Time;\nexport main() F64 { time.now(); }\n', 'using time from std:Time; (the module is time)'],
    ['export main() void { console.log("hi"); }\n', 'using console from std:Console;'],
  ]) {
    const { diagnostics } = await compileFile(utu, await write(source), { optimize: 'size' });
    assert.ok(diagnostics[0]?.notes?.includes(note), `${source}\n  notes: ${diagnostics[0]?.notes}`);
    checked++;
  }

  // Test names: each test has one, its own.
  const twice = await compileFile(utu, await write('export main() void {}\ntest "passes" { assert true; }\ntest "passes" { assert true; }\ntest "" { assert true; }\n'), { target: 'test' });
  assert.deepEqual(twice.diagnostics.map(d => d.message), ['Duplicate test "passes"', 'Empty test name']);
  checked++;

  // Each file's names are its own (only modules cross files), and generic
  // modules called through aliases: what each builds to, in every mode.
  const project = async files => {
    const at = await fs.mkdtemp(path.join(dir, 'project-'));
    for (const [name, text] of Object.entries(files)) await fs.writeFile(path.join(at, name), text);
    return path.join(at, 'main.utu');
  };
  const tee = Array.from({ length: 3000 }, (_, k) => `    a = a * 3 + ${k % 7};`).join('\n');
  let teed = 1;
  for (let k = 0; k < 3000; k++) teed = (Math.imul(teed, 3) + k % 7) | 0;
  const built = [
    // An imported module's file's own function, not the entry's of the same name (this gave 2000).
    [{ 'hf.utu': 'fn helper() I32 { 2; }\nmod hm { fn f() I32 { helper(); } }\n',
      'main.utu': 'using hm |H| from "./hf.utu";\nfn helper() I32 { 1000; }\nexport main() I32 { H.f() + helper(); }\n' }, 1002],
    // An imported file's alias stays in its file (it hid the entry's own `ops`).
    [{ 'ops.utu': 'mod mathops { fn double(v: I32) I32 { v * 2; } }\n',
      'boxes.utu': 'using mathops |ops| from "./ops.utu";\nmod boxes { fn f(v: I32) I32 { ops.double(v); } }\n',
      'main.utu': 'using boxes from "./boxes.utu";\nmod ops { fn double(v: I32) I32 { v * 10; } }\nexport main() I32 { ops.double(1) + boxes.f(1); }\n' }, 12],
    // A capitalized alias of an instance, called and piped to (this built invalid Wasm).
    [{ 'main.utu': 'mod box[T] { fn id(v: T) T { v; } }\nusing box[F64] |B|;\nexport main() F64 { B.id(1.5) + (2.5 -o B.id); }\n' }, 4],
    [{ 'main.utu': 'mod num[T] { fn half(v: T) T { v / 2; } }\nusing num[U32] |N|;\nexport main() I64 { let x: U32 = 4000000000; N.half(x).to_i64(); }\n' }, 2000000000n],
    // A module's promoted type's function, called on the module (this said "sm has no member new").
    [{ 'main.utu': 'mod sm {\n    struct &: | v: I32\n    fn &.new(v: I32) & { &{ v: v }; }\n    fn get(s: &) I32 { s.v; }\n}\nexport main() I32 { sm.get(sm.new(3)); }\n' }, 3],
    // An @es binding of a generic module, typed in each instance.
    [{ 'main.utu': 'mod Adder[T] {\n    let add_: fun(T, T) T = @es/\\ (a, b) => a + b \\/;\n    fn add(t: T, c: T) T { add_(t, c); }\n}\nexport main() F64 { Adder[F64].add(2.5, 3.0) + Adder[I32].add(2, 3).to_f64(); }\n' }, 10.5],
    // A computed global of an imported file, read by the entry's: set first.
    [{ 'table.utu': 'mod table {\n    fn build() Array[I32] { let a = Array[I32].new(4, 0); for (0 ..< 4) |i| { a[i] = i * i; }; a; }\n    let squares: Array[I32] = build();\n}\n',
      'main.utu': 'using table from "./table.utu";\nlet last: I32 = table.squares[3] + 1;\nexport main() I32 { last; }\n' }, 10],
    // Thousands of statements each reading the one before (teed into one another, they overflowed code generation's stack).
    [{ 'main.utu': `export main() I32 {\n    let a = 1;\n${tee}\n    a;\n}\n` }, teed],
  ];
  for (const [files, expected] of built) {
    const file = await project(files);
    for (const mode of ['debug', 'small', 'fast', 'smallUnsafe', 'fastUnsafe']) {
      const result = await compileFile(utu, file, { mode });
      assert.ok(result.wasm, `${mode}: ${result.diagnostics.map(d => d.message).join('\n')}\n${files['main.utu'].slice(0, 200)}`);
      assert.equal(await (await instantiateNode(result.wasm, result.spec)).exports.main(), expected, `${mode}: ${files['main.utu'].slice(0, 200)}`);
      checked++;
    }
  }
  // What a file does not import, it does not see.
  const unseen = [
    [{ 'hf.utu': 'fn helper() I32 { 2; }\nmod hm { fn f() I32 { 1; } }\n', 'main.utu': 'using hm from "./hf.utu";\nexport main() I32 { helper(); }\n' }, 'Unknown function helper'],
    [{ 'ops.utu': 'mod mathops { fn double(v: I32) I32 { v * 2; } }\n', 'boxes.utu': 'using mathops |ops| from "./ops.utu";\nmod boxes { fn f() I32 { 1; } }\n',
      'main.utu': 'using boxes from "./boxes.utu";\nexport main() I32 { ops.double(21); }\n' }, 'Unknown variable ops'],
  ];
  for (const [files, message] of unseen) {
    const result = await compileFile(utu, await project(files), {});
    assert.ok(result.diagnostics.some(d => d.message === message), `${files['main.utu']}\n  reported: ${result.diagnostics.map(d => d.message)}`);
    checked++;
  }
  // A source map changes no byte of the module, in any mode; its entries
  // are in offset order, each in the code, and the program's own lines are
  // where they are.
  const mapped = await write('fn boom(x: I32) I32 {\n    assert x > 5;\n    x * 2;\n}\nfn twice(n: I32) I32 { boom(n) + boom(n + 1); }\nexport main() I32 { twice(10); }\n');
  for (const mode of ['debug', 'small', 'fast', 'smallUnsafe', 'fastUnsafe']) {
    const plain = await compileFile(utu, mapped, { mode, debugNames: true });
    const withMap = await compileFile(utu, mapped, { mode, debugNames: true, sourceMap: true });
    assert.deepEqual(withMap.wasm, plain.wasm, mode);
    const { entries } = withMap.map;
    assert.ok(entries.length > 0 && entries.every((e, i) => i === 0 || e.at > entries[i - 1].at) && entries.at(-1).at < withMap.wasm.length, mode);
    assert.ok(entries.some(e => e.kind === 'assert_expr' && e.file === mapped && e.line === 2 && e.column === 5 && e.owner === 'boom'), mode);
    checked++;
  }
  console.log(`compiler regressions: ${checked} builds as they should be`);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
