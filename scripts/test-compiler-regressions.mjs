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
