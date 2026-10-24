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

  // Long matches and deep literals, in every build mode: each once took time
  // the square of its size (a 16,384-deep literal trapped, out of memory).
  const arms = Array.from({ length: 3000 }, (_, i) => `        ${i * 2} => ${i},`).join('\n');
  const variants = Array.from({ length: 40 }, (_, i) => `    | V${i}`).join('\n');
  const covered = Array.from({ length: 40 }, (_, i) => `        Many.V${i} => ${i * i},`).join('\n');
  const deep = '['.repeat(300) + '[null, [7, 8]], [[9]]' + ']'.repeat(300);
  const large = await write(`enum(U8) Many:
${variants}
fn dense(x: I32) I32 {
    match x {
${arms}
        ~> -1,
    };
}
fn sparse(x: I32) I32 { match x { 5 => 1, 500 => 2, 50000 => 3, -7 => 4, ~> 0, }; }
fn square(m: Many) I32 {
    match m {
${covered}
    };
}
fn deep_len() I32 {
    let a = ${deep};
    let inner = a${'[0]'.repeat(300)};
    inner.len() * 100 + (inner[1] orelse fatal).len() * 10 + (inner[1] orelse fatal)[1];
}
export lib {
    fn run() I32 {
        dense(5998) * 10000 + dense(4) * 1000 + dense(3) + 2 + sparse(-7) * 100 + sparse(50000) * 10 + square(Many.V39) + deep_len();
    }
}
`);
  const want = 2999 * 10000 + 2 * 1000 + -1 + 2 + 4 * 100 + 3 * 10 + 39 * 39 + (2 * 100 + 2 * 10 + 8);
  for (const mode of ['debug', 'small', 'fast', 'smallUnsafe', 'fastUnsafe']) {
    const built = await compileFile(utu, large, { mode });
    assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
    assert.equal((await instantiateNode(built.wasm, built.spec)).exports.run(), want, mode);
    checked++;
  }

  // Result, try, and errdefer, in every build mode (the self-hosted compiler's
  // alone). Each letter is a defer (d, D, i) or errdefer (e, E, T, p, c, j, o) run;
  // a labeled block's break runs its defers, not its errdefers.
  const results = await write(`// What ran, in order: one letter each.
vec trail: I32;
fn note(s: Str) void { trail.push(s.get(0)); }
fn taken() Str {
    let s = "";
    for (0 ..< trail.len()) |i| { s = s + Str.from_code_point(trail[i]); };
    trail.clear();
    s;
}
fn digit(c: I32) Result[I32, Str] {
    if c < 48 or c > 57 { return Result[I32, Str].err("bad " + c.to_str()); };
    Result[I32, Str].ok(c - 48);
}
fn sum(codes: Array[I32]) Result[I32, Str] {
    defer note("D");
    errdefer note("E");
    let t = 0;
    for (codes) |c| {
        defer note("d");
        errdefer note("e");
        t += try digit(c);
    };
    Result[I32, Str].ok(t);
}
fn twice(codes: Array[I32]) Result[Str, Str] {
    errdefer note("T");
    let a = try sum(codes);
    let b = try sum(codes);
    Result[Str, Str].ok((a + b).to_str());
}
fn picky(n: I32) Result[I32, Str] {
    errdefer note("p");
    if n == 0 { return Result[I32, Str].err("zero"); };
    let r = if n > 9 { Result[I32, Str].err("big"); } else { Result[I32, Str].ok(n); };
    r;
}
fn via_closure(c: I32) Result[I32, Str] {
    let f = cl(k: I32) Result[I32, Str] {
        errdefer note("c");
        let v = try digit(k);
        Result[I32, Str].ok(v * 2);
    };
    let v = try f(c);
    Result[I32, Str].ok(v + 1);
}
fn labeled(c: I32, leave: Bool) Result[I32, Str] {
    errdefer note("o");
    let v = found: {
        defer note("i");
        errdefer note("j");
        if leave { break found 7; };
        try digit(c);
    };
    Result[I32, Str].ok(v);
}
fn show(r: Result[I32, Str]) Str {
    taken() + "|" + if r.is_ok() { r.value().to_str(); } else { r.error(); };
}
export lib {
    fn ok_sum() Str { show(sum([49, 50, 51])); }
    fn err_sum() Str { show(sum([49, 120, 51])); }
    fn nested_ok() Str {
        let r = twice([52]);
        taken() + "|" + r.value();
    }
    fn nested_err() Str {
        let r = twice([97]);
        taken() + "|" + r.error();
    }
    fn returns() Str { show(picky(0)) + "," + show(picky(5)) + "," + show(picky(12)); }
    fn closure() Str { show(via_closure(51)) + "," + show(via_closure(65)); }
    fn defaults() I32 { digit(55).value_or(-1) * 10 + digit(1).value_or(-1); }
    fn labels() Str { show(labeled(50, true)) + "," + show(labeled(50, false)) + "," + show(labeled(120, false)); }
}
`);
  for (const mode of ['small', 'fast', 'smallUnsafe', 'fastUnsafe', 'debug']) {
    const built = await compileFile(utu, results, { mode });
    assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
    const e = (await instantiateNode(built.wasm, built.spec)).exports;
    const expected = { ok_sum: 'dddD|6', err_sum: 'dedED|bad 120', nested_ok: 'dDdD|8', nested_err: 'edEDT|bad 97',
      returns: 'p|zero,|5,p|big', closure: '|7,c|bad 65', defaults: 69,
      labels: 'i|7,i|2,jio|bad 120' };
    for (const [name, value] of Object.entries(expected)) assert.equal(e[name](), value, `${mode}: ${name}`);
    checked++;
  }

  // -O small inlines what shrinks (selfhost/inline.utu): arguments with
  // effects run in their order, a constant or a local moves to its read, an
  // argument never read is kept, a function called once moves there; and
  // the small builds have fewer functions than debug.
  const shrinks = await write(`vec trail: I32;
fn tick(v: I32) I32 { trail.push(v); v; }
fn less(a: I32, b: I32) I32 { a - b; }
fn scaled(a: I32, b: I32) I32 { a * 10 + b; }
fn second(a: I32, b: I32) I32 { b; }
fn sign(x: I32) I32 { if x < 0 { -1; } else { 1; }; }
export lib {
    fn run() I32 {
        let x = 7;
        less(tick(9), tick(4)) * 1000 + scaled(tick(3), x) * 10 + scaled(less(x, 2), 1) + second(tick(2), 5) + sign(x - 10);
    }
    fn ran() I32 {
        let t = 0;
        for (0 ..< trail.len()) |i| { t = t * 10 + trail[i]; };
        t;
    }
}
`);
  const functions = bytes => {
    let i = 8;
    const leb = () => { let r = 0, s = 0, b; do { b = bytes[i++]; r += (b & 127) * 2 ** s; s += 7; } while (b & 128); return r; };
    while (i < bytes.length) { const id = bytes[i++], size = leb(); if (id === 3) return leb(); i += size; }
    return 0;
  };
  const debugFunctions = functions((await compileFile(utu, shrinks, { mode: 'debug' })).wasm);
  for (const mode of ['small', 'fast', 'smallUnsafe', 'fastUnsafe', 'debug']) {
    const built = await compileFile(utu, shrinks, { mode });
    assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
    const e = (await instantiateNode(built.wasm, built.spec)).exports;
    assert.equal(e.run(), 5425, `${mode}: run`);
    assert.equal(e.ran(), 9432, `${mode}: ran`);
    if (mode.startsWith('small')) assert.ok(functions(built.wasm) < debugFunctions, `${mode}: nothing inlined`);
    checked++;
  }

  // -O small moves every function called once to its call, whatever its body
  // holds: locals, loops, an early return (from inside a loop), try/catch,
  // defer, a written parameter, a callee itself moved into; arguments run
  // in order, and its locals share a caller loop's slots without coming round.
  const once = await write(`using JS from std:JS;
vec trail: I32;
fn tick(v: I32) I32 { trail.push(v); v; }
fn note(v: I32) void { trail.push(v); }
fn digits(n: I32, base: I32) I32 {
    if n == 0 { return 1; };
    let count = 0;
    while (n > 0) {
        n = n / base;
        count += 1;
    };
    count;
}
fn squares(k: I32) I32 {
    let total = 0;
    for (0 ..< k) |i| {
        let sq = i * i;
        total += sq;
    };
    total;
}
fn parsed(text: Str) Str { try { JS.JSON.stringify(JS.JSON.parse(text)); } catch |e| { "bad"; }; }
fn first_over(limit: I32, a: I32, b: I32, c: I32) I32 {
    defer note(0);
    for ([a, b, c]) |v| { if v > limit { return v; }; };
    -1;
}
fn inner(x: I32) I32 { let y = x * 3; y + 1; }
fn inner2(x: I32) I32 { x - 1; }
fn outer(x: I32) I32 { let z = inner(x) + inner2(x); z * 2; }
fn poly(x: I32, c: I32) I32 { c * x * x + c * x + c; }
export lib {
    fn run() I32 {
        let sum = 0;
        for (0 ..< 3) |r| { sum += squares(r + 2); };
        digits(tick(1234), tick(10)) * 100000 + digits(0, 10) * 10000 + sum * 100 + first_over(tick(5), tick(3), tick(9), tick(7));
    }
    fn ran() Str {
        let s = "";
        for (0 ..< trail.len()) |i| { s = if i == 0 { \`\${trail[i]}\`; } else { \`\${s},\${trail[i]}\`; }; };
        s;
    }
    fn json() Str { parsed("[1,2]") + parsed("{"); }
    fn nested() I32 { outer(5) + poly(3, 2); }
}
`);
  const onceDebug = functions((await compileFile(utu, once, { mode: 'debug' })).wasm);
  for (const mode of ['small', 'fast', 'smallUnsafe', 'fastUnsafe', 'debug']) {
    const built = await compileFile(utu, once, { mode });
    assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
    const e = (await instantiateNode(built.wasm, built.spec)).exports;
    assert.equal(e.run(), 412009, `${mode}: run`);
    assert.equal(e.ran(), '1234,10,5,3,9,7,0', `${mode}: ran`);
    assert.equal(e.json(), '[1,2]bad', `${mode}: json`);
    assert.equal(e.nested(), 66, `${mode}: nested`);
    if (mode.startsWith('small')) assert.ok(functions(built.wasm) <= onceDebug - 8, `${mode}: once-called functions not moved`);
    checked++;
  }

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

  // Constant folding (optimized builds), as wasm computes: wrapping at the
  // ends, shift counts mod the width, add/sub chains reassociated (negative
  // constants, wrapping), `x * 0` and `x & 0` keeping x's effects, and an
  // `if` or loop condition that is constant.
  const foldFile = await write(`vec calls: I32 = [0];
fn bump() I32 { calls[0] += 1; calls[0]; }
let depth: I32 = 14;
export lib {
    fn max_plus() I32 { 2147483647 + 1; }
    fn min_minus() I32 { -2147483648 - 1; }
    fn min_times() I32 { -2147483648 * -1; }
    fn big_mul() I32 { 65537 * 65537; }
    fn max64_plus() I64 { let m: I64 = 9223372036854775807; m + 1; }
    fn min64_minus() I64 { let m: I64 = -9223372036854775808; m - 1; }
    fn shl33() I32 { 1 << 33; }
    fn shr35() I32 { -8 >> 35; }
    fn shru33() I32 { -1 >>> 33; }
    fn shl65() I64 { let one: I64 = 1; one << 65; }
    fn shru64() I64 { let m: I64 = -1; m >>> 64; }
    fn cmp_u() Bool { let m: I64 = -1; m.to_u64() > 1.to_u64(); }
    fn global_plus() I32 { depth + 1; }
    fn reassoc(x: I32) I32 { 1 << (depth - x + 4); }
    fn reassoc_neg(x: I32) I32 { (x - 5) + -7 - -3; }
    fn reassoc_wrap(x: I32) I32 { (x + 2147483647) + 2; }
    fn reassoc64(x: I64) I64 { let a: I64 = -3; (a - x) - 9223372036854775807; }
    fn times_zero() I32 { let before = calls[0]; let r = bump() * 0; r + (calls[0] - before) * 10; }
    fn and_zero() I32 { let before = calls[0]; let r = bump() & 0; r + (calls[0] - before) * 10; }
    fn idents(x: I32) I32 { ((((x + 0) * 1) | 0) ^ 0) & -1 << 32; }
    fn if_const() I32 { if 3 > 2 { 1; } else { 2; }; }
    fn if_const_else() I32 { let t = 0; if 1 == 2 { t = bump(); } else { t = 7; }; t; }
    fn if_no_else() I32 { let t = 1; if 2 < 1 { t = bump(); }; t; }
    fn while_false() I32 { let n = 0; while (1 > 2) { n += 1; }; n; }
    fn while_true() I32 { let n = 0; while (true) { n += 1; if n == 5 { break; }; }; n; }
}
`);
  for (const mode of ['small', 'fast', 'smallUnsafe', 'fastUnsafe', 'debug']) {
    const built = await compileFile(utu, foldFile, { mode });
    assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
    const { exports } = await instantiateNode(built.wasm, built.spec);
    const want = { max_plus: -2147483648, min_minus: 2147483647, min_times: -2147483648, big_mul: 131073,
      max64_plus: -(2n ** 63n), min64_minus: 2n ** 63n - 1n, shl33: 2, shr35: -1, shru33: 2147483647, shl65: 2n, shru64: -1n,
      cmp_u: true, global_plus: 15, reassoc: 32768, reassoc_neg: -6, reassoc_wrap: -2147483644, reassoc64: 2n ** 63n - 5n,
      times_zero: 10, and_zero: 10, idents: 3, if_const: 1, if_const_else: 7, if_no_else: 1, while_false: 0, while_true: 5 };
    for (const [name, value] of Object.entries(want)) {
      const fn = exports[name];
      // (Each one's parameters are of its result's type.)
      assert.equal(fn(...Array(fn.length).fill(typeof value === 'bigint' ? 3n : 3)), value, `${mode}: ${name}`);
    }
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
    // Closures that recurse 3000 deep: small called them through the host, JS frames each level (overflowed near 800).
    ['export lib { fn run() I32 { let d: cl(I32) I32 = cl(n) { 0; }; d = cl(n) { if n == 0 { 0; } else { 1 + d(n - 1); }; }; d(3000); } }\n', 3000],
    ['fn f(n: I32) I32 { let c = cl(k: I32) I32 { if k == 0 { 0; } else { 1 + f(k - 1); }; }; c(n); }\nexport lib { fn run() I32 { f(3000); } }\n', 3000],
    // A generator's parameter, captured, then assigned.
    ['fn g(a: I32) yield I32 { let c: cl(I32) I32 = cl(x) { x + a; }; a = 5; yield c(1); }\nexport lib { fn run() I32 { let t = 0; for (g(1)) |v| { t += v; }; t; } }\n', 6],
    // A name from a tuple, captured, then assigned.
    ['fn two() .{I32, I32} { .{1, 2}; }\nexport lib { fn run() I32 { let .{a, b} = two(); let c: cl() I32 = cl() { a + b; }; a = 10; c(); } }\n', 12],
    // Operators declared on a distinct type.
    ['type Id = distinct I32;\nfn Id:eq |a, b| Bool { false; }\nfn Id:add |a, b| Id { Id.from_i32(a.to_i32() + b.to_i32() + 100); }\nexport lib { fn run() I32 { let a = Id.from_i32(3); (a + a).to_i32() + (if a == a { 1000; } else { 0; }); } }\n', 106],
    // `op=` on a protocol member.
    ['proto Sh:\n    | get set k: I32\nstruct Sq[Sh]:\n    | k: I32\nexport lib { fn run() I32 { let s: Sh = Sq { k: 3 }; s.k += 4; s.k; } }\n', 7],
    // Getter, setter and method dispatch through a protocol value, over two implementers.
    ['proto C:\n    | get set n: I32\n    | step(I32) I32\nstruct A[C]:\n    | n: I32\nstruct B[C]:\n    | tag: I32\n    | n: I32\nfn C[A].step |a| (k: I32) I32 { a.n + k; }\nfn C[B].step |b| (k: I32) I32 { b.n * k + b.tag; }\n'
      + 'export lib { fn run() I32 { let xs: Array[C] = [A { n: 1 }, B { tag: 7, n: 2 }]; let t = 0; for (xs) |c| { c.n = c.n + 10; c.n += 1; t = t * 100 + c.step(3) + c.n; }; t; } }\n', 2759],
    // `| get n` and `| set n` on two lines are one member: read, written, and `op=` (`set` then `get` too).
    ['proto C:\n    | get n: I32\n    | set n: I32\nstruct S[C]:\n    | n: I32\nexport lib { fn run() I32 { let c: C = S { n: 1 }; c.n = 5; c.n; } }\n', 5],
    ['proto C:\n    | set n: I32\n    | get n: I32\nstruct S[C]:\n    | n: I32\nexport lib { fn run() I32 { let c: C = S { n: 1 }; c.n = 5; c.n += 4; c.n; } }\n', 9],
    // Struct literal fields run in the order written.
    ['struct P:\n    | a: I32\n    | b: I32\n    | c: I32\nexport lib { fn run() I32 { let n = 0; let p = P { b: { n += 1; n * 10; }, c: 7, a: { n += 1; n; } }; p.a * 1000 + p.b * 10 + p.c; } }\n', 2107],
    // A generic module's own name, with its arguments, inside it.
    ['mod m[T] {\n    struct &:\n        | v: T\n        | next: ?m[T]\n    fn &.mk(v: T) m[T] { &{ v: v, next: null }; }\n}\nexport lib { fn run() I32 { let a = m[I32].mk(3); a.next = m[I32].mk(4); let n = a.next orelse fatal; a.v + n.v; } }\n', 7],
    // `a orelse b` (`br_on_non_null`): a once, b only when a is null, a `break` for b.
    ['struct N:\n    | v: I32\n    | next: ?N\nvec hits: I32 = [0];\nfn get(n: N) ?N { hits[0] += 1; n.next; }\n'
      + 'fn walk(a: ?N) I32 { let t = 0; let cur = a; while (true) { let c = cur orelse { break; }; t += c.v; cur = c.next; }; t; }\n'
      + 'export lib { fn run() I32 {\n    let a = N { v: 1, next: N { v: 2, next: null } };\n    let b = get(a) orelse a;\n    let z = get(b) orelse N { v: 40, next: null };\n    let w = (get(z) orelse b).v;\n'
      + '    walk(a) * 100000 + b.v * 1000 + z.v + w * 10 + hits[0] * 10000;\n} }\n', 332060],
    // `and`/`or` as i32.and/i32.or, range tests as one unsigned comparison (small):
    // the right side runs after the left (which it may read), bounds at the ends of I32.
    ['vec seen: I32 = [0];\nfn bump() Bool { seen[0] += 1; seen[0] > 2; }\nfn h(acc: I32, b: Bool) I32 { acc * 31 + if b { 1; } else { 0; }; }\n'
      + 'fn ranges(x: I32) I32 {\n    let a = 0;\n    a = h(a, x >= 48 and x <= 57);\n    a = h(a, 48 <= x and x <= 57);\n    a = h(a, x > -10 and x < 10);\n'
      + '    a = h(a, x >= -2147483648 and x <= 5);\n    a = h(a, x >= 0 and x <= 2147483647);\n    a = h(a, x >= -2147483648 and x <= 2147483647);\n'
      + '    a = h(a, x >= 5 and x <= 5);\n    a = h(a, x >= 6 and x <= 5);\n    a = h(a, x < 65 or x > 90);\n    a = h(a, 90 < x or x < 65);\n'
      + '    a = h(a, x <= -1 or x >= 100);\n    a = h(a, x >= 0 and x < 2147483647);\n    a = h(a, x > -2147483648 and x <= 0);\n    a;\n}\nstruct B:\n'
      + '    | ok: Bool\nfn is_ok(b: ?B) Bool { promote b { |o| => o.ok, ~> false, }; }\nfn nonnull(b: ?B) Bool { promote b { |o| => true, ~> false, }; }\n'
      + 'export lib { fn run() I32 {\n'
      + '    let xs = [-2147483648, -2147483647, -11, -10, -9, -1, 0, 1, 4, 5, 6, 9, 10, 47, 48, 50, 57, 58, 64, 65, 77, 90, 91, 99, 100, 101, 2147483646, 2147483647];\n'
      + '    let acc = 0;\n    for (xs) |x| { acc = acc * 7 + ranges(x); };\n    let flag = false;\n    let t = 0;\n    for (0 ..< 5) |i| {\n'
      + '        if bump() and seen[0] > 3 { t += 1; };\n        flag = i > 2;\n        if i == 1 or flag { t += 10; };\n'
      + '        if flag and i != 4 { t += 100; };\n    };\n    let b: ?B = B { ok: true };\n    let n: ?B = null;\n'
      + '    acc + t * 1000 + (if is_ok(b) { 1; } else { 0; }) + (if is_ok(n) { 2; } else { 0; }) + (if nonnull(b) { 4; } else { 0; }) + (if nonnull(n) { 8; } else { 0; }) + seen[0];\n'
      + '} }\n', 2137102356],
    // alt arms that bind, as br_on_cast (small): a default, none, an unsafe build's untested last arm,
    // arms that break, return, or capture (boxed), arms that make the alt's own type.
    ['enum Sh:\n    | Circle { r: I32 }\n    | Sq { s: I32 }\n    | Rect { w: I32, h: I32 }\n    | Tri { a: I32, b: I32, c: I32 }\n    | Dot {}\n'
      + 'fn area(x: Sh) I32 {\n    alt x {\n        Circle |c| => c.r * 3,\n        Sq |q| => q.s * q.s,\n        Rect |r| => r.w * r.h,\n'
      + '        Tri |t| => t.a + t.b + t.c,\n        Dot => 1,\n    };\n}\nfn kind(x: Sh) I32 {\n    alt x {\n        Circle |c| => c.r,\n        Sq |q| => q.s,\n'
      + '        Rect |r| => r.w,\n        ~> 99,\n    };\n}\nfn first(xs: Array[Sh]) I32 {\n    let t = 0;\n    for (xs) |x| {\n        alt x {\n'
      + '            Circle |c| => { t += c.r; },\n            Sq |q| => { if q.s > 5 { break; }; t += 1000; },\n'
      + '            Rect |r| => { if r.w == 0 { return -1; }; t += r.w; },\n            Tri |tr| => { let f: cl() I32 = cl() { tr.a * 2; }; t += f(); },\n'
      + '            Dot => { t += 7; },\n        };\n    };\n    t;\n}\nfn ret(x: Sh) Sh {\n    alt x {\n        Circle |c| => Sq { s: c.r },\n'
      + '        Sq |q| => Rect { w: q.s, h: 2 },\n        Rect |r| => r,\n        Tri |t| => { return Dot {}; },\n        Dot => x,\n    };\n}\n'
      + 'fn boxed(x: Sh) I32 {\n    alt x {\n        Circle |c| => { let g: cl() I32 = cl() { c.r + 1; }; c = Circle { r: 50 }; g(); },\n        Sq |q| => q.s,\n'
      + '        Rect |r| => r.h,\n        Tri |t| => t.c,\n        Dot => 0,\n    };\n}\nexport lib { fn run() I32 {\n'
      + '    let xs: Array[Sh] = [Circle { r: 2 }, Sq { s: 3 }, Rect { w: 4, h: 5 }, Tri { a: 1, b: 2, c: 3 }, Dot {}];\n    let t = 0;\n'
      + '    for (xs) |x| { t = t * 7 + area(x) + kind(x) * 3 + boxed(x) * 11 + area(ret(x)) * 13; };\n'
      + '    t + first(xs) * 100000 + first([Circle { r: 1 }, Sq { s: 9 }, Dot {}]) * 1000000 + first([Rect { w: 0, h: 1 }]);\n} }\n', 104064628],
    // A field read again (small): kept in a local only while no call, struct.set of the field,
    // assignment of the local, or loop writing them, comes between.
    ['struct P:\n    | x: I32\n    | y: I32\n    | next: ?P\nfn poke(p: P) void { p.x += 100; }\nfn alias(a: P, b: P) I32 {\n    let s = a.x + a.x;\n    b.x = 7;\n'
      + '    s + a.x + a.x + a.x;\n}\nfn calls(a: P) I32 {\n    let s = a.x + a.x;\n    poke(a);\n    s * 1000 + a.x + a.x + a.x;\n}\nfn loop_write(a: P) I32 {\n'
      + '    let s = a.y + a.y + a.y;\n    let i = 0;\n    while (i < 3) {\n        s += a.y + a.y;\n        a.y += 1;\n        i += 1;\n    };\n    s + a.y;\n}\n'
      + 'fn reassign(a: P, b: P) I32 {\n    let p = a;\n    let s = p.x + p.x + p.x;\n    p = b;\n    s * 1000 + p.x + p.x + p.x;\n}\nfn branch(a: P, c: Bool) I32 {\n'
      + '    let s = 0;\n    if c { s = a.y + a.y; } else { s = 1; };\n    s * 10 + a.y + a.y + a.y;\n}\nfn hoist(a: P) I32 {\n    let s = a.x;\n'
      + '    for (0 ..< 4) |i| { s += a.x * i + a.y + a.x; };\n    s;\n}\nexport lib { fn run() I32 {\n    let a = P { x: 1, y: 2, next: null };\n'
      + '    let b = P { x: 3, y: 4, next: a };\n    let r = alias(a, a) * 1 + alias(a, b) * 100;\n    r = r * 7 + calls(b);\n    r = r * 7 + loop_write(a);\n'
      + '    r = r * 7 + reassign(a, b);\n    r = r * 7 + branch(a, true) + branch(b, false) * 3;\n    r * 7 + hoist(a);\n} }\n', 94651822],
    // batched and windows after chain or flat_map, which run the pipeline twice (the second made new locals: Null).
    ['export lib { fn run() I32 { let a = [1, 2, 3, 4]; let w = a chain(a) windows(I32, 3); let b = a flat_map |x| { [x, x]; } batched(I32, 3); w.len() * 100 + b.len() * 10 + b[2].len(); } }\n', 632],
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
    // A generator's `return;` runs its defers.
    ['fn g(n: I32) yield I32 { let k = 0; defer seen[0] = 7; for (0 ..< n) |i| { if i == 2 { return; }; yield i; }; }\nvec seen: I32 = [0];\nexport lib { fn run() I32 { let t = 0; for (g(5)) |v| { t += v; }; t + seen[0] * 10; } }\n', 71],
    // A return or break out of nested expansions of one generator runs each one's defers with its own
    // parameters and locals (the outer one's ran with the inner one's).
    ['vec seen: I32;\nfn gen(t: I32, k: I32) yield I32 {\n    let u = t + k;\n    let f = cl() I32 { u; };\n    defer seen.push(t * 10 + k);\n    defer seen.push(f());\n    yield t;\n    yield t + 1;\n}\n'
      + 'fn three() I32 {\n    for (gen(1, 2)) |a| { for (gen(3, 4)) |b| { for (gen(5, 6)) |c| { if b == 4 and c == 6 { return a * 100 + b * 10 + c; }; }; }; };\n    0;\n}\n'
      + 'fn left() I32 { out: { for (gen(1, 2)) |a| { for (gen(3, 4)) |b| { if b == 4 { break out a + b; }; }; }; 0; }; }\n'
      + 'export lib { fn run() Str {\n    let r = three().to_str() + "|" + left().to_str() + "|";\n    for (0 ..< seen.len()) |i| { r = r + seen[i].to_str() + ","; };\n    r;\n} }\n', '146|5|11,56,11,56,7,34,3,12,7,34,3,12,'],
    // And an error return or a failed `try` there, before the function's errdefers.
    ['vec seen: I32;\nfn gen(t: I32) yield I32 { defer seen.push(t); yield t; yield t + 1; }\nfn digit(c: I32) Result[I32, Str] { if c > 9 { return Result[I32, Str].err("bad"); }; Result[I32, Str].ok(c); }\n'
      + 'fn f(mode: I32) Result[I32, Str] {\n    errdefer seen.push(0);\n    for (gen(1)) |a| { for (gen(10)) |b| {\n        if b == 11 and mode == 0 { return Result[I32, Str].err("ret"); };\n        if b == 11 { let x = try digit(b); };\n    }; };\n    Result[I32, Str].ok(0);\n}\n'
      + 'export lib { fn run() Str {\n    let r = f(0).error() + f(1).error() + "|";\n    for (0 ..< seen.len()) |i| { r = r + seen[i].to_str() + ","; };\n    r;\n} }\n', 'retbad|10,1,0,10,1,0,'],
    // An alias of a generic module's instance is its type there.
    ['mod B[T] {\n    struct &:\n        | v: T\n    fn of(x: T) & { &{ v: x }; }\n}\nmod L[T] {\n    enum &:\n        | Nil {}\n        | Cons { h: T, t: & }\n    fn cons(h: T, t: &) & { Cons { h: h, t: t }; }\n}\nusing B[I32] |bi|;\nusing B[Str] |bs|;\nusing L[I32] |li|;\nfn f(x: bi) I32 { x.v; }\nfn mk() bs { B[Str].of("in"); }\nfn len(x: li) I32 { alt x { Nil => 0, Cons |c| => 1 + len(c.t), }; }\nexport lib { fn run() I32 { let c: bi = &{ v: 3 }; let n: li = li.Nil {}; f(c) + mk().v.len() + len(L[I32].cons(1, n)); } }\n', 6],
    // `using M;` and `using M[A];` of a module whose type is `&`.
    ['mod B[T] {\n    struct &:\n        | v: T\n    fn wrap(x: T) & { &{ v: x }; }\n}\nusing B[I32];\nmod C {\n    struct &:\n        | v: I32\n    fn mk(x: I32) & { &{ v: x }; }\n}\nusing C;\nexport lib { fn run() I32 { B.wrap(3).v + wrap(4).v + C.mk(5).v * 10; } }\n', 57],
    // group_by and distinct_by keys: distinct types, integer enums, host values, a generic key.
    ['using JS from std:JS;\ntype Uid = distinct I32;\ntype Big = distinct U64;\nenum(U8) Lv:\n    | Lo\n    | Hi\nmod G[K] {\n    fn count(xs: Array[K]) I32 { (xs group_by(K, K) |r| { r; }).len(); }\n}\nexport lib { fn run() I32 {\n    let g = [Uid.from_i32(1), Uid.from_i32(2), Uid.from_i32(1)] group_by(Uid, Uid) |r| { r; };\n    let gb = [Big.from_u64(5), Big.from_u64(5)] group_by(Big, Big) |r| { r; };\n    let ls = [Lv.Lo, Lv.Hi, Lv.Lo];\n    let d = ls distinct_by(Lv, Lv) |r| { r; };\n    let m = new JS.Map();\n    let ms: Array[JS.Map] = [m, new JS.Map(), m];\n    let hm = ms group_by(JS.Map, JS.Map) |r| { r; };\n    g.len() * 10000 + gb.len() * 1000 + d.len() * 100 + hm.len() * 10 + G[I32].count([1, 2, 1, 3]);\n} }\n', 21223],
    // Branches of different variants join to their enum; null and a Str to ?Str.
    ['enum Sh:\n    | C { r: I32 }\n    | R { w: I32 }\n    | T { h: I32 }\nfn area(s: Sh) I32 { alt s { C |c| => c.r, R |r| => r.w * 2, T |t| => t.h * 3, }; }\nfn pick(n: I32) Sh { let s = if n == 0 { C { r: 1 }; } else if n == 1 { R { w: 1 }; } else { T { h: 1 }; }; s; }\nexport lib { fn run() I32 {\n    let k = 2;\n    let m = match k { 1 => C { r: 5 }, 2 => R { w: 5 }, ~> T { h: 5 }, };\n    let s = if k > 5 { null; } else { "a"; };\n    area(pick(0)) + area(pick(1)) + area(pick(2)) + area(m) + (if s == null { 0; } else { 100; });\n} }\n', 116],
    // Tag.from_i32 of a value a variant has, in an enum with gaps.
    ['enum(I32) Gap:\n    | A = 1\n    | B = 5\nexport lib { fn run() I32 { Gap.from_i32(5).to_i32() + Gap.from_i32(1).to_i32(); } }\n', 6],
    // A computed global in a program with no `export main` (it crashed the compiler).
    ['let n: I32 = 1 + 1;\nlet k: cl() I32 = cl() { n * 10; };\nexport lib { fn run() I32 { k() + n; } }\n', 22],
    // A closure in a generator has its own try, errdefer, and return.
    ['fn parse(s: Str) Result[I32, Str] { if s == "x" { Result[I32, Str].err("bad"); } else { Result[I32, Str].ok(s.len()); }; }\nfn g(n: I32) yield I32 {\n    let f = cl(s: Str) Result[I32, Str] { errdefer { n; }; let v = try parse(s); Result[I32, Str].ok(v + n); };\n    let r = cl(k: I32) I32 { if k > 1 { return 100; }; k; };\n    yield f("abc").value();\n    yield r(5);\n    yield r(1);\n}\nexport lib { fn run() I32 { let s = 0; for (g(10)) |v| { s += v; }; s; } }\n', 114],
    // `&` in a protocol member's type arguments.
    ['proto Big:\n    | biggest(Array[&]) &\nstruct N[Big]:\n    | v: I32\nfn Big[N].biggest |a| (xs: Array[N]) N { let b = a; for (xs) |x| { if x.v > b.v { b = x; }; }; b; }\nmod Pick[T[Big]] {\n    fn top(a: T, xs: Array[T]) T { a.biggest(xs); }\n}\nexport lib { fn run() I32 { let xs: Array[N] = [N { v: 3 }, N { v: 9 }]; Pick[N].top(N { v: 1 }, xs).v + Pick[N].top(N { v: 20 }, xs).v; } }\n', 29],
    // A generic mod's globals that do not depend on T; unused generators, checked and dropped.
    ['mod Arr[T] {\n    let k: I32 = 3;\n    let s: Str = "ab" + "c";\n    fn count(xs: Array[T]) I32 { xs.len() + k + s.len(); }\n}\nstruct P:\n    | x: I32\nfn g(n: I32, p: P) yield I32 { defer { n; }; let f = cl() I32 { n + p.x; }; for (0 ..< n) |i| { if i > 3 { return; }; yield f() + i; }; }\nfn walk(n: I32) yield I32 { if n > 0 { for (walk(n - 1)) |v| { yield v; }; }; yield n; }\nfn P.each |q| () yield I32 { yield q.x; }\nexport lib { fn run() I32 { Arr[I32].count([1, 2]) + Arr[F64].count([1.0]); } }\n', 15],
    // A generic mod's globals, one per instance: `Buffer[T]`, read through each kind of alias.
    ['using Buffer from std:Buffer;\nmod Stash[T] {\n    let items: Buffer[T] = Buffer[T].new();\n    fn add(x: T) void { items.push(x); }\n    fn size() I32 { items.len(); }\n}\nusing Stash[I32] |S|;\nusing Stash[Str] |s|;\nexport lib { fn run() I32 { Stash[I32].add(1); S.add(2); Stash[Str].add("a"); Stash[I32].size() * 100 + Stash[Str].size() * 10 + s.items.len(); } }\n', 211],
    // Per instance: `?T`, `Array[T]`, the mod's own types and functions, one global from another, and one without T.
    ['struct P:\n    | x: I32\nmod Box[T] {\n    struct &:\n        | v: T\n    struct Tag:\n        | k: I32\n    let item: Array[?T] = [null];\n    let all: Array[T] = [];\n    let made: Array[I32] = [0];\n    let base: I32 = start() + 1;\n    let twice: I32 = base * 2;\n    let tag: Tag = Tag { k: twice };\n    let none: ?& = null;\n    fn start() I32 { 10; }\n    fn put(x: T) void { item[0] = x; made[0] += 1; }\n    fn empty() Bool { item[0] == null and none == null; }\n    fn total() I32 { all.len() + made[0] * 1000 + tag.k; }\n}\nexport lib { fn run() I32 {\n    Box[P].put(P { x: 1 });\n    Box[P].put(P { x: 2 });\n    Box[Str].put("a");\n    let e = (if Box[P].empty() { 1; } else { 0; }) + (if Box[Array[I32]].empty() { 10; } else { 0; });\n    Box[P].total() * 10 + Box[Str].total() + e * 100000;\n} }\n', 1021242],
    // A bounded mod's global.
    ['using Ord from std:Ord;\nusing Buffer from std:Buffer;\nmod Best[T[Ord]] {\n    let top: Buffer[T] = Buffer[T].new();\n    fn offer(x: T) void { if top.len() == 0 { top.push(x); } else if x.cmp(top.get_index(0)) > 0 { top.set_index(0, x); }; }\n    fn best(d: T) T { if top.len() == 0 { d; } else { top.get_index(0); }; }\n}\nexport lib { fn run() I32 { Best[I32].offer(3); Best[I32].offer(9); Best[I32].offer(4); Best[Str].offer("bb"); Best[Str].offer("a"); Best[I32].best(0) * 100 + Best[Str].best("").len() * 10 + Best[F64].best(1.0).to_i32(); } }\n', 921],
    // An iterator word in scope as a value is a value after return, continue, break label, yield and defer.
    ['let log: Array[I32] = [0];\n'
      + 'fn count(n: I32) void { log[0] += n; }\n'
      + 'fn params(count: I32, sum: I32, product: I32) I32 { return count + sum * product; }\n'
      + 'fn local() I32 { let count: I32 = 5; let sum: I32 = count; return sum; }\n'
      + 'fn scaled(product: I32) I32 { return product * 2; }\n'
      + 'fn brk(sum: I32) I32 { outer: { break outer sum; }; }\n'
      + 'fn gen(count: I32) yield I32 { yield count; }\n'
      + 'fn steps(count: I32) I32 { let hits = 0; loop match 0 { 0 => { hits += 1; continue count; }, 3 => { hits += 10; break; }, ~> break, }; hits; }\n'
      + 'fn deferred() I32 { defer count(100); return 1; }\n'
      + 'fn piped() I32 { let xs = [1, 2, 3]; return xs count; }\n'
      + 'export lib { fn run() I32 { let t = 0; for (gen(6)) |v| { t += v; }; params(1, 2, 3) + local() + scaled(4) + brk(9) + t + steps(3) + deferred() + piped() + log[0]; } }\n', 150],
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

  // A defer that throws lets the older ones run, newest first, at every
  // exit and while unwinding, without running any twice; the newest
  // exception goes on. Each digit is a mark; e<n> the exception caught.
  const throwing = await write(String.raw`let boom: fun(I32) void = @es/\ (n) => { if (n >= 0) { globalThis.__err = "e" + n; throw new Error("e" + n); } } \/;
let mark: fun(I32) void = @es/\ (s) => { globalThis.__log = (globalThis.__log ?? "") + s; } \/;
let log: fun() Str = @es/\ () => { const s = (globalThis.__err ?? "") + ":" + (globalThis.__log ?? ""); globalThis.__log = ""; globalThis.__err = ""; return s; } \/;
fn ends() I32 { defer mark(1); defer boom(0); defer mark(3); 5; }
fn returns(x: I32) I32 { defer mark(1); defer boom(0); defer mark(3); if x > 0 { return 7; }; 5; }
fn unwinds() I32 { defer mark(1); defer boom(0); defer mark(3); boom(9); 5; }
fn loops() I32 { let i = 0; while (i < 3) { defer mark(1); defer boom(i); defer mark(3); i += 1; if i == 1 { continue; }; break; }; 5; }
fn inner() I32 { defer mark(1); { defer boom(2); defer mark(3); mark(4); }; mark(5); 6; }
fn both() I32 { defer mark(1); defer boom(0); defer boom(1); 5; }
fn after() I32 { defer mark(1); defer boom(2); boom(3); 5; }
fn small(i: I32) I32 { defer mark(1); defer boom(if i == 0 { 0; } else { -1; }); if i == 2 { boom(5); }; i; }
fn rounds() I32 { let n = 0; for (0 ..< 3) |i| { n += try { small(i); } catch |e| { mark(9); 0; }; }; n; }
fn caught(x: I32) I32 {
    defer mark(1);
    let r = try { { defer boom(x); defer mark(2); return 4; }; } catch |e| { mark(7); 8; };
    mark(6);
    boom(x + 10);
    r;
}
fn nested() I32 { defer mark(1); defer { defer mark(2); boom(0); mark(3); }; mark(4); 5; }
fn closure() I32 { let c = cl() I32 { defer mark(1); defer boom(0); defer mark(3); 5; }; c(); }
fn calm() I32 { let t = 0; defer mark(1); { defer mark(2); t += 1; }; for (0 ..< 2) |i| { defer mark(3); if i == 0 { continue; }; t += 10; }; t; }
fn run_one(k: I32) I32 {
    match k {
        0 => ends(), 1 => returns(1), 2 => unwinds(), 3 => loops(), 4 => inner(), 5 => both(),
        6 => after(), 7 => rounds(), 8 => caught(0), 9 => nested(), 10 => closure(), ~> calm(),
    };
}
export lib { fn run() Str {
    let s = "";
    for (0 ..< 12) |k| { let r = try { run_one(k); } catch |e| { -1; }; s = s + r.to_str() + log() + " "; };
    s;
} }
`);
  for (const mode of modes) {
    const built = await compileFile(utu, throwing, { mode });
    assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
    assert.equal((await instantiateNode(built.wasm, built.spec)).exports.run(),
      '-1e0:31 -1e0:31 -1e0:31 -1e1:31 -1e2:431 -1e0:1 -1e2:1 1e5:19119 -1e10:2761 -1e0:421 -1e0:31 11:2331 ', mode);
    checked++;
  }

  // An @es body bound to a fun or cl type that is not plainly a function is
  // tested as the glue loads: one that is no function fails there, named.
  for (const [source, message] of [
    ['let f: fun(I32) I32 = @es/\\ 5 \\/;\nexport lib { fn run() I32 { f(1); } }\n', /f: @es gave number, not a function/],
    ['let g: fun(Bool) I32 = @es/\\ ({upper: 1}) \\/;\nexport lib { fn run() I32 { g(true); } }\n', /g: @es gave object, not a function/],
    ['let c: cl(I32) I32 = @es/\\ null \\/;\nexport lib { fn run() I32 { c(1); } }\n', /c: @es gave null, not a function/],
    ['let a: fun(I32) I32 = @es/\\ Math.abs \\/;\nlet b: fun(Bool) I32 = @es/\\ [b => b ? 2 : 3][0] \\/;\nexport lib { fn run() I32 { a(-5) * 10 + b(true); } }\n', null],
  ]) {
    const file = await write(source);
    for (const mode of ['debug', 'small']) {
      const built = await compileFile(utu, file, { mode });
      assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
      if (message) await assert.rejects(() => instantiateNode(built.wasm, built.spec), message, mode);
      else assert.equal((await instantiateNode(built.wasm, built.spec)).exports.run(), 52, mode);
      checked++;
    }
  }

  // A generic mod's globals from another file, one per instance.
  await fs.writeFile(path.join(dir, 'counter.utu'), 'mod Counter[T] {\n    let n: Array[I32] = [0];\n    let seen: Array[T] = [];\n    fn bump() void { n[0] += 1; }\n    fn get() I32 { n[0] + seen.len(); }\n}\n');
  const counted = await write('using Counter from "./counter.utu";\nexport lib { fn run() I32 { Counter[I32].bump(); Counter[I32].bump(); Counter[Str].bump(); Counter[I32].get() * 10 + Counter[Str].get(); } }\n');
  for (const mode of modes) {
    const built = await compileFile(utu, counted, { mode });
    assert.equal((await instantiateNode(built.wasm, built.spec)).exports.run(), 21, `${mode}: ${built.diagnostics?.map(d => d.message)}`);
    checked++;
  }

  // A computed value stored into a narrow mem wraps (a literal past it is an error).
  const wrapped = await write('mem m: U8;\nmem n: I8;\nvec v: U16;\nvec w: U8;\nexport lib { fn run() I32 {\n    let big = 256;\n    m.push(big); m.push(0 - 1); n.push(big - 385); v.push(big * 273 + 112); w.push(-big + 255);\n    m[0] += 250; m[0] += 250; w[0] = big + 3;\n    m[0] * 1000000 + m[1] * 10000 + n[0] + 1000 + v[0] + w[0];\n} }\n');
  for (const mode of modes) {
    const built = await compileFile(utu, wrapped, { mode });
    assert.equal((await instantiateNode(built.wasm, built.spec)).exports.run(), 246555594, `${mode}: ${built.diagnostics?.map(d => d.message)}`);
    checked++;
  }

  // A mem resized below zero traps, where the build checks.
  const resized = await write('mem m: I32;\nexport lib { fn run() I32 { m.push(1); m.resize(-1); m.len(); } }\n');
  for (const mode of ['debug', 'small', 'fast']) {
    const built = await compileFile(utu, resized, { mode });
    const { exports } = await instantiateNode(built.wasm, built.spec);
    assert.throws(() => exports.run(), `${mode}: resize(-1)`);
    checked++;
  }

  // An index past a mem's or vec's length (or negative) traps where the build
  // checks, as an array's does: reads, stores, and `op=` (a store past it once
  // succeeded, the length unchanged). Unsafe builds check only the capacity.
  for (const [kind, type] of [['mem', 'U8'], ['mem', 'I32'], ['vec', 'U8'], ['vec', 'I32']]) {
    const bounded = await write(`${kind} b: ${type};\nfn fill() void { b.clear(); b.reserve(16); b.push(9); b.push(9); b.push(9); }\nexport lib {\n    fn read(i: I32) I32 { fill(); b[i]; }\n    fn store(i: I32) I32 { fill(); b[i] = 77; b[i] + 1000 * b.len(); }\n    fn bump(i: I32) I32 { fill(); b[i] += 5; b[i] + 1000 * b.len(); }\n    fn bump_at(i: I32) I32 { fill(); let k = [i]; b[k[0]] -= 2; b[k[0] + 0] + 1000 * b.len(); }\n}\n`);
    for (const mode of modes) {
      const built = await compileFile(utu, bounded, { mode });
      const { exports } = await instantiateNode(built.wasm, built.spec);
      const what = `${kind} ${type} ${mode}`;
      assert.equal(exports.read(2), 9, what);
      assert.equal(exports.store(2), 3077, what);
      assert.equal(exports.bump(2), 3014, what);
      assert.equal(exports.bump_at(2), 3007, what);
      for (const f of ['read', 'store', 'bump', 'bump_at']) {
        assert.throws(() => exports[f](-1), /out of bounds/, `${what}: ${f}(-1)`);
        if (mode.endsWith('Unsafe')) continue;
        assert.throws(() => exports[f](3), /out of bounds/, `${what}: ${f}(3)`);
        assert.throws(() => exports[f](15), /out of bounds/, `${what}: ${f}(15)`);
      }
      if (mode.endsWith('Unsafe')) {
        // Unchecked: within the capacity, and the length unchanged.
        assert.equal(exports.store(3), 3077, what);
        const before = exports.read(4);
        assert.equal(exports.bump(4), 3000 + ((before + 5) & (type === 'U8' ? 255 : -1)), what);
      }
      checked++;
    }
  }

  // resize(n) zero-fills what it exposes (stale elements once showed), and a
  // store checks its index against the length after its value: a value that
  // pushes (a vec's array then replaced) can make the index valid.
  for (const [kind, type, init] of [['mem', 'U8', ''], ['mem', 'I32', ' = [3, 4]'], ['mem', 'I64', ''], ['mem', 'F64', ''], ['vec', 'U8', ' = [1, 2]'], ['vec', 'I16', ''], ['vec', 'I32', ''], ['vec', 'F32', '']]) {
    const five = type.startsWith('F') ? '5.0' : '5';
    const zero = type.startsWith('F') ? '0.0' : '0';
    const value = type === 'U8' || type === 'I16' ? 'I32' : type;
    const grown = await write(`${kind} b: ${type}${init};\nfn bump() ${value} { for (0 ..< 40) |k| { b.push(${zero}); }; ${five}; }\nexport lib {\n    fn regrow() I32 { b.clear(); b.resize(3); let a = b[0] == ${zero} and b[2] == ${zero}; b[1] = ${five}; b.resize(1); b.resize(2); if a and b[1] == ${zero} and b.len() == 2 { 1; } else { 0; }; }\n    fn late() I32 { b.clear(); b.push(${zero}); b[1] = bump(); b[40] = ${five}; if b[1] == ${five} and b[40] == ${five} { b.len(); } else { 0; }; }\n}\n`);
    for (const mode of modes) {
      const built = await compileFile(utu, grown, { mode });
      const { exports } = await instantiateNode(built.wasm, built.spec);
      const what = `${kind} ${type}${init} ${mode}`;
      assert.equal(exports.regrow(), 1, `${what}: regrow`);
      assert.equal(exports.late(), 41, `${what}: late`);
      assert.equal(exports.regrow(), 1, `${what}: regrow after late`);
      checked++;
    }
  }
  // The same of a mem the host makes (copy_in).
  const hosted = await write('using JS from std:JS;\nmem text: U8;\nexport lib {\n    fn load(bytes: JS.Uint8Array) I32 { text.copy_in(bytes); text.len(); }\n    fn regrow() I32 { text.clear(); text.resize(4); text[0] + text[3] + text.len(); }\n}\n');
  for (const mode of modes) {
    const built = await compileFile(utu, hosted, { mode });
    const { exports } = await instantiateNode(built.wasm, built.spec);
    assert.equal(exports.load(new Uint8Array(100).fill(32)), 100, `${mode}: copy_in`);
    assert.equal(exports.regrow(), 4, `${mode}: a hosted mem's resize zero-fills`);
    checked++;
  }

  // A slice ending before it starts traps, and `orelse fatal` on null, in every mode.
  const traps = await write('export lib {\n    fn reversed() I32 { let a = [1, 2, 3]; a[2, 1].len(); }\n    fn none() I32 { let s: ?Str = null; (s orelse fatal).len(); }\n}\n');
  for (const mode of ['debug', 'small', 'fast', 'smallUnsafe', 'fastUnsafe']) {
    const built = await compileFile(utu, traps, { mode });
    const { exports } = await instantiateNode(built.wasm, built.spec);
    assert.throws(() => exports.reversed(), WebAssembly.RuntimeError, `${mode}: reversed slice`);
    assert.throws(() => exports.none(), WebAssembly.RuntimeError, `${mode}: orelse fatal`);
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
    // Str's order (by code units), I32's and I64's min, max, abs, and a protocol's own function called as a method.
    [`proto Shape:
    | area() I32
struct Sq[Shape]:
    | s: I32
fn Shape[Sq].area |q| () I32 { q.s * q.s; }
fn Shape.twice |s| () I32 { s.area() * 2; }
export lib {
    fn order() Str { ",".join(["bo", "Al", "al", "b"] sort(Str) |a, b| { a < b; }); }
    fn cmp() I32 { Str.compare("a", "b") * 100 + Str.compare("b", "b") * 10 + Str.compare("c", "b"); }
    fn tests() Bool { "a" <= "a" and "b" > "a" and "B" < "a" and "ab" >= "a"; }
    fn ints() I32 { I32.min(3, -4) * 100 + I32.max(3, -4) * 10 + I32.abs(-7); }
    fn longs() I64 { I64.abs(-9.to_i64()) + I64.max(2.to_i64(), 5.to_i64()); }
    fn proto_method() I32 { let s: Shape = Sq { s: 3 }; s.twice(); }
}`, { order: 'Al,al,b,bo', cmp: -99, tests: true, ints: -363, longs: 14n, proto_method: 18 }],
    // Calls in a loop's body (unrolled -O fast only when the inlined copies
    // stay small), and locals sharing slots through loops (-O fast's coalescing).
    [`fn step(x: I32) I32 {
    let t = x * 3;
    t ^ (t >> 2);
}
fn spread(x: I32) I32 {
    let s = 0;
    for (0 ..< 4) |k| { s += step(x + k); };
    s;
}
export lib {
    fn calls() I32 {
        let s = 0;
        for (0 ..< 11) |i| { s += step(i) + spread(i); };
        s;
    }
    fn last_set() I32 {
        let found = -1;
        for (0 ..< 10) |i| {
            if i > 6 { break; };
            let v = i * 7;
            let w = v + 1;
            found = w;
        };
        found;
    }
    fn nested() I32 {
        let total = 0;
        for (0 ..< 5) |i| {
            let base = i * 10;
            for (0 ..< 3) |j| {
                let x = base + j;
                let y = x * 2;
                total += y - x;
            };
            let after = base + 1;
            total += after;
        };
        total;
    }
}`, { calls: 1096, last_set: 43, nested: 420 }],
    // Literals under operators, left of a typed operand, take its type as one
    // literal does (once I32: "No + for I32 and I64").
    [`fn a(x: I64) I64 { let k = (1 + 2) + x; k; }
fn b(x: U32) Bool { (1 + 2) < x; }
fn c(x: I64) Bool { ((1 ^ 2) | x) == 3; }
fn d(x: I64) Bool { (0 - 4294967296) + x >= 0; }
fn e(x: U64) U64 { ((1 << 40) - -(2 * 3)) + x; }
fn g(x: I64) I64 { -(1 + 2) * x + (4 / 2); }
export lib {
    fn sum() I64 { a(5); }
    fn less() Bool { b(4); }
    fn bits() Bool { c(1); }
    fn wide() Bool { d(4294967296) and not d(4294967295); }
    fn unsigned() U64 { e(1); }
    fn float() F64 { let x: F64 = 0.5; (1 + 2) * x; }
    fn negated() I64 { g(2); }
    fn both() I32 { let k = (1 + 2) + 3; k; }
}`, { sum: 8n, less: true, bits: true, wide: true, unsigned: 1099511627783n, float: 1.5, negated: -4n, both: 6 }],
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
}`, { depth: 'nested too deeply at line 1, column 4098', negzero: -Infinity, level: '{"l":"High"}', lone: '["\\ud800"]', range: 'unknown Level variant "Mid" at line 1, column 6' },
      { literal: [['{"a":"q\\"t"}', 'quote'], ['{"q\\"k":1}', 'key'], ['{"b":100000}', 'exp'], ['{"plan":{}}', 'plan'], ['{}', 'x,y']] }],
    // A recursive enum's encode: past its alt's tested arms, no instruction runs first (first_run -1); size builds indexed it and trapped.
    [`enum Expr:
    | Num { v: I32 }
    | Add { l: Expr }
    | Many { xs: Array[Expr] }
export lib {
    fn num() Str { @json/\\ encode Expr Num { v: 2 } \\/; }
    fn deep() Str { @json/\\ encode Expr Add { l: Add { l: Num { v: 3 } } } \\/; }
    fn many() Str { @json/\\ encode Expr Many { xs: Array[Expr].new(1, Num { v: 4 }) } \\/; }
}`, { num: '{"kind":"Num","v":2}', deep: '{"kind":"Add","l":{"kind":"Add","l":{"kind":"Num","v":3}}}', many: '{"kind":"Many","xs":[{"kind":"Num","v":4}]}' }],
    // An alt in a function called once, given a variant: inlined, the value's type narrowed to it, and size builds' br_on_cast took that as its input (not a supertype of the other arms' casts).
    [`enum E:
    | A { x: I32 }
    | B { y: I32 }
fn f(e: E) I32 {
    alt e {
        A |a| => a.x,
        B |b| => b.y,
    };
}
export main() I32 { f(A { x: 1 }); }`, { main: 1 }],
    [`enum E:
    | A { x: I32 }
    | B { y: I32 }
    | C { z: I32 }
    | D { w: I32 }
fn f(e: E) I32 {
    alt e {
        A |a| => a.x,
        B |b| => b.y,
        C |c| => c.z,
        D |d| => {
            let t = d.w * 2;
            t + 1;
        },
    };
}
export main() I32 { f(D { w: 4 }); }`, { main: 9 }],
    [`enum E:
    | A { x: I32 }
    | B { y: I32 }
fn f(e: ?E) I32 {
    alt e orelse A { x: 9 } {
        A |a| => a.x,
        B |b| => b.y,
    };
}
export main() I32 { let o: ?E = B { y: 6 }; f(o); }`, { main: 6 }],
    [`proto P:
    | get x: I32
    | total() I32
enum E[P]:
    | A { x: I32 }
    | B { x: I32, y: I32 }
fn P[A].total |self| () I32 { self.x; }
fn P[B].total |self| () I32 { self.x + self.y; }
fn g(e: E) I32 {
    alt e {
        A |a| => a.x,
        B |b| => b.y * 10,
    };
}
fn f(p: P, e: E) I32 { p.total() + p.x + g(e); }
export main() I32 { let b = B { x: 2, y: 5 }; f(b, b); }`, { main: 59 }],
    // An alt on an arm's binding: the arm's value (on the stack, its br_on_cast's) was teed into the inner alt's value, inside its blocks.
    [`enum E:
    | A { x: I32 }
    | B { y: I32 }
enum F:
    | G { e: E }
    | H { n: I32 }
fn f(v: F) I32 {
    alt v {
        G |g| => alt g.e {
            A |a| => a.x,
            B |b| => b.y,
        },
        H |h| => h.n,
    };
}
export main() I32 { f(G { e: B { y: 7 } }); }`, { main: 7 }],
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
  // Tuple results convert at the boundary as scalar ones do; safe builds
  // check export lib arguments and Tag.from_i32; unsafe builds do not.
  const edges = await write(`struct P:
    | x: I32
enum(U8) Lv:
    | Lo
    | Hi
export lib {
    fn trio() .{U32, Bool, U64} { .{4294967295, true, 18446744073709551615}; }
    fn keep(s: Str) Str { s; }
    fn absent(s: ?Str) Bool { s == null; }
    fn px(p: P) I32 { p.x; }
    fn mk() P { P { x: 7 }; }
    fn lv(i: I32) I32 { Lv.from_i32(i).to_i32(); }
    fn flag(b: Bool) Str { if b { "y"; } else { "n"; }; }
}`);
  for (const mode of ['small', 'fast', 'smallUnsafe', 'fastUnsafe', 'debug']) {
    const built = await compileFile(utu, edges, { mode });
    const { exports } = await instantiateNode(built.wasm, built.spec);
    assert.deepEqual(exports.trio(), [4294967295, true, 18446744073709551615n], mode);
    assert.equal(exports.px(exports.mk()), 7);
    assert.equal(exports.absent(null), true);
    if (mode.endsWith('Unsafe')) {
      assert.equal(exports.keep(42), 42, mode);
      assert.equal(exports.lv(99), 99, mode);
    } else {
      assert.throws(() => exports.keep(42), /keep: argument 1 must be a string, not number/, mode);
      assert.equal(exports.absent(undefined), true, mode);
      assert.throws(() => exports.absent(5), /must be a string or null/, mode);
      assert.throws(() => exports.px(null), /px: argument 1 must be a value, not null/, mode);
      assert.throws(() => exports.lv(99), WebAssembly.RuntimeError, mode);
    }
    assert.equal(exports.lv(1), 1);
    // A Bool argument is JS truthiness, in every build.
    assert.equal([0.5, 'x', {}, 1, true, 0, '', null, undefined, NaN, false].map(v => exports.flag(v)).join(''), 'yyyyynnnnnn', mode);
    checked++;
  }

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
    // A literal stored into a narrow mem must fit it, as in its initializer.
    ['mem m: U8;\nexport lib { fn run() I32 { m.push(256); m[0]; } }\n', '256 does not fit U8'],
    ['mem m: U8;\nexport lib { fn run() I32 { m.push(-1); m[0]; } }\n', '-1 does not fit U8'],
    ['mem m: I8;\nexport lib { fn run() I32 { m.push(-129); m[0]; } }\n', '-129 does not fit I8'],
    ['vec v: U16;\nexport lib { fn run() I32 { v.push(70000); v[0]; } }\n', '70000 does not fit U16'],
    ['vec v: U8;\nexport lib { fn run() I32 { v.push(-1); v[0]; } }\n', '-1 does not fit U8'],
    ['mem m: I16;\nexport lib { fn run() I32 { m.push(0); m[0] = 32768; m[0]; } }\n', '32768 does not fit I16'],
    ['vec v: U8;\nexport lib { fn run() I32 { v.push(0); v[0] = 256; v[0]; } }\n', '256 does not fit U8'],
    ['mem m: U8;\nexport lib { fn run() I32 { m.push(0); m[0] += 300; m[0]; } }\n', '300 does not fit U8'],
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
    // A getter and a setter of one name on two lines must agree; any other repeat is a duplicate.
    ['proto Sh:\n    | get size: I32\n    | set size: F64\nstruct Sq[Sh]:\n    | size: I32\nexport lib { fn run() I32 { 0; } }\n', 'Sh.size gets I32 but sets F64'],
    ['proto Sh:\n    | get size: I32\n    | get set size: I32\nstruct Sq[Sh]:\n    | size: I32\nexport lib { fn run() I32 { 0; } }\n', 'Duplicate declaration size'],
    // A member through a protocol value, an implementer lacking it (getter and setter crashed the compiler).
    ['proto C:\n    | get n: I32\nstruct A[C]:\n    | n: I32\nstruct B[C]:\n    | m: I32\nexport lib { fn run() I32 { let c: C = B { m: 1 }; c.n; } }\n', 'B lacks C.n'],
    ['proto C:\n    | get set n: I32\nstruct A[C]:\n    | n: I32\nstruct B[C]:\n    | m: I32\nexport lib { fn run() I32 { let c: C = B { m: 1 }; c.n = 5; c.n += 1; 0; } }\n', 'B lacks C.n'],
    ['proto C:\n    | step() I32\nstruct A[C]:\n    | n: I32\nstruct B[C]:\n    | m: I32\nfn C[A].step |a| () I32 { a.n; }\nexport lib { fn run() I32 { let c: C = B { m: 1 }; c.step(); } }\n', 'B lacks C.step'],
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
    // Arms of one value, and enum variants without one, found by value.
    ['fn f(x: I32) I32 { match x { 1 => 1, 2 => 2, 1 => 3, ~> 0, }; }\nexport main() I32 { f(1); }\n', 'Duplicate pattern 1'],
    // A name twice in one module, or one T's protocol method twice (std's too): last one won.
    ['mod M { fn f() I32 { 1; } fn f() I32 { 2; } fn get() I32 { f(); } }\nexport main() I32 { M.get(); }\n', 'Duplicate declaration f'],
    ['mod M { let g: I32 = 3; let g: I32 = 4; fn get() I32 { g; } }\nexport main() I32 { M.get(); }\n', 'Duplicate declaration g'],
    ['mod M[T] { fn f() I32 { 1; } fn f() I32 { 2; } fn get() I32 { f(); } }\nexport main() I32 { M[I32].get(); }\n', 'Duplicate declaration f'],
    // A using's name is the file's: its own mod, fn, or type of that name is reported (the using won silently).
    ['using console from std:Console;\nmod console { fn f() I32 { 3; } }\nexport main() I32 { console.f(); }\n', 'Duplicate declaration console'],
    ['mod console { fn f() I32 { 3; } }\nusing console from std:Console;\nexport main() I32 { console.f(); }\n', 'Duplicate declaration console'],
    ['mod Stack[T] { fn f() I32 { 1; } }\nusing Stack[I32] |W|;\nstruct W:\n    | a: I32\nexport main() I32 { 0; }\n', 'Duplicate declaration W'],
    ['mod Stack[T] { fn f() I32 { 1; } }\nusing Stack[I32] |W|;\nusing Stack[Str] |W|;\nexport main() I32 { 0; }\n', 'Duplicate declaration W'],
    ['proto P:\n    | m(&) I32\nstruct S[P]:\n    | v: I32\nfn P[S].m |a| (b: S) I32 { 1; }\nfn P[S].m |a| (b: S) I32 { 2; }\nexport main() I32 { 0; }\n', 'Duplicate method P[S].m'],
    ['using Ord from std:Ord;\nusing Order from std:Ord;\nfn Ord[Str].cmp |a| (b: Str) I32 { a.len() - b.len(); }\nexport main() Str { Order[Str].max_of(["aaaa", "b", "cc"]); }\n', 'Duplicate method Ord[Str].cmp'],
    [`enum(U8) Many:\n${variants}\nfn f(m: Many) I32 { match m {\n${covered.split('\n').filter(l => !l.includes('V17 ')).join('\n')}\n}; }\nexport main() I32 { f(Many.V1); }\n`, 'match misses Many.V17'],
    // try and errdefer: a Result, in a function returning one with the same error type.
    ['fn f() Result[I32, Str] { let x = try 5; Result[I32, Str].ok(x); }\nexport main() I32 { f().value(); }\n', 'try needs a Result, not I32'],
    ['fn g() Result[I32, I32] { Result[I32, I32].ok(1); }\nfn f() Result[I32, Str] { Result[I32, Str].ok(try g()); }\nexport main() I32 { f().value(); }\n',
      "try passes on I32; the function's errors are Str"],
    ['fn g() Result[I32, Str] { Result[I32, Str].ok(1); }\nfn f() I32 { try g(); }\nexport main() I32 { f(); }\n', 'try in a function returning I32, not a Result'],
    ['fn f() I32 { errdefer f(); 2; }\nexport main() I32 { f(); }\n', 'errdefer in a function returning I32, not a Result'],
    ['fn g() Result[I32, Str] { Result[I32, Str].ok(1); }\nfn gen() yield I32 { yield try g(); }\nfn f() Result[I32, Str] { let s = 0; for (gen()) |v| { s += v; }; Result[I32, Str].ok(s); }\nexport main() I32 { f().value(); }\n',
      'try in a generator'],
    ['fn g() Result[I32, Str] { Result[I32, Str].ok(1); }\nfn f() Result[I32, Str] { defer { try g(); }; g(); }\nexport main() I32 { f().value(); }\n', 'try in defer'],
    ['export main() I32 { let r = Result[I32, Str].ok(1); r._value; }\n', 'Result has no field _value'],
    ['export main() I32 { let r: Result[I32, Str] = &{ _ok: true, _value: 1 }; 0; }\n', 'Result[I32, Str] is made by its own functions'],
    // Real programs' mistakes, said as what to write.
    ['fn f() I32 {\n    let t = 0;\n    for i in 0..10 { t += i; };\n    t;\n}\n', 'Write for (0 ..< 10) |i|, not for i in'],
    ['let INF = 1;\n', 'Names of values and functions start lowercase (a capital starts a type)'],
    ['fn F() I32 { 1; }\n', 'Names of values and functions start lowercase (a capital starts a type)'],
    ['fn f() I32 {\n    let i = 0;\n    i++;\n    i;\n}\n', 'utu has no ++; write += 1'],
    ['fn f(s: Str) I32 { match s { "+" => 1, ~> 0, }; }\n', 'match takes number, Bool, and enum patterns, not strings'],
    ['fn f() Bool { true and (0 ..< 5) all |i| { i < 9; }; }\n', 'A pipeline binds looser than and: its source is all of this'],
    // A closure the host calls cannot suspend: JSPI cannot suspend through the host's frame.
    ['let each: fun(cl(I32) void) void = @es/\\ (f) => f(1) \\/;\nlet later: fun(I32) Promise[I32] = @es/\\ (v) => Promise.resolve(v) \\/;\nexport main() void { each(cl(v) { let w: I32 = await later(v); }); }\n',
      'A closure the host calls cannot await'],
    // @comptime and the other DSLs (each crashed, hung, or passed silently).
    ['fn tab() Array[I32] { [t.len()]; }\nconst mem t: I32 = @comptime/\\ tab() \\/;\nexport main() I32 { t[0]; }\n', '@comptime t reads itself'],
    ['fn f() Array[I32] { [u.len()]; }\nfn g() Array[I32] { [t.len()]; }\nconst mem t: I32 = @comptime/\\ f() \\/;\nconst mem u: I32 = @comptime/\\ g() \\/;\nexport main() I32 { t[0]; }\n', '@comptime t reads u, which waits on it'],
    ['fn f() Array[I32] { while (true) { }; [1]; }\nconst mem t: I32 = @comptime/\\ f() \\/;\nexport main() I32 { t.len(); }\n', '@comptime t trapped: it ran too long (a hundred million loop rounds)'],
    ['const mem t: I32 = @comptime/\\ [1, 2] ; __comptime_t.push(99) \\/;\nexport main() I32 { t.len(); }\n', "@comptime takes one expression: Expected ')', got ';'"],
    ['const mem a: U8 = @comptime/\\  \\/;\nexport main() I32 { a.len(); }\n', '@comptime needs an expression'],
    ['const mem a: U8 = @embed/\\ \\/;\nexport main() I32 { a.len(); }\n', '@embed needs a file path'],
    ['enum(U8) Color: | Red | Green | Blue\nconst mem cs: Color = [2, 7, 1];\nexport main() I32 { cs.len(); }\n', '7 is no Color'],
    ['enum(U8) Color: | Red | Green | Blue\nfn cs_() Array[I32] { [2, 7]; }\nconst mem cs: Color = @comptime/\\ cs_() \\/;\nexport main() I32 { cs.len(); }\n', '7 is no Color'],
    // A program's @ir: what the compiler would crash on, or not see, is a mistake at the body.
    ['fn f(a: I32) I32 { @ir/\\ <ir-array-len><ir-ident name="a"/></ir-array-len> \\/; }\nexport main() I32 { f(1); }\n', '@ir <ir-array-len> is written wrong here'],
    ['fn f(a: I32) I32 { @ir/\\ <ir-string-from-codes><ir-ident name="a"/></ir-string-from-codes> \\/; }\nexport main() I32 { f(1); }\n', '@ir <ir-string-from-codes> is written wrong here'],
    ['fn f(a: I32) I32 { @ir/\\ <ir-lit value="1"/> \\/; }\nexport main() I32 { f(1); }\n', '@ir <ir-lit> is written wrong here'],
    ['fn f(a: I32) I32 { @ir/\\ <ir-i32-eqz><ir-ident name="a"/></ir-i32-add> \\/; }\nexport main() I32 { f(1); }\n', '@ir body is empty or not well-formed IR'],
    ['fn f(a: I32) I32 { @ir/\\ <ir-ident name="a"/> junk \\/; }\nexport main() I32 { f(1); }\n', '@ir body is empty or not well-formed IR'],
    ['fn f(c: I32, a: I32) I32 { @wat/\\ local.get $a local.get $a local.get $c select (param i32) \\/; }\nexport main() I32 { f(1, 2); }\n', 'select takes only (result t)'],
    [`export main() I32 { ${'@utu/\\ '.repeat(17)}1${' \\/'.repeat(17)}; }\n`, 'DSLs nested too deeply (max 16)'],
    ['mod t7 {\n    mem m7: I32 = [5, 6];\n}\nexport main() I32 { 1; }\n', "Unexpected 'mem': a mem goes at the top level of a file"],
    ['struct P:\n    | name: Str\nexport main() Str { let a = @stored/\\ P "k" P { name: "x" } \\/; a.name; }\n', '@stored needs using Browser from std:Browser'],
    ['fn tab() Array[I32] { [main()]; }\nconst mem t: I32 = @comptime/\\ tab() \\/;\nexport main() I32 { 5; }\n', 'main is the entry point, not a function: move its body into a fn'],
    ['export lib {\n    fn f(x: ?I32) I32 { promote x { |v| => v, ~> 0 }; }\n}\n', 'Missing , after 0'],
    // A generic module's type with no type arguments (this built invalid Wasm).
    ['mod B[T] {\n    struct &:\n        | v: T\n}\nfn f(x: B) I32 { x.v; }\nexport lib { fn run() I32 { 0; } }\n', 'B takes 1 type arguments, given 0'],
    ['mod cell[T] {\n    struct Cell:\n        | v: T\n}\nfn f(x: cell.Cell) I32 { 0; }\nexport lib { fn run() I32 { 0; } }\n', 'cell takes 1 type arguments, given 0'],
    // An alias's instance: its fields have its types (this built invalid Wasm).
    ['mod B[T] {\n    struct &:\n        | v: T\n}\nusing B[I32] |bi|;\nexport lib { fn run() I32 { let c: bi = &{ v: "hello" }; c.v; } }\n', 'Field v is I32, got Str'],
    // null beside a scalar in an array literal (this built invalid Wasm).
    ['export lib { fn run() I32 { [1, null].len(); } }\n', 'I32 cannot be nullable'],
    ['export lib { fn run() I32 { [null].len(); } }\n', 'null needs a nullable type'],
    // An unfinished pipeline in chain(…).
    ['export lib { fn run() I32 { let xs = [1, 2]; xs chain(xs map |x| { x; }) sum; } }\n', 'Unfinished pipeline: map'],
    // A user type named I32 is not hashed as an integer (this built invalid Wasm).
    ['mod M {\n    struct I32:\n        | z: F64\n    fn mk() I32 { &{ z: 1.5 }; }\n}\nusing M;\nexport lib { fn run() F64 { let q: I32 = mk(); let xs = [q] group_by(I32, I32) |v| { v; }; q.z; } }\n', 'No == for I32'],
    // Two instances of one module opened.
    ['mod cell[T] {\n    struct Cell:\n        | value: T\n    fn wrap(value: T) Cell { Cell { value: value }; }\n}\nusing cell[I32];\nusing cell[Str];\nexport lib { fn run() I32 { 0; } }\n', 'cell[I32] is open already'],
    // x.m() with two protocols' m.
    ['proto Pa:\n    | name() Str\nproto Pb:\n    | name() Str\nstruct X[Pa, Pb]:\n    | id: I32\nfn Pa[X].name |x| () Str { "a"; }\nfn Pb[X].name |x| () Str { "b"; }\nexport lib { fn run() Str { X { id: 1 }.name(); } }\n', "name is both Pa's and Pb's"],
    // A protocol's implementation for one instance, which nothing would find.
    ['proto P:\n    | m() I32\nmod Box[T] {\n    struct &:\n        | v: T\n}\nfn P[Box[I32]].m |b| () I32 { 1; }\nexport lib { fn run() I32 { 0; } }\n', "Box's instances implement P together: fn P[&].m in Box"],
    // await where the module's start runs it, or where the host calls a named function.
    ['let d: fun(I32) Promise[I32] = @es/\\ (v) => Promise.resolve(v) \\/;\nlet later: I32 = await d(4);\nexport lib { fn run() I32 { later; } }\n', "A global's initializer cannot await"],
    ['let d: fun(I32) Promise[I32] = @es/\\ (v) => Promise.resolve(v) \\/;\nlet later: I32 = helper();\nfn helper() I32 { await d(3); }\nexport lib { fn run() I32 { later; } }\n', "A global's initializer cannot await"],
    ['let d: fun(I32) Promise[I32] = @es/\\ (v) => Promise.resolve(v) \\/;\nlet call: fun(fun() I32) I32 = @es/\\ (f) => f() \\/;\nfn waits() I32 { await d(3); }\nexport lib { fn run() I32 { call(waits); } }\n', 'A function the host calls cannot await'],
    // A generic mod's globals, one per instance: a cycle in one, or across two.
    ['mod C[T] {\n    let a: I32 = b + 1;\n    let b: I32 = a + 1;\n    fn get() I32 { a; }\n}\nexport lib { fn run() I32 { C[I32].get() + C[Str].get(); } }\n', 'Globals b and a each need the other set first'],
    ['mod P[T] {\n    let x: I32 = Q[Str].y() + 1;\n    fn get() I32 { x; }\n}\nmod Q[T] {\n    let y0: I32 = P[I32].get() + 1;\n    fn y() I32 { y0; }\n}\nexport lib { fn run() I32 { P[I32].get(); } }\n', 'Globals y0 and x each need the other set first'],
    ['mod Zero[T] {\n    let v: T = 0;\n    fn get() T { v; }\n}\nexport lib { fn run() I32 { Zero[I32].get() + Zero[Str].get().len(); } }\n', 'v is Str, got I32'],
    // A global first read where only its type is wanted: its mistakes still said.
    ['fn hi() Str { "hi"; }\nlet fs: Array[fun() Str] = [hi];\nexport lib { fn run() Str { fs[0](); } }\n', 'fun() Str cannot be stored; use cl() Str'],
    // An unused generator is checked.
    ['fn g() yield I32 { let a: I32 = "s"; yield a; }\nexport lib { fn run() I32 { 0; } }\n', 'a is I32, got Str'],
    // An unknown generic module called twice (it crashed the compiler).
    ['fn g() I32 { Nope[F64].x() + Nope[F64].x(); }\nexport lib { fn run() I32 { g(); } }\n', 'Unknown module Nope'],
    // -0.0 after 0.0.
    ['fn f(x: F64) I32 { match x { 0.0 => 1, -0.0 => 2, ~> 3, }; }\nexport lib { fn run() I32 { f(1.0); } }\n', 'Duplicate pattern -0.0'],
    // Literals under operators take the other operand's type, and must fit it.
    ['fn f(x: U32) U32 { (1 + 5000000000) + x; }\nexport lib { fn run() I32 { 0; } }\n', '5000000000 does not fit U32'],
    ['fn f(x: U64) U64 { (-1 + 2) + x; }\nexport lib { fn run() I32 { 0; } }\n', '-1 does not fit U64'],
  ];
  for (const [source, message] of mistakes) {
    const { errors } = await selfhost(await write(source));
    assert.ok(errors?.includes(message), `${source.slice(0, 300)}\n  reported: ${errors}`);
    checked++;
  }
  // A missing bound, said once for its type however many places use it; an unknown module once.
  for (const [source, message] of [
    ['proto Big:\n    | biggest(Array[&]) &\nstruct M:\n    | v: I32\nmod Pick[T[Big]] {\n    fn top(a: T, xs: Array[T]) T { a.biggest(xs); }\n}\nexport lib { fn run() I32 { let xs: Array[M] = [M { v: 3 }]; Pick[M].top(M { v: 1 }, xs).v + Pick[M].top(M { v: 2 }, xs).v; } }\n', "M does not implement Big (Pick's T needs it)"],
    ['fn g() I32 { Nope[F64].x() + Nope[F64].x(); }\nexport lib { fn run() I32 { g(); } }\n', 'Unknown module Nope'],
  ]) {
    const { errors } = await selfhost(await write(source));
    assert.deepEqual(errors, [message], source);
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

  // A program's @ir that makes invalid Wasm: said at the body, before the engine fails.
  const badIr = await selfhost(await write('fn f(a: I32) I32 { @ir/\\ <ir-i31-get-s><ir-ident name="a"/></ir-i31-get-s> \\/; }\nexport main() I32 { f(1); }\n'));
  assert.ok(badIr.errors?.some(e => e.startsWith('@ir in f does not make valid Wasm: ')), String(badIr.errors));
  checked++;
  // A plain instruction's operands, the result, and a literal: checked by the
  // compiler, so in every mode (small folded `i32.add` of two i64s to a number).
  for (const [source, message] of [
    ['fn f(a: I64) I32 { @ir/\\ <ir-i32-add><ir-ident name="a"/><ir-ident name="a"/></ir-i32-add> \\/; }\nexport main() I32 { f(3); }\n', '@ir <ir-i32-add> takes i32, given i64'],
    ['fn f(a: I32, b: I32) I64 { @ir/\\ <ir-i64-add><ir-ident name="a"/><ir-ident name="b"/></ir-i64-add> \\/; }\nexport main() I64 { f(1, 2); }\n', '@ir <ir-i64-add> takes i64, given i32'],
    ['fn f(a: F64, b: F64) I32 { @ir/\\ <ir-i32-add><ir-ident name="a"/><ir-ident name="b"/></ir-i32-add> \\/; }\nexport main() I32 { f(1.0, 2.0); }\n', '@ir <ir-i32-add> takes i32, given f64'],
    ['fn f(a: I64) I32 { @ir/\\ <ir-i64-add><ir-ident name="a"/><ir-ident name="a"/></ir-i64-add> \\/; }\nexport main() I32 { f(3); }\n', '@ir gives i64, not I32'],
    ['fn f(a: I32) Bool { @ir/\\ <ir-i32-add><ir-ident name="a"/><ir-lit kind="int" type-name="I32" value="1"/></ir-i32-add> \\/; }\nexport main() Bool { f(3); }\n', "@ir gives an i32, not a comparison's Bool"],
    ['fn f(a: I32) I32 { @ir/\\ <ir-i32-add><ir-ident name="a"/></ir-i32-add> \\/; }\nexport main() I32 { f(3); }\n', '@ir <ir-i32-add> is written wrong here'],
    ['fn f() I32 { @ir/\\ <ir-lit kind="int" type-name="I32" value="2147483648"/> \\/; }\nexport main() I32 { f(); }\n', '2147483648 does not fit I32'],
    ['fn f() U32 { @ir/\\ <ir-lit kind="int" type-name="U32" value="-1"/> \\/; }\nexport main() U32 { f(); }\n', '-1 does not fit U32'],
    ['fn f() U64 { @ir/\\ <ir-lit kind="int" type-name="U64" value="18446744073709551616"/> \\/; }\nexport main() U64 { f(); }\n', '18446744073709551616 does not fit U64'],
  ]) {
    const file = await write(source);
    for (const mode of ['debug', 'small', 'fast', 'smallUnsafe', 'fastUnsafe']) {
      const { diagnostics } = await compileFile(utu, file, { mode });
      assert.deepEqual(diagnostics.filter(d => d.severity !== 'warning').map(d => d.message), [message], `${mode}: ${source}`);
      checked++;
    }
  }
  // What @ir may give: a comparison, Bools and'ed, a Bool literal for Bool; literals at their types' edges.
  const goodIr = await write('fn lt(a: I32, b: I32) Bool { @ir/\\ <ir-i32-lt-s><ir-ident name="a"/><ir-ident name="b"/></ir-i32-lt-s> \\/; }\n'
    + 'fn both(a: Bool, b: Bool) Bool { @ir/\\ <ir-i32-and><ir-ident name="a"/><ir-ident name="b"/></ir-i32-and> \\/; }\n'
    + 'fn yes() Bool { @ir/\\ <ir-lit kind="int" type-name="Bool" value="1"/> \\/; }\n'
    + 'fn lo() I32 { @ir/\\ <ir-lit kind="int" type-name="I32" value="-2147483648"/> \\/; }\n'
    + 'fn hi() U64 { @ir/\\ <ir-lit kind="int" type-name="U64" value="18446744073709551615"/> \\/; }\n'
    + 'fn wide(a: I32) I64 { @ir/\\ <ir-i64-extend-s><ir-ident name="a"/></ir-i64-extend-s> \\/; }\n'
    + 'export main() Str { lt(1, 2).to_str() + " " + both(true, lt(3, 2)).to_str() + " " + yes().to_str() + " " + lo().to_str() + " " + hi().to_str() + " " + wide(-5).to_str(); }\n');
  for (const mode of ['debug', 'small', 'fast', 'smallUnsafe', 'fastUnsafe']) {
    const result = await compileFile(utu, goodIr, { mode });
    assert.ok(result.wasm, `${mode}: ${result.diagnostics.map(d => d.message).join('\n')}`);
    assert.equal(await (await instantiateNode(result.wasm, result.spec)).exports.main(), 'true false true -2147483648 18446744073709551615 -5', mode);
    checked++;
  }

  // An awaited ?T is null when the promise gives undefined, as a sync @es result is; a T is unchanged.
  const awaitUndefined = await write('let s: fun() Promise[?Str] = @es/\\ () => Promise.resolve(undefined) \\/;\n'
    + 'let t: fun() Promise[Str] = @es/\\ () => Promise.resolve("t") \\/;\n'
    + 'export main() Str {\n    let x: ?Str = await s();\n    let y: Str = await t();\n    promote x { |v| => "got [" + v + "]", ~> "absent " + y, };\n}\n');
  for (const mode of ['debug', 'small', 'fast', 'smallUnsafe', 'fastUnsafe']) {
    const result = await compileFile(utu, awaitUndefined, { mode });
    assert.ok(result.wasm, `${mode}: ${result.diagnostics.map(d => d.message).join('\n')}`);
    assert.equal(await (await instantiateNode(result.wasm, result.spec)).exports.main(), 'absent t', mode);
    checked++;
  }
  // A wasm struct, array, or fun crossing an @es binding: JS can read none nor make one.
  for (const [source, message] of [
    ['let len: fun(Array[Str]) F64 = @es/\\ (a) => a.length \\/;\nexport main() F64 { len(["a", "b"]); }\n', 'len passes Array[Str] to JS, which cannot read it'],
    ['struct P:\n    | x: F64\nlet px: fun(F64, ?P) F64 = @es/\\ (n, p) => p.x \\/;\nexport main() F64 { px(1.0, P { x: 1.0 }); }\n', 'px passes ?P to JS, which cannot read it'],
    ['struct P:\n    | x: F64\nlet px: cl(P) F64 = @es/\\ (p) => p.x \\/;\nexport main() F64 { px(P { x: 1.0 }); }\n', 'px passes P to JS, which cannot read it'],
    ['struct P:\n    | x: F64\nlet mk: fun(F64) P =@es/\\ (x) => ({ x }) \\/;\nexport main() F64 { mk(3.0).x; }\n', 'mk gets P from JS, which cannot make one'],
    ['let add: fun(I32) fun(I32) I32 = @es/\\ (n) => (x) => x + n \\/;\nexport main() I32 { add(1)(2); }\n', 'add gets a JS function: that is a cl, not fun(I32) I32'],
  ]) {
    const file = await write(source);
    const { diagnostics } = await compileFile(utu, file, { mode: 'small' });
    assert.deepEqual(diagnostics.filter(d => d.severity !== 'warning').map(d => d.message), [message], source);
    checked++;
  }
  // What the fun result is instead: a cl. std's own bindings hand back what utu gave (a Stream of structs).
  const clResult = await write('using Stream from std:Stream;\nstruct P:\n    | x: I32\n'
    + 'let add: fun(I32) cl(I32) I32 = @es/\\ (n) => (x) => x + n \\/;\n'
    + 'export main() I32 { let f = add(1); let t = 0; await for (Stream[P].of([P { x: 10 }, P { x: 20 }])) |p| { t += p.x; }; f(2) + t - 30; }\n');
  for (const mode of ['debug', 'small', 'fast', 'smallUnsafe', 'fastUnsafe']) {
    const result = await compileFile(utu, clResult, { mode });
    assert.ok(result.wasm, `${mode}: ${result.diagnostics.map(d => d.message).join('\n')}`);
    assert.equal(await (await instantiateNode(result.wasm, result.spec)).exports.main(), 3, mode);
    checked++;
  }

  // An @es Str result is a string, checked where it crosses (null passed as a Str, and trapped later).
  const nullStr = await selfhost(await write('let f: fun() Str = @es/\\ () => null \\/;\nexport lib { fn run() I32 { f().len(); } }\n'));
  assert.throws(() => nullStr.exports.run(), /Wrong type from JavaScript: a Str, not null/);
  checked++;

  // Test names: each test has one, its own.
  const twice = await compileFile(utu, await write('export main() void {}\ntest "passes" { assert true; }\ntest "passes" { assert true; }\ntest "" { assert true; }\n'), { target: 'test' });
  assert.deepEqual(twice.diagnostics.map(d => d.message), ['Duplicate test "passes"', 'Empty test name']);
  checked++;
  // A test name's escapes, checked as a string's are.
  const escaped = await compileFile(utu, await write('export main() void {}\ntest "x\\u{41}" { assert true; }\n'), { target: 'test' });
  assert.deepEqual(escaped.diagnostics.map(d => d.message), ['\\u needs four hex digits']);
  checked++;
  // Benches too; a test's and a bench's names are of their own kinds, and a mod's of its own.
  const benchTwice = await compileFile(utu, await write('bench "b" { measure {} }\nbench "b" { measure {} }\nbench "" { measure {} }\ntest "b" { assert true; }\nmod m { test "b" { assert true; } }\n'), { target: 'bench' });
  assert.deepEqual(benchTwice.diagnostics.map(d => d.message), ['Duplicate bench "b"', 'Empty bench name']);
  checked++;
  // A mod's tests and benches run, named by their mod (they were dropped);
  // a generic mod's run in no instance.
  const modTests = await write('let calls: Array[I32] = [0];\nmod geo {\n    fn two() I32 { 2; }\n    test "two" { assert two() == 2; }\n    test "fails" { assert two() == 3; }\n    bench "adds" { let k = two(); measure { calls[0] += k; } }\n}\ntest "two" { assert geo.two() == 2; }\n');
  for (const mode of modes) {
    const tested = await compileFile(utu, modTests, { target: 'test', mode });
    assert.deepEqual(tested.tests.map(t => t.name), ['geo: two', 'geo: fails', 'two'], `${mode}: ${tested.diagnostics?.map(d => d.message)}`);
    const { exports } = await instantiateNode(tested.wasm, tested.spec);
    await exports.__test_0();
    await assert.rejects(async () => exports.__test_1(), WebAssembly.RuntimeError);
    await exports.__test_2();
    const benched = await compileFile(utu, modTests, { target: 'bench', mode });
    assert.deepEqual(benched.benches, [{ export: '__bench_0', name: 'geo: adds' }], mode);
    checked++;
  }
  const genericTests = await compileFile(utu, await write('mod Box[T] {\n    fn id(x: T) T { x; }\n    test "id" { assert true; }\n    bench "id" { measure {} }\n}\nexport main() I32 { 0; }\n'), {});
  assert.deepEqual(genericTests.diagnostics.map(d => d.message), ['Test in generic mod Box', 'Bench in generic mod Box']);
  checked++;
  // A bench returns from neither its setup nor its measure (the run timed
  // nothing: "0.00 ns"); a closure in it may.
  for (const body of ['let x = 1; if x > 0 { return; }; measure {}', 'measure { return; }']) {
    const returns = await compileFile(utu, await write(`bench "r" { ${body} }\nexport main() I32 { 0; }\n`), { target: 'bench' });
    assert.deepEqual(returns.diagnostics.map(d => d.message), ['return in a bench'], body);
    checked++;
  }
  assert.deepEqual((await compileFile(utu, await write('bench "r" { measure { let f = cl() I32 { return 1; }; f(); } }\n'), { target: 'bench' })).diagnostics, []);
  // A defer in a bench's setup runs once its measuring is done.
  const deferred = await write('let note: fun(I32) void = @es/\\ (n) => { globalThis.deferred.push(n); } \\/;\nbench "d" {\n    let n = 0;\n    defer note(n);\n    measure { n += 1; }\n}\n');
  for (const mode of modes) {
    const benched = await compileFile(utu, deferred, { target: 'bench', mode });
    assert.ok(benched.wasm, `${mode}: ${benched.diagnostics.map(d => d.message)}`);
    const { exports } = await instantiateNode(benched.wasm, benched.spec);
    globalThis.deferred = [];
    exports.__bench_0(4);
    assert.deepEqual(globalThis.deferred, [4], mode);
    checked++;
  }
  // Every build checks the tests (and benches), not only a test build.
  for (const target of ['normal', 'test', 'bench']) {
    const typed = await compileFile(utu, await write('export main() I32 { 1; }\ntest "bad" { let a: I32 = 1.5; assert a == 1; }\nbench "worse" { measure { let b: Str = 2; } }\n'), { target });
    assert.deepEqual(typed.diagnostics.map(d => d.message), ['a is I32, got F64', 'b is Str, got I32'], target);
    checked++;
  }
  // One mistake, one message: a closure with an untyped parameter where no
  // closure is wanted (not also "got cl(unknown) Str"); a tuple element
  // (not also "has no default").
  for (const [source, message] of [
    ['fn take(s: Str) I32 { s.len(); }\nexport main() I32 { take(cl(m) Str { m; }); }\n', 'm needs a type'],
    ['export main() I32 { let a = Array[.{I32, Str}].new_default(2); 0; }\n', 'A tuple is only a function result'],
  ]) {
    const one = await compileFile(utu, await write(source), {});
    assert.deepEqual(one.diagnostics.filter(d => d.severity !== 'warning').map(d => d.message), [message], source);
    checked++;
  }
  // A literal out of range in a generic module: the instance named where it was written.
  const generic = await compileFile(utu, await write('mod G[T] {\n    fn f(v: T) I32 {\n        match v {\n            -1 => 1,\n            ~> 0,\n        };\n    }\n}\nexport main() I32 {\n    G[U32].f(3);\n}\n'), {});
  assert.equal(generic.diagnostics.length, 1);
  assert.ok(JSON.stringify(generic.diagnostics[0]).includes('in G[U32]'), JSON.stringify(generic.diagnostics[0]));
  checked++;
  // Thousands of alt arms, and of sparse match arms, are checked by a loop
  // (each arm recursed on the next).
  const altVariants = Array.from({ length: 3000 }, (_, k) => `    | V${k} { x: I32 }`).join('\n');
  const altArms = Array.from({ length: 3000 }, (_, k) => `        V${k} |v| => v.x + ${k},`).join('\n');
  const matchArms = Array.from({ length: 3000 }, (_, k) => `        ${k * 7} => ${k},`).join('\n');
  for (const [source, expected] of [
    [`enum E:\n${altVariants}\nfn f(e: E) I32 {\n    alt e {\n${altArms}\n    };\n}\nexport main() I32 {\n    f(V2999 { x: 1 });\n}\n`, 3000],
    [`fn f(x: I32) I32 {\n    match x {\n${matchArms}\n        ~> -1,\n    };\n}\nexport main() I32 {\n    f(7 * 2999);\n}\n`, 2999],
  ]) {
    const built = await compileFile(utu, await write(source), { mode: 'debug' });
    assert.ok(built.wasm, built.diagnostics.map(d => d.message).join('\n'));
    assert.equal((await instantiateNode(built.wasm, built.spec)).exports.main(), expected);
    checked++;
  }

  // Each file's names are its own (only modules cross files), and generic
  // modules called through aliases: what each builds to, in every mode.
  const project = async files => {
    const at = await fs.mkdtemp(path.join(dir, 'project-'));
    for (const [name, text] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(at, name)), { recursive: true });
      await fs.writeFile(path.join(at, name), text);
    }
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
    // One file's mod, imported twice (two spellings of its path): one name, one module.
    [{ 'lib/a.utu': 'mod api { fn x() I32 { 7; } }\n', 'main.utu': 'using api from "./lib/a.utu";\nusing api from "./lib/../lib/a.utu";\nexport main() I32 { api.x(); }\n' }, 7],
    // Two files' mods of one name are two modules (this said "Duplicate util__v").
    [{ 'x.utu': 'mod util { fn v() I32 { 100; } }\n', 'y.utu': 'mod util { fn v() I32 { 200; } }\n',
      'main.utu': 'using util |u| from "./x.utu";\nusing util |w| from "./y.utu";\nexport main() I32 { u.v() + w.v(); }\n' }, 300],
    [{ 'x.utu': 'mod P {\n    struct &:\n        | a: I32\n    fn &.get |self| () I32 { self.a; }\n    fn make() & { &{a: 7}; }\n}\n',
      'y.utu': 'mod P {\n    struct &:\n        | a: F64\n        | b: I32\n    fn &.get |self| () I32 { self.b; }\n    fn make() & { &{a: 1.5, b: 30}; }\n}\n',
      'main.utu': 'using P |X| from "./x.utu";\nusing P |Y| from "./y.utu";\nexport main() I32 { X.make().get() + Y.make().get(); }\n' }, 37],
    [{ 'x.utu': 'mod G[T] {\n    struct &:\n        | v: T\n    fn &.k |self| () I32 { 1; }\n    fn mk(v: T) & { &{v: v}; }\n}\n',
      'y.utu': 'mod G[T] {\n    struct &:\n        | v: T\n        | w: I32\n    fn &.k |self| () I32 { self.w; }\n    fn mk(v: T) & { &{v: v, w: 300}; }\n}\n',
      'main.utu': 'using G |A| from "./x.utu";\nusing G |B| from "./y.utu";\nexport main() I32 { A[I32].mk(3).k() + B[I32].mk(4).k(); }\n' }, 301],
    // A computed global of an imported file, read by the entry's: set first.
    [{ 'table.utu': 'mod table {\n    fn build() Array[I32] { let a = Array[I32].new(4, 0); for (0 ..< 4) |i| { a[i] = i * i; }; a; }\n    let squares: Array[I32] = build();\n}\n',
      'main.utu': 'using table from "./table.utu";\nlet last: I32 = table.squares[3] + 1;\nexport main() I32 { last; }\n' }, 10],
    // An imported file's own mems, read by its functions and modules; a
    // @comptime mem there; an @embed path relative to that file (each was "Unknown variable").
    [{ 'lib.utu': 'mem m: I32 = [5, 6];\nfn top() I32 { m[1]; }\nfn sq() Array[I32] { [0, 1, 4, 9]; }\nconst mem tab: I32 = @comptime/\\ sq() \\/;\nconst mem raw: U8 = @embed/\\ data.bin \\/;\nmod t { fn n() I32 { top() + m[0] + tab[3] * 10 + raw.len() * 100; } }\n',
      'data.bin': 'abc', 'main.utu': 'using t from "./lib.utu";\nexport main() I32 { t.n(); }\n' }, 401],
    // A @comptime mem read by another's expression is evaluated first (the second read it empty).
    [{ 'main.utu': 'fn sq() Array[I32] { [0, 1, 4, 9, 16]; }\nfn plus() Array[I32] { let a = Array[I32].new(first.len(), 0); for (0 ..< first.len()) |i| { a[i] = first[i] + 1; }; a; }\nconst mem second: I32 = @comptime/\\ plus() \\/;\nconst mem first: I32 = @comptime/\\ sq() \\/;\nexport main() I32 { second.len() * 100 + second[4]; }\n' }, 517],
    // A @comptime expression that awaits (its run gave a promise, read as nothing).
    [{ 'main.utu': 'let later: fun(I32) Promise[I32] = @es/\\ (v) => Promise.resolve(v) \\/;\nfn tab() Array[I32] { [await later(5)]; }\nconst mem t: I32 = @comptime/\\ tab() \\/;\nexport main() I32 { t.len() * 100 + t[0]; }\n' }, 105],
    // A @wat Bool is 0 or 1, returned or left (6 read as true, and == true was false).
    [{ 'main.utu': 'fn six() Bool { @wat/\\ i32.const 6 \\/; }\nfn nine() Bool { @wat/\\ i32.const 9 return \\/; }\nexport main() I32 { if six() == true and nine() == true { 1; } else { 0; }; }\n' }, 1],
    // A cl @es binding is the JS function, passed or called (its accessor called it: NaN).
    [{ 'main.utu': 'let js_double: cl(I32) I32 = @es/\\ (x) => x * 2 \\/;\nfn apply(f: cl(I32) I32, x: I32) I32 { f(x); }\nexport main() I32 { apply(js_double, 4) + js_double(5) * 10; }\n' }, 108],
    // A JavaScript exception runs the defers it unwinds through, newest first, before the catch; not errdefers.
    [{ 'main.utu': `let risky: fun(I32) I32 = @es/\\ (x) => { if (x < 0) throw new Error("neg"); return x; } \\/;
let log: fun(I32) void = @es/\\ (v) => { globalThis.__dlog = (globalThis.__dlog ?? 0) * 10 + v; } \\/;
let logged: fun() I32 = @es/\\ () => { const v = globalThis.__dlog ?? 0; globalThis.__dlog = 0; return v; } \\/;
fn inner() I32 { defer log(3); risky(-1); }
fn outer() I32 { defer log(4); let v = inner(); v + 1; }
fn res() Result[I32, Str] { defer log(6); errdefer log(7); Result[I32, Str].ok(risky(-1)); }
export main() I32 {
    let r = try { log(1); defer log(2); defer log(5); risky(-1); } catch { log(9); 0; };
    let s = try { outer(); } catch { log(8); 0; };
    let e = try { res().value_or(0); } catch { log(9); 0; };
    let ok = try { defer log(1); risky(7); } catch { 0; };
    r + s + e + ok - 7 + logged();
}
` }, 1529348691],
    // A negative or reversed Str range is empty in every engine; one past the end clamps.
    [{ 'main.utu': 'fn n(x: I32) I32 { x; }\nexport main() I32 {\n    let s = "hello";\n    s.slice(n(-1), 3).len() + s.slice(3, n(1)).len() * 10 + s[n(-2), 2].len() * 100 + Str.slice(s, 1, 3).len() * 1000 + s.slice(2, 99).len() * 10000;\n}\n' }, 32000],
    // A mod's own named struct and protocol, opened (in its file, and imported then opened).
    [{ 'main.utu': 'mod geo {\n    struct Pt:\n        | x: I32\n}\nusing geo;\nexport main() I32 { let p = Pt { x: 2 }; let q: geo.Pt = p; q.x; }\n' }, 2],
    [{ 'shp.utu': 'mod shapes {\n    proto Area:\n        | area() I32\n}\n',
      'main.utu': 'using shapes from "./shp.utu";\nusing shapes;\nstruct Tri[Area]:\n    | base: I32\nfn Area[Tri].area |t| () I32 { t.base; }\nexport main() I32 { let x: Area = Tri { base: 2 }; x.area(); }\n' }, 2],
    // A struct literal from a capitalized module or alias (`Geo.Pt { … }` was "Expected ';'"), and a
    // module's protocol in an impl or bound list (`[shapes.Area]` was "Expected ']'"); `Color.Red {}`
    // and `Color.Red { … }` after if are still a member before a block.
    [{ 'lib.utu': 'mod Geo {\n    struct Pt:\n        | x: I32\n        | y: I32\n    fn Pt.sum |p| () I32 { p.x + p.y; }\n}\nmod shapes {\n    proto Area:\n        | get area : I32\n}\n',
      'main.utu': `using Geo from "./lib.utu";
using Geo |G| from "./lib.utu";
using shapes from "./lib.utu";
enum(U8) Color:
    | Red
    | Green
mod Local {
    struct Box:
        | v: I32
}
struct Tri[shapes.Area]:
    | area: I32
mod Pick[T[shapes.Area]] { fn big(a: T, b: T) I32 { if a.area > b.area { a.area; } else { b.area; }; } }
fn total(a: shapes.Area) I32 { a.area; }
fn tone(c: Color) I32 {
    let n = 0;
    if c == Color.Red {};
    if c == Color.Red { n = 1; };
    n + match c == Color.Green { true => 10, ~> 0, };
}
export main() I32 {
    let p = Geo.Pt { x: 2, y: 3 };
    let q = G.Pt { x: 4, y: 5 };
    let b = Local.Box { v: 7 };
    let t = Tri { area: 3 };
    p.sum() * 100000 + q.sum() * 10000 + b.v * 1000 + total(t) * 100 + Pick[Tri].big(t, Tri { area: 8 }) * 10 + tone(Color.Red) + tone(Color.Green);
}
` }, 597391],
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
    // An imported file's mem is its own too.
    [{ 'mf.utu': 'mem m: I32 = [1];\nmod mm { fn f() I32 { m[0]; } }\n', 'main.utu': 'using mm from "./mf.utu";\nexport main() I32 { m[0]; }\n' }, 'Unknown variable m'],
    // A parse error in an imported file is the mistake (it showed as "Unknown module t8").
    [{ 't8.utu': 'mod t8 {\n    fn n() I32 { 1 +; }\n}\n', 'main.utu': 'using t8 from "./t8.utu";\nexport main() I32 { t8.n(); }\n' }, "Unexpected ';'"],
    // Only a mod is imported: said at the using.
    [{ 'hf.utu': 'fn helper() I32 { 2; }\n', 'main.utu': 'using helper from "./hf.utu";\nexport main() I32 { helper(); }\n' }, 'helper is a function; using imports a mod'],
    // One name, two files' mods: said at the second using (it was "Duplicate api__x", in b.utu).
    [{ 'a.utu': 'mod api { fn x() I32 { 1; } }\n', 'b.utu': 'mod api { fn x() I32 { 2; } }\n',
      'main.utu': 'using api from "./a.utu";\nusing api from "./b.utu";\nexport main() I32 { api.x(); }\n' }, 'Duplicate declaration api'],
    // One file's two mods of one name, said in the user's words (it was "Duplicate util__v").
    [{ 'main.utu': 'mod util { fn v() I32 { 1; } }\nmod util { fn v() I32 { 2; } }\nexport main() I32 { util.v(); }\n' }, 'Duplicate declaration util'],
    // A method or impl of an undeclared name (each was dropped, unsaid).
    [{ 'main.utu': 'export main() I32 { 1; }\nstruct Sq:\n    | s: I32\nfn Nope.area |self| () I32 { 1; }\n' }, 'Unknown type Nope'],
    [{ 'main.utu': 'export main() I32 { Sq{s:3}.area(); }\nstruct Sq:\n    | s: I32\nfn Zork[Sq].area |self| () I32 { 1; }\n' }, 'Unknown type Zork'],
    // `using geo |Pt|` renames mod geo; a mod with no type & is not a type (these trapped or built invalid Wasm).
    [{ 'main.utu': 'mod geo {\n    struct Pt:\n        | x: I32\n}\nusing geo |Pt|;\nexport main() I32 { let p = Pt { x: 2 }; p.x; }\n' }, 'Pt names mod geo, which has no type &'],
    [{ 'geo.utu': 'mod geo {\n    struct Pt:\n        | x: I32\n}\n', 'main.utu': 'using geo |Pt| from "./geo.utu";\nexport main() I32 { let p = Pt { x: 2 }; p.x; }\n' }, 'Pt names mod geo, which has no type &'],
    [{ 'main.utu': 'mod shapes {\n    proto Area:\n        | area() I32\n}\nusing shapes |Area|;\nstruct Tri[Area]:\n    | base: I32\nexport main() I32 { let t = Tri { base: 2 }; let x: Area = t; 2; }\n' }, 'Area names mod shapes, which has no type &'],
    [{ 'shp.utu': 'mod shapes {\n    proto Area:\n        | area() I32\n}\n',
      'main.utu': 'using shapes |Area| from "./shp.utu";\nstruct Tri:\n    | base: I32\nfn Area[Tri].area |t| () I32 { t.base; }\nexport main() I32 { 2; }\n' }, 'Area names mod shapes, which has no type &'],
    [{ 'main.utu': 'mod Geo {\n    struct Pt:\n        | x: I32\n}\nexport main() I32 { let p = Geo { x: 2 }; p.x; }\n' }, 'Geo is a mod with no type &'],
    [{ 'main.utu': 'mod Box[T] {\n    fn one() I32 { 1; }\n}\nfn Box[I32].two() I32 { 2; }\nexport main() I32 { 2; }\n' }, 'Box is a mod with no type &'],
    // A module's protocol in an impl or bound list resolves as a type path does.
    [{ 'main.utu': 'mod shapes { proto Area:\n    | get area : I32\n}\nstruct Sq[shapes.Nope]:\n    | area: I32\nexport main() I32 { 1; }\n' }, 'Unknown type Nope'],
    [{ 'main.utu': 'mod shapes { struct Pt:\n    | x: I32\n}\nmod M[T[shapes.Pt]] { fn f(a: T) T { a; } }\nexport main() I32 { 1; }\n' }, 'Pt is not a protocol; a bound names one'],
    [{ 'main.utu': 'mod Geo { struct Pt:\n    | x: I32\n}\nexport main() I32 { let p = Geo.Pt { x: 1 }; let q = Geo.Pt {}; 1; }\n' }, "Expected ';', got '{'"],
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
