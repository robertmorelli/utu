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
    // Two opened modules with one name: neither is meant (this said "Unknown variable v").
    ['mod a { fn v() I32 { 1; } }\nmod b { fn v() I32 { 2; } }\nusing a;\nusing b;\nexport main() I32 { v(); }\n', 'v is ambiguous: a.v or b.v'],
    // A declaration named like a prelude module (the prelude's own `using Found` once found it).
    ['struct Found:\n    | x: I32\nexport main() I32 { let s = Found { x: 4 }; s.x; }\n', 'Found is a standard type'],
    // A generic module's function called with no instance (this built invalid Wasm).
    ['mod gb[T] { fn id(v: T) T { v; } }\nexport main() F64 { gb.id(1.5); }\n', 'gb takes 1 type arguments, given 0'],
    // Two types of one name, told apart.
    ['mod a {\n    struct S:\n        | x: I32\n    fn mk() S { S { x: 1 }; }\n}\nstruct S:\n    | x: I32\nexport main() I32 { let s: S = a.mk(); s.x; }\n', 'Expected S, got a.S'],
    // A module instantiating a bigger type each time it recurses (this ran for a minute, then crashed).
    ['mod m[T] {\n    fn f(n: I32) I32 { if n == 0 { 0; } else { m[Array[T]].f(n - 1) + 1; }; }\n}\nexport main() I32 { m[I32].f(3); }\n', "m's instances nest more than 64 deep"],
    // Past what a Wasm function takes (the engine refused the module).
    [`fn f(${Array.from({ length: 1001 }, (_, i) => `a${i}: I32`).join(', ')}) I32 { a0; }\nexport main() I32 { 1; }\n`, 'f has 1001 parameters (max 1000)'],
    // Nesting past the compiler's stack: a diagnostic, not a JavaScript stack.
    [`export main() I32 {\n    ${'('.repeat(30000)}1${')'.repeat(30000)};\n}\n`, 'Program nested too deeply (at about line 2)'],
  ];
  for (const [source, message] of mistakes) {
    const { errors } = await selfhost(await write(source));
    assert.ok(errors?.includes(message), `${source.slice(0, 300)}\n  reported: ${errors}`);
    checked++;
  }

  // Test names: each test has one, its own.
  const named = await compileFile(utu, await write('export main() void {}\ntest "passes" { assert true; }\ntest "passes" { assert true; }\ntest "" { assert true; }\n'), { target: 'test' });
  assert.deepEqual(named.diagnostics.map(d => d.message), ['Duplicate test "passes"', 'Empty test name']);
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
    [{ 'hf.utu': 'fn helper() I32 { 2; }\nmod hm { fn f() I32 { 1; } }\n', 'main.utu': 'using hm from "./hf.utu";\nexport main() I32 { helper(); }\n' }, 'Unknown variable helper'],
    [{ 'ops.utu': 'mod mathops { fn double(v: I32) I32 { v * 2; } }\n', 'boxes.utu': 'using mathops |ops| from "./ops.utu";\nmod boxes { fn f() I32 { 1; } }\n',
      'main.utu': 'using boxes from "./boxes.utu";\nexport main() I32 { ops.double(21); }\n' }, 'Unknown variable ops'],
  ];
  for (const [files, message] of unseen) {
    const result = await compileFile(utu, await project(files), {});
    assert.ok(result.diagnostics.some(d => d.message === message), `${files['main.utu']}\n  reported: ${result.diagnostics.map(d => d.message)}`);
    checked++;
  }
  console.log(`compiler regressions: ${checked} builds as they should be`);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
