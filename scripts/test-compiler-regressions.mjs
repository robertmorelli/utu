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
    ['fn f() I32 {\n    let x = 1 2;\n    x;\n}\n', "Expected ';', got '2'"],
    // A token missing at the end of a line: after the token before it.
    ['fn f() I32 {\n    let x = 1\n    x;\n}\n', 'Missing ; after 1'],
    // Other languages' habits, and names that are nearly right.
    ['fn f(a: Bool, b: Bool) Bool { a && b; }\n', 'Write and, not &&'],
    ['fn f() I32 {\n    let total = 1;\n    totl;\n}\n', 'Unknown variable totl; did you mean total?'],
    // Where an expected type came from: a parameter, a result.
    ['fn g(n: I32) I32 { n; }\nfn f() I32 { g("x"); }\n', 'g takes I32, got Str'],
    ['fn f() I32 { "x"; }\n', 'f returns I32, got Str'],
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
