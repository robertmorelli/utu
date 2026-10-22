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

  // Result, try, and errdefer, in every build mode (the self-hosted compiler's
  // alone). Each letter is a defer (d, D) or errdefer (e, E, T, p, c) run.
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
}
`);
  for (const [mode, { optimize, safe }] of Object.entries(MODES)) {
    const built = await compileFile(utu, results, { optimize, safe });
    assert.ok(built.wasm, `${mode}: ${built.diagnostics?.map(d => d.message).join('\n')}`);
    const e = (await instantiateNode(built.wasm, built.spec)).exports;
    const expected = { ok_sum: 'dddD|6', err_sum: 'dedED|bad 120', nested_ok: 'dDdD|8', nested_err: 'edEDT|bad 97',
      returns: 'p|zero,|5,p|big', closure: '|7,c|bad 65', defaults: 69 };
    for (const [name, value] of Object.entries(expected)) assert.equal(e[name](), value, `${mode}: ${name}`);
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
    // try and errdefer: a Result, in a function returning one with the same error type.
    ['fn f() Result[I32, Str] { let x = try 5; Result[I32, Str].ok(x); }\nexport main() I32 { f().value(); }\n', 'try needs a Result, not I32'],
    ['fn g() Result[I32, I32] { Result[I32, I32].ok(1); }\nfn f() Result[I32, Str] { Result[I32, Str].ok(try g()); }\nexport main() I32 { f().value(); }\n',
      "try passes on I32; the function's errors are Str"],
    ['fn g() Result[I32, Str] { Result[I32, Str].ok(1); }\nfn f() I32 { try g(); }\nexport main() I32 { f(); }\n', 'try in a function returning I32, not a Result'],
    ['fn f() I32 { errdefer f(); 2; }\nexport main() I32 { f(); }\n', 'errdefer in a function returning I32, not a Result'],
    ['fn g() Result[I32, Str] { Result[I32, Str].ok(1); }\nfn gen() yield I32 { yield try g(); }\nfn f() Result[I32, Str] { let s = 0; for (gen()) |v| { s += v; }; Result[I32, Str].ok(s); }\nexport main() I32 { f().value(); }\n',
      'try in a generator'],
    ['fn g() Result[I32, Str] { Result[I32, Str].ok(1); }\nfn f() Result[I32, Str] { defer { try g(); }; g(); }\nexport main() I32 { f().value(); }\n', 'try in defer'],
    ['export main() I32 { let r = Result[I32, Str].ok(1); r._value; }\n', 'No field _value'],
    ['export main() I32 { let r: Result[I32, Str] = &{ _ok: true, _value: 1 }; 0; }\n', 'Result[I32, Str] is made by its own functions'],
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
