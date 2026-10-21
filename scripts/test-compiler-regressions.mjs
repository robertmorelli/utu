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
    // Only Externref holds any host value: not Str.
    ['using JS from std:JS;\nexport main() I32 { let s: Str = new JS.Map(); s.len(); }\n', 'Expected Str, got JS.Map<any, any>'],
    ['fn take(s: Str) I32 { s.len(); }\nexport main() I32 { take(cl() void {}); }\n', 'Expected Str, got cl() void'],
    ['using JS from std:JS;\nexport main() Str { "hello".replace("l", cl(m) Str { m; }); }\n', 'Expected Str, got cl(unknown) Str'],
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
