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
