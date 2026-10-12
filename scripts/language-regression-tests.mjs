// Utu language regressions: generic module calls, closure arrays, match
// patterns, operator and type diagnostics, and syntax-error reporting.
import fs from 'node:fs/promises';
import path from 'node:path';
import { compileAndInstantiate, withTempUtu } from './test-harness.mjs';
import { buildImportObject, createCompiler, emitBinary, emitText, initParser, instantiateLowered } from '../src/index.js';
import { liveGlueFields } from '../src/runtime/host-imports.js';

/** Compile and instantiate at an explicit optimize level ('size' = -Oz, 'speed' = -O3). */
async function instantiateAt(ROOT, name, source, optimize) {
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const compiler = createCompiler({
    parser, target: 'normal', optimize,
    readFile: file => fs.readFile(file, 'utf8'),
    readBinaryFile: file => fs.readFile(file),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
  });
  return withTempUtu(ROOT, name, source, async (file) => {
    const doc = await compiler.compileFile(file);
    const errors = [...doc.querySelectorAll('[data-error]')].map(node => node.dataset.errorMessage ?? node.dataset.error);
    if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
    const wasm = emitBinary(doc);
    const { instance } = await instantiateLowered(wasm, await buildImportObject(doc));
    return { instance, doc, wasm };
  });
}

/** Error-level diagnostics for a program, each with the source text it covers. */
async function errorsOf(compiler, ROOT, source) {
  return withTempUtu(ROOT, 'language_regression.utu', source, async (file) => {
    let diagnostics;
    try {
      diagnostics = (await compiler.analyzeFile(file)).artifacts.diagnostics;
    } catch (error) {
      diagnostics = error.artifacts?.diagnostics ?? [error.diagnostic];
    }
    return diagnostics
      .filter(d => d.severity !== 'warning')
      .map(d => ({ ...d, text: d.primary?.start == null ? null : source.slice(d.primary.start, d.primary.end) }));
  });
}

export function registerLanguageRegressionTests({ test, assert, assertEq, assertNoErrors, makeCompiler }) {
  const describe = errors => errors.map(e => `${e.kind}@${JSON.stringify(e.text)}: ${e.message}`).join('; ');

  test('modules: generic calls nest as arguments to other generic calls', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'nested_generic_calls.utu', source: `
      mod Pair[T] {
          struct P:
              | a: T
              | b: T
          fn make(a: T, b: T) P { P { a: a, b: b }; }
          fn sum(p: P) T { p.a + p.b; }
      }
      mod Id[T] {
          fn id(x: T) T { x; }
      }
      export lib {
          fn pair() I32 { Pair[I32].sum(Pair[I32].make(2, 3)); }
          fn deep() I32 { Id[I32].id(Id[I32].id(Id[I32].id(4))); }
          fn floats() F64 { Pair[F64].sum(Pair[F64].make(1.5, Id[F64].id(2.0))); }
      }
    `});
    assertEq(instance.exports.pair(), 5);
    assertEq(instance.exports.deep(), 4);
    assertEq(instance.exports.floats(), 3.5);
  });

  test('closures: arrays of closures and function references (annotated or not) type-check and call', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'closure_arrays.utu', source: `
      fn inc(x: I32) I32 { x + 1; }
      fn dbl(x: I32) I32 { x * 2; }
      export lib {
          fn inferred() I32 {
              let fs = [cl(x: I32) I32 { x + 1; }, cl(x: I32) I32 { x * 2; }];
              fs[0](10) + fs[1](10);
          }
          fn annotated() I32 {
              let base = 100;
              let fs: Array[cl(I32) I32] = [cl(x: I32) I32 { x + base; }];
              fs[0](1);
          }
          fn pointers() I32 {
              let fs: Array[cl(I32) I32] = [inc, dbl];
              fs[0](3) * 10 + fs[1](3);
          }
          fn unannotated() I32 {
              let fs = [inc, dbl];
              fs[0](3) * 10 + fs[1](3);
          }
          fn mixed() I32 {
              let k = 5;
              let fs = [inc, cl(x: I32) I32 { x + k; }];
              fs[0](1) * 10 + fs[1](1);
          }
          fn folded() I32 {
              let fs = [cl(x: I32) I32 { x + 1; }, cl(x: I32) I32 { x * 3; }];
              fs fold(1) |acc, f| { f(acc); };
          }
      }
    `});
    assertEq(instance.exports.inferred(), 31);
    assertEq(instance.exports.annotated(), 101);
    assertEq(instance.exports.pointers(), 46);
    assertEq(instance.exports.folded(), 6);
    assertEq(instance.exports.unannotated(), 46);
    assertEq(instance.exports.mixed(), 26);
  });

  test('closures: storing fun references in heap types is diagnosed with the working spelling', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const fns = 'fn inc(x: I32) I32 { x + 1; }\n';
    const cases = [
      ['struct H:\n    | f: fun(I32) I32\nexport main() I32 { 1; }', 'fun(I32) I32', 'a struct field'],
      [`${fns}export main() I32 { let fs: Array[fun(I32) I32] = [inc]; fs[0](3); }`, '[inc]', 'an array'],
    ];
    for (const [source, text, where] of cases) {
      const errors = await errorsOf(compiler, ROOT, source);
      const match = errors.find(e => e.text === text);
      assert(match, `${source}\n  got ${describe(errors)}`);
      assert(match.message.includes(`cannot be stored in ${where}`) && match.message.includes('use cl(I32) I32'), match.message);
    }
  });

  test('loops: continue skips to the next iteration of while, for, and each', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'continue_loops.utu', source: `
      export lib {
          fn whiles() I32 {
              let i = 0;
              let s = 0;
              while (i < 10) {
                  i += 1;
                  if i % 2 == 0 { continue; };
                  if i > 7 { break; };
                  s += i;
              };
              s;
          }
          fn ranges() I32 {
              let s = 0;
              for (0..<10) |i| { if i % 3 == 0 { continue; }; s += i; };
              for (1...5) |i| { if i == 5 { continue; }; s += 100; };
              s;
          }
          fn nested() I32 {
              let s = 0;
              for (0..<3) |i| { for (0..<3) |j| { if j == 1 { continue; }; s += 10 * i + j; }; };
              s;
          }
          fn eaches() I32 {
              let s = 0;
              [1, 2, 3, 4] each |x| { if x == 2 { continue; }; s += x; };
              s;
          }
      }
    `});
    assertEq(instance.exports.whiles(), 16);
    assertEq(instance.exports.ranges(), 427);
    assertEq(instance.exports.nested(), 66);
    assertEq(instance.exports.eaches(), 8);
  });

  test('loops: for iterates arrays, zips with ranges and arrays, and evaluates the source once', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'for_arrays.utu', source: `
      struct Counter:
          | n: I32
      struct P:
          | v: I32
      fn items(c: Counter) Array[I32] { c.n += 1; [1, 2, 3]; }
      export lib {
          fn sum() I32 { let s = 0; for ([1, 2, 3]) |x| { s += x; }; s; }
          fn indexed() I32 { let s = 0; for ([10, 20, 30], 0..<99) |x, i| { s += x * i; }; s; }
          fn zipped() I32 { let s = 0; for ([1, 2, 3], [10, 20]) |a, b| { s += a * b; }; s; }
          fn control() I32 {
              let s = 0;
              for ([1, 2, 3, 4, 5]) |x| { if x == 2 { continue; }; if x == 5 { break; }; s += x; };
              s;
          }
          fn once() I32 { let c = Counter { n: 0 }; for (items(c)) |x| { x; }; c.n; }
          fn mutate() I32 { let ps = [P { v: 1 }, P { v: 2 }]; for (ps) |p| { p.v *= 10; }; ps[0].v + ps[1].v; }
          fn nested() I32 { let s = 0; for ([[1, 2], [3]]) |row| { for (row) |x| { s += x; }; }; s; }
          fn empty() I32 { let xs: Array[I32] = []; let s = 7; for (xs) |x| { s = 0; }; s; }
          fn uncaptured() I32 { let n = 0; for (["a", "b"]) { n += 1; }; n; }
      }
    `});
    const expected = { sum: 6, indexed: 80, zipped: 50, control: 8, once: 1, mutate: 30, nested: 6, empty: 7, uncaptured: 2 };
    for (const [name, value] of Object.entries(expected)) assertEq(instance.exports[name](), value, name);
  });

  test('loops: invalid continue and non-array for sources explain themselves', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const cases = [
      ['export main() I32 { continue; 1; }', 'invalid-break', 'continue', 'continue must appear inside a loop'],
      ['export main() I32 { for (5) |x| { x; }; 1; }', 'invalid-for-source', '5', 'can only iterate an array, got I32'],
      ['export main() I32 { for ("abc") |x| { x; }; 1; }', 'invalid-for-source', '"abc"', 'got Str'],
    ];
    for (const [source, kind, text, message] of cases) {
      const errors = await errorsOf(compiler, ROOT, source);
      assertEq(errors.length, 1, describe(errors));
      assertEq(errors[0].kind, kind);
      assertEq(errors[0].text, text);
      assert(errors[0].message.includes(message), errors[0].message);
    }
  });

  test('editor: generated loop and iterator code adds no inlay hints', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const source = 'export main() I32 { let xs = [1, 2]; let s = 0; for (xs) |x| { s += x; }; xs each |y| { s += y; }; s; }';
    await withTempUtu(ROOT, 'loop_hints.utu', source, async (file) => {
      const { snapshot } = await compiler.analyzeFile(file);
      const hinted = snapshot.inlayHintsForFile(file).map(hint => source.slice(0, hint.position).match(/let (\w+) = [^;]*$/)?.[1]);
      assertEq(hinted.join(','), 'xs,s', `hints: ${JSON.stringify(snapshot.inlayHintsForFile(file).map(h => [h.position, h.label]))}`);
    });
  });

  test('defer: runs in reverse order at every block exit, after the block value', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'defer.utu', source: `
      struct Log:
          | v: I32
      fn value(l: Log) I32 { defer l.v = 100; l.v + 1; }
      fn early(l: Log, stop: Bool) I32 { defer l.v += 1; if stop { return 5; }; 7; }
      fn returned(l: Log) I32 { defer l.v = 99; return l.v; }
      fn nested(l: Log) I32 { defer l.v = l.v * 10 + 1; { defer l.v = l.v * 10 + 2; return 0; }; }
      fn cleared(l: Log) void { defer l.v += 5; l.v = 1; }
      export lib {
          fn order() I32 { let l = Log { v: 0 }; { defer l.v = l.v * 10 + 1; defer l.v = l.v * 10 + 2; l.v = 9; }; l.v; }
          fn after_value() I32 { let l = Log { v: 1 }; let a = value(l); a * 1000 + l.v; }
          fn on_return() I32 { let l = Log { v: 0 }; let a = early(l, true); let b = early(l, false); a * 100 + b * 10 + l.v; }
          fn return_first() I32 { let l = Log { v: 3 }; returned(l) * 100 + l.v; }
          fn scopes() I32 { let l = Log { v: 0 }; nested(l); l.v; }
          fn void_fn() I32 { let l = Log { v: 0 }; cleared(l); l.v; }
          fn loops() I32 {
              let l = Log { v: 0 };
              let s = 0;
              for (0..<4) |i| { defer l.v += 1; if i % 2 == 0 { continue; }; s += i; };
              s * 10 + l.v;
          }
          fn break_scope() I32 {
              let l = Log { v: 0 };
              { defer l.v += 100; while (true) { defer l.v += 1; break; }; l.v *= 2; };
              l.v;
          }
          fn binding_at_site() I32 { let l = Log { v: 0 }; let x = 1; { defer l.v = x; let x = 2; l.v = x; }; l.v; }
          fn iterator_body() I32 { let l = Log { v: 0 }; [1, 2, 3] each |x| { defer l.v += x; }; l.v; }
      }
    `});
    const expected = { order: 921, after_value: 2100, on_return: 572, return_first: 399, scopes: 21, void_fn: 6, loops: 44, break_scope: 102, binding_at_site: 1, iterator_body: 6 };
    for (const [name, value] of Object.entries(expected)) assertEq(instance.exports[name](), value, name);
  });

  test('defer: deferred code cannot leave its block', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const cases = [
      ['fn f() I32 { defer return; 1; }\nexport main() I32 { f(); }', 'return', 'return cannot appear inside deferred code'],
      ['export main() I32 { while (true) { defer break; }; 1; }', 'break', 'break cannot appear inside deferred code'],
      ['export main() I32 { let x = defer 1; 1; }', 'defer 1', 'defer must be a statement in a block'],
    ];
    for (const [source, text, message] of cases) {
      const errors = await errorsOf(compiler, ROOT, source);
      assert(errors.some(e => e.text === text && e.message.includes(message)), `${source}\n  got ${describe(errors)}`);
    }
    const fine = await errorsOf(compiler, ROOT, 'export main() I32 { while (true) { defer { while (true) { break; }; }; break; }; 1; }');
    assertEq(fine.length, 0, describe(fine));
  });

  test('control flow: return, break, and continue fit any value context', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'diverging.utu', source: `
      fn tail_block() I32 { { return 7; }; }
      fn both(b: Bool) I32 { if b { return 1; } else { return 2; }; }
      fn mixed(b: Bool) I32 { if b { return 1; } else { 2; }; }
      fn arms(x: I32) I32 { match x { 0 => return 10, ~> 20, }; }
      fn bound(b: Bool) I32 { let x = if b { 5; } else { return 9; }; x * 2; }
      export lib {
          fn run() I32 { tail_block() * 10000 + (both(true) * 10 + both(false)) * 100 + mixed(false) * 10 + arms(0) / 10; }
          fn binding() I32 { bound(true) * 100 + bound(false); }
      }
    `});
    assertEq(instance.exports.run(), 71221);
    assertEq(instance.exports.binding(), 1009);
  });

  test('operators: and/or short-circuit, so guards protect the right operand', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'short_circuit.utu', source: `
      struct Counter:
          | n: I32
      fn bump(c: Counter, value: Bool) Bool { c.n += 1; value; }
      export lib {
          fn and_skips() I32 { let c = Counter { n: 0 }; let x = false and bump(c, true); c.n; }
          fn or_skips() I32 { let c = Counter { n: 0 }; let x = true or bump(c, true); c.n; }
          fn both_run() I32 { let c = Counter { n: 0 }; let x = true and bump(c, false); let y = false or bump(c, true); c.n; }
          fn guard(i: I32) I32 { let s = "ab"; if i < s.len() and s[i] == 98 { 1; } else { 0; }; }
          fn truth() I32 {
              let t = 0;
              if true and true { t += 1; };
              if not (true and false) { t += 10; };
              if false or true { t += 100; };
              if not (false or false) { t += 1000; };
              t;
          }
      }
    `});
    assertEq(instance.exports.and_skips(), 0);
    assertEq(instance.exports.or_skips(), 0);
    assertEq(instance.exports.both_run(), 2);
    assertEq(instance.exports.guard(1), 1);
    assertEq(instance.exports.guard(5), 0, 'the index is never read out of bounds');
    assertEq(instance.exports.truth(), 1111);
  });

  test('numbers: to_str formats every scalar, and ships only when used', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'to_str.utu', source: `
      export lib {
          fn signed() Str { let n = -42; n.to_str(); }
          fn unsigned() Str { let n: U32 = 4294967295; n.to_str(); }
          fn wide() Str { let n: I64 = -9000000000; n.to_str(); }
          fn wide_unsigned() Str { let n: U64 = 18446744073709551615; n.to_str(); }
          fn single() Str { let n: F32 = 0.1; n.to_str(); }
          fn double() Str { 2.5.to_str(); }
          fn truth() Str { (1 > 2).to_str(); }
      }
    `});
    const expected = { signed: '-42', unsigned: '4294967295', wide: '-9000000000', wide_unsigned: '18446744073709551615', single: '0.1', double: '2.5', truth: 'false' };
    for (const [name, value] of Object.entries(expected)) assertEq(instance.exports[name](), value, name);
    const { wasm } = await instantiateAt(ROOT, 'no_to_str.utu', 'export main() I32 { 42; }', 'size');
    assertEq((await liveGlueFields(wasm)).size, 0, 'an unused to_str adds no imports');
  });

  test('calls: type-associated functions without self check their arity', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const struct = 'struct P:\n    | x: I32\nfn P.make() P { P { x: 1 }; }\nfn P.get |self| () I32 { self.x; }\n';
    const wrong = await errorsOf(compiler, ROOT, `${struct}export main() I32 { P.make(5).x; }`);
    assert(wrong.some(e => e.kind === 'wrong-arity' && e.text === 'P.make(5)'), describe(wrong));
    const generic = await errorsOf(compiler, ROOT, 'using Buffer from std:Buffer;\nexport main() I32 { let b = Buffer[I32].new(0); b.finish().len(); }');
    assert(generic.some(e => e.kind === 'wrong-arity' && e.text === 'Buffer[I32].new(0)'), describe(generic));
    const receiver = await errorsOf(compiler, ROOT, `${struct}export main() I32 { let p = P { x: 1 }; P.get(p); }`);
    assertEq(receiver.length, 0, `an explicit receiver is still accepted: ${describe(receiver)}`);
  });

  test('loop match: continue re-dispatches, break and finished arms leave, at -Oz and -O3', async ({ ROOT }) => {
    const source = `
      struct Log:
          | v: I32
      export lib {
          fn countdown() I32 { let n = 0; loop match 5 { 0 => { break; }, ~> { n += 1; continue 0; }, }; n; }
          fn machine() I32 {
              let i = 0;
              let log = 0;
              loop match 0 {
                  0 => { log = log * 10 + 1; continue 1; },
                  1 => { log = log * 10 + 2; i += 1; if i < 3 { continue 0; }; continue 2; },
                  2 => { log = log * 10 + 3; },
                  ~> {},
              };
              log;
          }
          fn finishes() I32 { let x = 0; loop match 1 { 1 => { x = 7; }, ~> { x = 99; }, }; x; }
          fn sparse() I32 { let n = 0; loop match 100 { 100 => { n += 1; continue 5000; }, 5000 => { n += 10; continue -7; }, -7 => { n += 100; }, ~> {}, }; n; }
          fn nested() I32 {
              let n = 0;
              loop match 0 {
                  0 => { let j = 0; while (true) { j += 1; if j == 3 { continue 1; }; n += 1; }; },
                  1 => { n += 100; },
                  ~> {},
              };
              n;
          }
          fn deferred() I32 { let l = Log { v: 0 }; let k = 0; loop match 0 { 0 => { defer l.v += 1; k += 1; if k < 3 { continue 0; }; }, ~> {}, }; l.v; }
          fn wide() I32 { let n = 0; let s: I64 = 2; loop match s { 2 => { n += 1; continue 1; }, 1 => { n += 10; }, ~> {}, }; n; }
          fn interpreter() I32 {
              let code = [1, 5, 1, 7, 2, 3, 0];
              let pc = 0;
              let acc = 0;
              let stack = [0, 0, 0, 0];
              let sp = 0;
              loop match code[pc] {
                  1 => { stack[sp] = code[pc + 1]; sp += 1; pc += 2; continue code[pc]; },
                  2 => { sp -= 1; stack[sp - 1] = stack[sp - 1] + stack[sp]; pc += 1; continue code[pc]; },
                  3 => { acc = stack[sp - 1]; pc += 1; continue code[pc]; },
                  0 => { break; },
                  ~> { acc = -1; },
              };
              acc;
          }
      }
    `;
    const expected = { countdown: 1, machine: 1212123, finishes: 7, sparse: 111, nested: 102, deferred: 3, wide: 11, interpreter: 12 };
    for (const optimize of ['size', 'speed']) {
      const { instance } = await instantiateAt(ROOT, `loop_match_${optimize}.utu`, source, optimize);
      for (const [name, value] of Object.entries(expected)) assertEq(instance.exports[name](), value, `${name} at ${optimize}`);
    }
  });

  test('loop match: every dynamic continue gets its own dispatch table', async ({ ROOT }) => {
    const source = `export lib {
      fn run(code: Array[I32]) I32 {
          let pc = 0;
          let acc = 0;
          loop match code[pc] {
              1 => { acc += 1; pc += 1; continue code[pc]; },
              2 => { acc += 2; pc += 1; continue code[pc]; },
              3 => { acc += 3; pc += 1; continue code[pc]; },
              ~> { break; },
          };
          acc;
      }
    }`;
    for (const [optimize, copies] of [['size', 1], ['speed', 2]]) {
      const { doc } = await instantiateAt(ROOT, `loop_match_shape_${optimize}.utu`, source, optimize);
      const tables = (emitText(doc).match(/\(br_table /g) ?? []).length;
      // One table at the loop head plus one per continue site, per arm copy.
      assertEq(tables, 1 + 3 * copies, `${optimize}: br_table count`);
    }
  });

  test('loop match: misuse of continue is diagnosed', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const cases = [
      ['export main() I32 { loop match 0 { 0 => { continue; }, ~> {}, }; 1; }', 'continue in a loop match needs the next state'],
      ['export main() I32 { while (true) { continue 3; }; 1; }', 'continue with a state only works inside loop match'],
      ['export main() I32 { loop match 0 { 0 => { continue "x"; }, ~> {}, }; 1; }', 'expected I32, got Str'],
      ['export main() I32 { loop match 0 { 0 => { break; }, 0x0 => { break; }, ~> {}, }; 1; }', 'Duplicate match pattern'],
      ['export main() I32 { loop match 1 { 1.5 => { break; }, ~> {}, }; 1; }', 'not an integer'],
    ];
    for (const [source, message] of cases) {
      const errors = await errorsOf(compiler, ROOT, source);
      assert(errors.some(e => e.message.includes(message)), `${source}\n  got ${describe(errors)}`);
    }
  });

  test('examples: the loop-match JSON parser agrees with JSON.parse at -Oz and -O3', async ({ ROOT }) => {
    const source = await fs.readFile(path.join(ROOT, 'examples/json/json.utu'), 'utf8');
    const count = v => (v === null || typeof v !== 'object' ? 1 : 1 + (Array.isArray(v) ? v : Object.values(v)).reduce((a, x) => a + count(x), 0));
    const deep = v => (v === null || typeof v !== 'object' ? 0 : 1 + Math.max(0, ...(Array.isArray(v) ? v : Object.values(v)).map(deep)));
    const base = JSON.stringify({ users: [{ id: 1, name: 'Ada "L"', tags: ['x', 'y'], score: -12.5e-3, ok: true, none: null }, { nested: { deep: [[1], [2, [3]]] } }], unicode: '\u00e9\u4e2d' });
    const inputs = ['0', '-1.5e+3', '"a\\u00e9\\n"', 'true', ' [ ] ', '{}', '[[[[]]]]', '[1,]', '{"a"}', '01', '1.', '"\\x"', '[', '{"a":1,}', 'nul', '"\u0001"', '1 2', '-', '1e', '"abc', '', base];
    let seed = 3;
    const random = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
    const alphabet = '{}[]:,"\\ 0123456789-+.eEtrufalsn\nab';
    for (let k = 0; k < 1500; k++) {
      let text = base;
      for (let e = 0; e <= random(3); e++) {
        const at = random(text.length + 1), op = random(3), c = alphabet[random(alphabet.length)];
        text = op === 0 ? text.slice(0, at) + text.slice(at + 1) : op === 1 ? text.slice(0, at) + c + text.slice(at) : text.slice(0, at) + c + text.slice(at + 1);
      }
      inputs.push(text);
    }
    for (const optimize of ['size', 'speed']) {
      const { instance } = await instantiateAt(ROOT, `json_${optimize}.utu`, source, optimize);
      for (const text of inputs) {
        let value, valid = true;
        try { value = JSON.parse(text); } catch { valid = false; }
        const got = instance.exports.parse(text);
        if (valid) {
          assertEq(got, count(value), `${optimize} value count for ${JSON.stringify(text).slice(0, 80)}`);
          assertEq(instance.exports.depth(text), deep(value), `${optimize} depth for ${JSON.stringify(text).slice(0, 80)}`);
        } else {
          assert(got < 0, `${optimize} should reject ${JSON.stringify(text).slice(0, 80)} (got ${got})`);
        }
      }
    }
  });

  test('loops: -O3 unrolled for loops keep continue, break, defer, and every remainder length', async ({ ROOT }) => {
    const source = `
      struct Log:
          | v: I32
      export lib {
          fn sum_to(n: I32) I32 { let s = 0; for (0..<n) |i| { s += i * 3 + 1; }; s; }
          fn evens(n: I32) I32 { let s = 0; for (0..<n) |i| { if i % 2 == 1 { continue; }; s += i; }; s; }
          fn until(n: I32, stop: I32) I32 { let s = 0; for (0..<n) |i| { if i == stop { break; }; s += 1; }; s; }
          fn deferred(n: I32) I32 { let l = Log { v: 0 }; for (0..<n) |i| { defer l.v += 1; if i % 3 == 0 { continue; }; }; l.v; }
          fn offset(a: I32, b: I32) I32 { let s = 0; for (a..<b) |i| { s += 1; }; s; }
          fn near_max() I32 { let s = 0; for (2147483640..<2147483647) |i| { s += 1; }; s; }
          fn near_min() I32 { let s = 0; for (-2147483648..<-2147483641) |i| { s += 1; }; s; }
          fn wide(n: I64) I64 { let s: I64 = 0; let zero: I64 = 0; for (zero..<n) |i| { s += i; }; s; }
          fn unsigned(n: U32) U32 { let s: U32 = 0; let zero: U32 = 0; for (zero..<n) |i| { s += 1; }; s; }
          fn array_sum(n: I32) I32 { let xs = Array[I32].new(n, 2); let s = 0; for (xs) |x| { s += x; }; s; }
          fn pipeline(n: I32) I32 { let xs = Array[I32].new(n, 1); xs map |x| { x + 1; } sum; }
      }
    `;
    const ref = {
      sum_to: n => Array.from({ length: Math.max(0, n) }, (_, i) => i * 3 + 1).reduce((a, x) => a + x, 0),
      evens: n => Array.from({ length: Math.max(0, n) }, (_, i) => i).filter(i => i % 2 === 0).reduce((a, x) => a + x, 0),
      deferred: n => Math.max(0, n),
    };
    for (const optimize of ['size', 'speed']) {
      const { instance } = await instantiateAt(ROOT, `unrolled_${optimize}.utu`, source, optimize);
      const e = instance.exports;
      for (let n = -1; n <= 13; n++) {
        for (const name of Object.keys(ref)) assertEq(e[name](n), ref[name](n), `${name}(${n}) at ${optimize}`);
        assertEq(e.until(13, n), n >= 0 ? Math.min(n, 13) : 13, `until(13, ${n}) at ${optimize}`);
        assertEq(e.array_sum(Math.max(0, n)), 2 * Math.max(0, n), `array_sum(${n}) at ${optimize}`);
        assertEq(e.pipeline(Math.max(0, n)), 2 * Math.max(0, n), `pipeline(${n}) at ${optimize}`);
        assertEq(e.wide(BigInt(n)), BigInt(Math.max(0, n) * Math.max(0, n - 1) / 2), `wide(${n}) at ${optimize}`);
        assertEq(e.unsigned(Math.max(0, n)), Math.max(0, n), `unsigned(${n}) at ${optimize}`);
      }
      assertEq(e.offset(5, 2), 0, `empty range at ${optimize}`);
      assertEq(e.offset(-3, 6), 9, `negative start at ${optimize}`);
      assertEq(e.near_max(), 7, `no overflow near I32 max at ${optimize}`);
      assertEq(e.near_min(), 7, `no overflow near I32 min at ${optimize}`);
    }
  });

  test('loops: -O3 unrolls small counted loops four ways; -Oz keeps one copy', async ({ ROOT }) => {
    const source = 'export lib { fn total(xs: Array[I32]) I32 { xs sum; } }';
    const gets = {};
    for (const optimize of ['size', 'speed']) {
      const { doc } = await instantiateAt(ROOT, `unroll_shape_${optimize}.utu`, source, optimize);
      gets[optimize] = (emitText(doc).match(/\(array\.get /g) ?? []).length;
    }
    assertEq(gets.size, 1, '-Oz: one array.get');
    assertEq(gets.speed, 5, '-O3: four unrolled reads plus the tail');
  });

  test('generators: yield expands into for loops with break, continue, return, and hygiene', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'generators.utu', source: `
      struct Log:
          | v: I32
      struct P:
          | v: I32
      fn squares(n: I32) yield I32 { for (0..<n) |i| { if i % 3 != 0 { yield i * i; }; }; }
      fn three() yield I32 { yield 1; yield 2; yield 3; }
      fn upto(n: I32) yield I32 { let i = 0; while (true) { if i == n { return; }; yield i; i += 1; }; }
      fn shadowing(s: I32) yield I32 { let x = s * 2; yield x; yield x + 1; }
      fn doubled(n: I32) yield I32 { for (squares(n)) |x| { yield x * 2; }; }
      fn points(n: I32) yield P { for (0..<n) |i| { yield P { v: i }; }; }
      fn guarded(l: Log) yield I32 { defer l.v += 100; yield 1; yield 2; }
      fn bump(l: Log) I32 { l.v += 1; 3; }
      fn first_over(limit: I32) I32 { for (squares(100)) |x| { if x > limit { return x; }; }; -1; }
      export lib {
          fn sum() I32 { let s = 0; for (squares(10)) |x| { s += x; }; s; }
          fn broken() I32 { let s = 0; for (squares(100)) |x| { if x > 30 { break; }; s += x; }; s; }
          fn skipped() I32 { let s = 0; for (squares(10)) |x| { if x == 16 { continue; }; s += x; }; s; }
          fn ordered() I32 { let s = 0; for (three()) |x| { s = s * 10 + x; }; s; }
          fn returned() I32 { let s = 0; for (upto(5)) |x| { s += x; }; s; }
          fn hygiene() I32 { let s = 100; let x = 7; for (shadowing(3)) |v| { s += v + x; }; s; }
          fn nested() I32 { let s = 0; for (doubled(10)) |x| { s += x; }; s; }
          fn early() I32 { first_over(50); }
          fn inner_loops() I32 { let s = 0; for (squares(5)) |x| { for (0..<3) |j| { if j == 1 { continue; }; s += x; }; }; s; }
          fn structs() I32 { let s = 0; for (points(4)) |p| { s += p.v; }; s; }
          fn deferred() I32 { let l = Log { v: 0 }; for (guarded(l)) |x| { if x == 1 { break; }; }; l.v; }
          fn once() I32 { let l = Log { v: 0 }; let s = 0; for (upto(bump(l))) |x| { s += x; }; l.v * 100 + s; }
          fn awaited() I32 { let s = 0; await for (squares(4)) |x| { s += x; }; s; }
      }
    `});
    const expected = { sum: 159, broken: 46, skipped: 143, ordered: 123, returned: 10, hygiene: 127, nested: 318, early: 64, inner_loops: 42, structs: 6, deferred: 100, once: 103, awaited: 5 };
    for (const [name, value] of Object.entries(expected)) assertEq(instance.exports[name](), value, name);
  });

  test('generators: a consumed generator compiles to the same wasm as the hand-written loop', async ({ ROOT }) => {
    const generated = 'fn squares(n: I32) yield I32 { for (0..<n) |i| { if i % 3 != 0 { yield i * i; }; }; }\nexport lib { fn run(n: I32) I32 { let s = 0; for (squares(n)) |x| { s += x; }; s; } }';
    const hand = 'export lib { fn run(n: I32) I32 { let s = 0; for (0..<n) |i| { if i % 3 != 0 { s += i * i; }; }; s; } }';
    for (const optimize of ['size', 'speed']) {
      const a = await instantiateAt(ROOT, `generator_shape_${optimize}.utu`, generated, optimize);
      const b = await instantiateAt(ROOT, `hand_shape_${optimize}.utu`, hand, optimize);
      assertEq(a.wasm.length, b.wasm.length, `${optimize}: generator and loop are the same size`);
      assertEq(a.instance.exports.run(1000), b.instance.exports.run(1000));
    }
  });

  test('generators: async generators await inside the consuming loop (JSPI)', async ({ ROOT }) => {
    if (typeof WebAssembly.Suspending !== 'function') return; // host without JSPI
    const { promisifyExports, readRuntimeSpec } = await import('../src/runtime/host-imports.js');
    const { doc, instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'async_generator.utu', source: `
      let later: fun(I32) Promise[I32] = @es/\\ (v) => new Promise(r => setTimeout(() => r(v * 10), 2)) \\/;
      fn ticks(n: I32) yield I32 {
          for (0..<n) |i| {
              let value: I32 = await later(i);
              yield value;
          };
      }
      export lib {
          fn total(n: I32) I32 { let s = 0; await for (ticks(n)) |t| { s += t; }; s; }
      }
    `});
    const spec = readRuntimeSpec(doc.body.firstChild, 'promiseRuntime');
    assertEq(await promisifyExports(instance, spec).total(4), 60);
  });

  test('mem: module-level scalar arrays are linear memories that grow, narrow, and reach the host', async ({ ROOT }) => {
    const source = `
      export mem text: U8;
      mem signed: I8;
      mem half: U16;
      mem floats: F32;
      mem ids: U32;
      mem wide: I64;
      fn evens(n: I32) yield I32 { for (0..<n) |i| { if i % 2 == 0 { yield i; }; }; }
      export lib {
          fn fill(n: I32) I32 { text.clear(); for (0..<n) |i| { text.push(97 + i % 26); }; text.len(); }
          fn count(c: I32) I32 { let k = 0; for (0..<text.len()) |i| { if text[i] == c { k += 1; }; }; k; }
          fn set_len(n: I32) void { text.resize(n); }
          fn capacity(n: I32) I32 { text.reserve(n); text.cap(); }
          fn truncate() I32 { text.resize(3); text[0] = 300; text[1] += 10; text[2] = text[text[0] - 44]; text[0] * 10000 + text[1] * 100 + text[2]; }
          fn sign() I32 { signed.resize(2); signed[0] = 200; signed[1] = -3; signed[0] * 1000 + signed[1]; }
          fn halves() I32 { half.clear(); half.push(70000); half.push(65535); half[0] * 100000 + half[1]; }
          fn floaty() F32 { floats.clear(); floats.push(1.25); floats[0] += 2.5; floats[0]; }
          fn unsigned() U32 { ids.clear(); ids.push(7); ids[0]; }
          fn big() I64 { wide.resize(4); wide[3] = 1 << 40; wide[3] + wide.len().to_i64(); }
          fn shadow(text: I32) I32 { let half = text + 1; half; }
          fn generated() I32 { ids.clear(); for (evens(10)) |e| { ids.push(e.to_u32()); }; ids.len(); }
      }
    `;
    for (const optimize of ['size', 'speed']) {
      const { instance } = await instantiateAt(ROOT, `mems_${optimize}.utu`, source, optimize);
      const e = instance.exports;
      assertEq(e.fill(100000), 100000, `fill at ${optimize}`);
      assertEq(e.count(97), 3847, `count at ${optimize}`);
      assertEq(new TextDecoder().decode(new Uint8Array(e.text.buffer, 0, 5)), 'abcde', `host view at ${optimize}`);
      const written = new TextEncoder().encodeInto('hello wasm', new Uint8Array(e.text.buffer)).written;
      e.set_len(written);
      assertEq(e.count('l'.charCodeAt(0)), 2, `host write at ${optimize}`);
      assertEq(e.capacity(1 << 20), 1 << 20, `reserve at ${optimize}`);
      assertEq(e.text.buffer.byteLength, 1 << 20, `memory size at ${optimize}`);
      assertEq(e.truncate(), 440000 + 11100 + 44, `U8 keeps the low byte at ${optimize}`);
      assertEq(e.sign(), -56003, `I8 sign-extends at ${optimize}`);
      assertEq(e.halves(), 446465535, `U16 at ${optimize}`);
      assertEq(e.floaty(), 3.75, `F32 at ${optimize}`);
      assertEq(e.unsigned(), 7, `U32 at ${optimize}`);
      assertEq(e.big(), (1n << 40n) + 4n, `I64 at ${optimize}`);
      assertEq(e.shadow(4), 5, `locals shadow mems at ${optimize}`);
      assertEq(e.generated(), 5, `mems inside generator consumers at ${optimize}`);
    }
  });

  test('mem: initializers fill memories from literals, files, and @comptime; const rejects writes', async ({ ROOT }) => {
    const os = await import('node:os');
    const table = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'utu-embed-')), 'pairs.bin');
    await fs.writeFile(table, Uint8Array.from([5, 0, 7, 0]));
    const source = `
      const mem prec: U8 = [0, 1, 1, 2, 255];
      mem neg: I16 = [-3, 7];
      const mem halves: F64 = [0.5, -1.25];
      const mem wide: U64 = [18446744073709551615];
      const mem pairs: U16 = @embed/\\ ${table} \\/;
      const mem squares: I32 = @comptime/\\ make_squares(1000) \\/;
      const mem dfa: U8 = @comptime/\\ digits() \\/;
      fn make_squares(n: I32) Array[I32] {
          let out = Array[I32].new(n, 0);
          for (0..<n) |i| { out[i] = i * i; };
          out;
      }
      // Four states: digits count up to three, anything else resets.
      fn digits() Array[I32] {
          let t = Array[I32].new(4 * 256, 0);
          for (0..<4) |s| {
              for (48..<58) |c| { t[s * 256 + c] = if s == 3 { 3; } else { s + 1; }; };
          };
          t;
      }
      export lib {
          fn lengths() I32 { prec.len() * 1000 + neg.len() * 100 + squares.len(); }
          fn literal() I32 { neg[0] -= 1; prec[4] * 1000 + neg[0]; }
          fn floats() F64 { halves[0] + halves[1]; }
          fn top() U64 { wide[0]; }
          fn embedded() I32 { pairs[0] * 10 + pairs[1]; }
          fn summed() I32 { let s = 0; for (0..<squares.len()) |i| { s += squares[i]; }; s; }
          fn scan() I32 { let st = 0; for ([49, 50, 51, 120, 57, 57]) |c| { st = dfa[st * 256 + c]; }; st; }
      }
    `;
    for (const optimize of ['size', 'speed']) {
      const { instance } = await instantiateAt(ROOT, `mem_init_${optimize}.utu`, source, optimize);
      const e = instance.exports;
      assertEq(e.lengths(), 5000 + 200 + 1000, `lengths at ${optimize}`);
      assertEq(e.literal(), 255000 - 4, `literals at ${optimize}`);
      assertEq(e.floats(), -0.75, `F64 literals at ${optimize}`);
      assertEq(BigInt.asUintN(64, e.top()), 2n ** 64n - 1n, `U64 literals at ${optimize}`);
      assertEq(e.embedded(), 57, `@embed at ${optimize}`);
      assertEq(e.summed(), 332833500, `@comptime squares at ${optimize}`);
      assertEq(e.scan(), 2, `@comptime DFA at ${optimize}`);
    }
  });

  test('mem: copy_in and view move bytes between mems and JavaScript', async ({ ROOT }) => {
    const source = `
      using JS from std:JS;
      mem text: U8;
      mem out: U8;
      mem samples: F32;
      export lib {
          fn load(bytes: Externref) I32 { text.copy_in(bytes); text.len(); }
          fn spaces() I32 { let k = 0; for (0..<text.len()) |i| { if text[i] == 32 { k += 1; }; }; k; }
          fn shout() JS.Uint8Array {
              out.resize(text.len());
              for (0..<text.len()) |i| { let c = text[i]; out[i] = if c >= 97 and c <= 122 { c - 32; } else { c; }; };
              out.view(0, out.len());
          }
          fn floats() JS.Float32Array { samples.clear(); samples.push(1.5); samples.push(-2.0); samples.view(0, 2); }
      }
    `;
    for (const optimize of ['size', 'speed']) {
      const { instance } = await instantiateAt(ROOT, `mem_host_${optimize}.utu`, source, optimize);
      const e = instance.exports;
      assertEq(e.load('héllo wasm world'), 17, `strings arrive as UTF-8 at ${optimize}`);
      assertEq(e.spaces(), 2, `copied bytes at ${optimize}`);
      assertEq(new TextDecoder().decode(e.shout()), 'HéLLO WASM WORLD', `views at ${optimize}`);
      const big = new Uint8Array(200000).fill(32);
      assertEq(e.load(big), 200000, `copy_in grows the memory at ${optimize}`);
      assertEq(e.spaces(), 200000, `large copies at ${optimize}`);
      assertEq([...e.floats()].join(','), '1.5,-2', `F32 views at ${optimize}`);
    }
  });

  test('enums: integer enums store in mems and dispatch through match and loop match', async ({ ROOT }) => {
    const source = `
      enum(U8) Tag:
          | Leaf
          | Unary
          | Binary
          | Eof = 255
      enum(I8) Sign:
          | Minus = -1
          | Zero
          | Plus
      mem tags: Tag;
      fn weight(t: Tag) I32 { match t { Tag.Leaf => 1, Tag.Unary => 10, Tag.Binary => 100, Tag.Eof => 1000, }; }
      export lib {
          fn stored() I32 {
              tags.clear();
              tags.push(Tag.Binary);
              tags.push(Tag.Leaf);
              tags.push(Tag.Eof);
              let total = 0;
              for (0..<tags.len()) |i| { total += weight(tags[i]); };
              total;
          }
          fn machine() I32 {
              let state: Tag = Tag.Leaf;
              let steps = 0;
              loop match state {
                  Tag.Leaf => { steps += 1; continue Tag.Unary; },
                  Tag.Unary => { steps += 10; let next: Tag = Tag.Binary; continue next; },
                  Tag.Binary => { steps += 100; break; },
                  ~> {},
              };
              steps;
          }
          fn values() I32 { Tag.Eof.to_i32() * 100 + Sign.Minus.to_i32() * 10 + Sign.Plus.to_i32() + Tag.count() * 100000; }
          fn ordered() Bool { Tag.Leaf < Tag.Eof and Sign.Minus < Sign.Zero and Tag.Unary == Tag.from_i32(1); }
          fn names() I32 { Tag.name(Tag.Binary).len() * 10 + Tag.name(Tag.from_i32(9)).len(); }
      }
    `;
    for (const optimize of ['size', 'speed']) {
      const { instance } = await instantiateAt(ROOT, `int_enums_${optimize}.utu`, source, optimize);
      const e = instance.exports;
      assertEq(e.stored(), 1101, `stored at ${optimize}`);
      assertEq(e.machine(), 111, `loop match at ${optimize}`);
      assertEq(e.values(), 25500 - 10 + 1 + 400000, `values at ${optimize}`);
      assertEq(e.ordered(), 1, `ordering at ${optimize}`);
      assertEq(e.names(), 61, `names at ${optimize}`);
    }
  });

  test('distinct: distinct types keep their representation and are not their base', async ({ ROOT }) => {
    const source = `
      type NodeId = distinct I32;
      type Weight = distinct F64;
      type Big = distinct U64;
      mem lhs: NodeId;
      fn child(id: NodeId) NodeId { lhs[id.to_i32()]; }
      export lib {
          fn walk() I32 {
              lhs.clear();
              lhs.push(NodeId.from_i32(2));
              lhs.push(NodeId.from_i32(0));
              lhs.push(NodeId.from_i32(1));
              child(child(NodeId.from_i32(0))).to_i32();
          }
          fn zero() F64 { 1.0 / Weight.from_f64(-0.0).to_f64(); }
          fn unsigned() Bool { Big.from_u64(1) < Big.from_u64(18446744073709551615); }
      }
    `;
    for (const optimize of ['size', 'speed']) {
      const { instance } = await instantiateAt(ROOT, `distinct_${optimize}.utu`, source, optimize);
      assertEq(instance.exports.walk(), 1, `walk at ${optimize}`);
      assertEq(instance.exports.zero(), -Infinity, `-0 survives at ${optimize}`);
      assertEq(instance.exports.unsigned(), 1, `unsigned order at ${optimize}`);
    }
  });

  test('std: IntMap and Interner', async ({ ROOT }) => {
    const source = `
      using IntMap from std:IntMap;
      using Interner from std:Interner;
      mem src: U8 = [102, 111, 111, 32, 98, 97, 114, 32, 102, 111, 111, 32, 98, 97, 122, 32, 98, 97, 114];
      export lib {
          fn words() I32 {
              let names = Interner.new();
              let counts = IntMap.new();
              let start = 0;
              let seen = 0;
              for (0..<src.len() + 1) |i| {
                  if i == src.len() or src[i] == 32 {
                      names.begin();
                      for (start..<i) |k| { names.byte(src[k]); };
                      let id = names.finish();
                      seen = seen * 10 + id;
                      counts.set(id, counts.get(id, 0) + 1);
                      start = i + 1;
                  };
              };
              let same = if names.ascii(2) == "baz" and names.size(1) == 3 and names.byte_at(1, 2) == 114 { 1; } else { 0; };
              seen * 1000 + names.len() * 100 + counts.get(0, 0) * 10 + same;
          }
          fn many() I32 {
              let m = IntMap.new();
              for (0..<100000) |n| { m.set(n * 7919, n); };
              let bad = 0;
              for (0..<100000) |n| { if m.get(n * 7919, -1) != n { bad += 1; }; };
              if m.has(3) { bad += 1; };
              let ids = Interner.new();
              for (0..<10000) |n| {
                  let k = n % 5000;
                  ids.begin();
                  ids.byte(k & 255);
                  ids.byte(k >> 8);
                  if ids.finish() != k { bad += 1; };
              };
              bad * 1000000 + m.len() / 100 + ids.len();
          }
      }
    `;
    for (const optimize of ['size', 'speed']) {
      const { instance } = await instantiateAt(ROOT, `std_maps_${optimize}.utu`, source, optimize);
      assertEq(instance.exports.words(), 1021321, `words at ${optimize}`);
      assertEq(instance.exports.many(), 1000 + 5000, `growth at ${optimize}`);
    }
  });

  test('mem: byte mems intern spans of themselves in place', async ({ ROOT }) => {
    const source = `
      mem src: U8 = [102, 111, 111, 32, 98, 97, 114, 32, 102, 111, 111, 32, 98, 97, 122, 32, 98, 97, 114];
      export lib {
          fn words() I32 {
              src.intern_reset();
              let start = 0;
              let seen = 0;
              for (0..<src.len() + 1) |i| {
                  if i == src.len() or src[i] == 32 {
                      seen = seen * 10 + src.intern(start, i);
                      start = i + 1;
                  };
              };
              seen * 1000 + src.interned() * 100 + src.interned_start(2) * 0 + src.interned_size(2);
          }
          fn many() I32 {
              src.intern_reset();
              let base = src.len();
              for (0..<5000) |n| {
                  src.push(n & 255);
                  src.push(n >> 8);
              };
              let bad = 0;
              for (0..<10000) |n| {
                  let k = n % 5000;
                  if src.intern(base + k * 2, base + k * 2 + 2) != k { bad += 1; };
              };
              src.resize(base);
              bad * 100000 + src.interned();
          }
      }
    `;
    for (const optimize of ['size', 'speed']) {
      const { instance } = await instantiateAt(ROOT, `mem_intern_${optimize}.utu`, source, optimize);
      assertEq(instance.exports.words(), 1021303, `words at ${optimize}`);
      assertEq(instance.exports.many(), 5000, `growth at ${optimize}`);
    }
  });

  test('mem: misuse is diagnosed', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const cases = [
      ['mem s: Str;\nexport main() I32 { 1; }', 'a mem holds an integer enum, a distinct type, or one of'],
      ['mem s: U8;\nmem s: U8;\nexport main() I32 { 1; }', 'mem s is declared twice'],
      ['mem s: U8;\nfn s() I32 { 1; }\nexport main() I32 { 1; }', 'mem s has the same name as a top-level function'],
      ['mem s: U8;\nexport main() I32 { s.pop(); 1; }', "mem s has no method 'pop'"],
      ['mem s: I32;\nexport main() I32 { s.intern(0, 1); }', 'only byte mems (U8, I8) intern spans'],
      ['mem s: U8;\nexport main() I32 { let t = s; 1; }', 'mem s is not a value'],
      ['mem s: U8;\nexport main() I32 { s[0, 1]; 1; }', 'mem s takes one index'],
      ['mem s: U8;\nexport main() I32 { s.push(1.5); 1; }', 'expected I32, got F64'],
      ['const mem s: U8 = [1];\nexport main() I32 { s[0] = 2; 1; }', 'mem s is const; it cannot be written'],
      ['const mem s: U8 = [1];\nexport main() I32 { s.push(2); 1; }', 'mem s is const; it has no push'],
      ['mem s: U8 = [256];\nexport main() I32 { 1; }', 'element 0 (256) does not fit in U8'],
      ['mem s: U8 = [x];\nexport main() I32 { 1; }', 'an initializer list holds number literals'],
      ['mem s: U8 = @comptime/\\ nope() \\/;\nexport main() I32 { 1; }', "@comptime: Unknown variable 'nope'"],
      ['mem s: U8 = @embed/\\ missing.bin \\/;\nexport main() I32 { 1; }', '@embed cannot read missing.bin: ENOENT'],
      ['mem s: U8;\nexport main() I32 { s.view(0, 1); 1; }', 'add `using JS from std:JS;`'],
      ['enum(U8) T:\n    | A\n    | B\nfn f(t: T) I32 { match t { T.A => 1, }; }\nexport main() I32 { 1; }', "Missing variant 'B' in match over T"],
      ['enum(U8) T:\n    | A\nfn f(t: T) I32 { match t { T.A => 1, T.C => 2, ~> 3, }; }\nexport main() I32 { 1; }', 'T has no variant C'],
      ['enum(U8) T:\n    | A = 300\nexport main() I32 { 1; }', 'T.A = 300 does not fit in U8'],
      ['enum(U8) T:\n    | A = 1\n    | B = 1\nexport main() I32 { 1; }', 'T.B and T.A are both 1'],
      ['enum(U8) T:\n    | A\nfn f(t: T) I32 { 1; }\nexport main() I32 { f(0); }', 'expected T, got I32'],
      ['type N = distinct I32;\nfn f(n: N) I32 { 1; }\nexport main() I32 { f(3); }', 'expected N, got I32'],
      ['type N = distinct Str;\nexport main() I32 { 1; }', 'a distinct type wraps one of'],
    ];
    for (const [source, message] of cases) {
      const errors = await errorsOf(compiler, ROOT, source);
      assert(errors.some(e => e.message.includes(message)), `${source}\n  got ${describe(errors)}`);
    }
  });

  test('alt: an exhaustive alt without a default arm yields a value', async ({ ROOT }) => {
    const source = `
      tag enum Node:
          | Leaf { v: I32 }
          | Bin { l: I32 }
          | List { n: I32 }
      tag enum One:
          | Only { v: I32 }
      enum Plain:
          | A { v: I32 }
          | B { w: I32 }
      fn tag_of(n: Node) I32 { alt n { Leaf |x| => x.v, Bin |b| => 7, List |k| => k.n, }; }
      fn only(o: One) I32 { alt o { Only |x| => x.v, }; }
      fn plain(p: Plain) I32 { alt p { A |a| => a.v, B |b| => b.w, }; }
      fn effect(n: Node) I32 { let t = 0; alt n { Leaf |x| => { t = 1; }, Bin |b| => { t = 2; }, List |k| => { t = 3; }, }; t; }
      export lib {
          fn tags() I32 { tag_of(Leaf { v: 1 }) + tag_of(Bin { l: 0 }) * 10 + tag_of(List { n: 3 }) * 100; }
          fn single() I32 { only(Only { v: 4 }); }
          fn plains() I32 { plain(B { w: 5 }) * 10 + plain(A { v: 6 }); }
          fn effects() I32 { effect(List { n: 0 }) * 10 + effect(Leaf { v: 0 }); }
      }
    `;
    for (const optimize of ['size', 'speed']) {
      const { instance } = await instantiateAt(ROOT, `exhaustive_alt_${optimize}.utu`, source, optimize);
      const expected = { tags: 371, single: 4, plains: 56, effects: 31 };
      for (const [name, value] of Object.entries(expected)) assertEq(instance.exports[name](), value, `${name} at ${optimize}`);
    }
  });

  test('generators: recursive generators walk depth-first on an explicit stack', async ({ ROOT }) => {
    const source = `
      tag enum Node:
          | Leaf { v: I32 }
          | Bin { l: Node, r: Node }
          | List { xs: Array[Node] }
      struct Chain:
          | v: I32
          | next: ?Chain
      struct Log:
          | v: I32
      fn children(n: Node) yield Node {
          alt n {
              Leaf |x| => {},
              Bin |b| => { yield b.l; yield b.r; },
              List |k| => { for (k.xs) |c| { yield c; }; },
          };
      }
      fn walk(n: Node) yield Node { for (children(n)) |c| { yield c; for (walk(c)) |d| { yield d; }; }; }
      fn post(n: Node) yield Node { for (children(n)) |c| { for (post(c)) |d| { yield d; }; }; yield n; }
      fn inorder(lo: I32, hi: I32) yield I32 {
          if hi - lo <= 0 { return; };
          let mid: I32 = lo + (hi - lo) / 2;
          for (inorder(lo, mid)) |x| { yield x; };
          yield mid;
          for (inorder(mid + 1, hi)) |x| { yield x; };
      }
      fn links(c: Chain) yield I32 {
          yield c.v;
          promote c.next { |n| => { for (links(n)) |x| { yield x; }; }, ~> {}, };
      }
      fn counted(l: Log, n: I32) yield I32 { l.v += 1; if n > 0 { yield n; for (counted(l, n - 1)) |x| { yield x; }; }; }
      fn value(n: Node) I32 { alt n { Leaf |x| => x.v, ~> 0, }; }
      fn tag_of(n: Node) I32 { alt n { Leaf |x| => x.v, Bin |b| => 7, List |k| => 8, }; }
      fn tree() Node {
          Bin { l: List { xs: [Leaf { v: 1 }, Leaf { v: 2 }, Bin { l: Leaf { v: 3 }, r: Leaf { v: 4 } }] }, r: Leaf { v: 5 } };
      }
      export lib {
          fn preorder() I32 { let s = 0; for (walk(tree())) |n| { s = s * 10 + tag_of(n); }; s; }
          fn postorder() I32 { let s = 0; for (post(tree())) |n| { s = s * 10 + tag_of(n); }; s; }
          fn pruned() I32 { let s = 0; for (walk(tree())) |n| { if tag_of(n) == 8 { prune; }; s = s * 10 + tag_of(n); }; s; }
          fn pruned_inner() I32 { let s = 0; for (walk(tree())) |n| { if tag_of(n) == 7 { prune; }; s = s * 10 + tag_of(n); }; s; }
          fn broken() I32 { let s = 0; for (walk(tree())) |n| { if value(n) == 3 { break; }; s += value(n); }; s; }
          fn skipped() I32 { let s = 0; for (walk(tree())) |n| { if value(n) == 2 { continue; }; s += value(n); }; s; }
          fn sorted(n: I32) I32 { let prev = -1; let ok = 1; for (inorder(0, n)) |x| { if x != prev + 1 { ok = 0; }; prev = x; }; if prev == n - 1 { ok; } else { 0; }; }
          fn deep(n: I32) I32 {
              let head = Chain { v: 0, next: null };
              for (1..<n) |i| { head = Chain { v: 1, next: head }; };
              let s = 0; for (links(head)) |x| { s += x; }; s;
          }
          fn nested() I32 { let s = 0; for (inorder(0, 10)) |a| { for (inorder(0, a)) |b| { s += 1; }; }; s; }
          fn calls() I32 { let l = Log { v: 0 }; let s = 0; for (counted(l, 4)) |x| { s += x; }; l.v * 100 + s; }
          fn stopped() I32 { let l = Log { v: 0 }; for (counted(l, 4)) |x| { break; }; l.v; }
      }
    `;
    for (const optimize of ['size', 'speed']) {
      const { instance } = await instantiateAt(ROOT, `recursive_generators_${optimize}.utu`, source, optimize);
      const e = instance.exports;
      const expected = { preorder: 8127345, postorder: 12347857, pruned: 85, pruned_inner: 81275, broken: 3, skipped: 13, nested: 45, calls: 510, stopped: 1 };
      for (const [name, value] of Object.entries(expected)) assertEq(e[name](), value, `${name} at ${optimize}`);
      for (const n of [0, 1, 2, 7, 1000]) assertEq(e.sorted(n), 1, `sorted(${n}) at ${optimize}`);
      assertEq(e.deep(200000), 199999, `deep chain at ${optimize}`);
    }
  });

  test('generators: misuse is diagnosed', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const cases = [
      ['fn f() I32 { yield 1; 1; }\nexport main() I32 { f(); }', 'yield can only appear in a generator'],
      ['fn g() yield I32 { yield 1; }\nexport main() I32 { let x = g(); 1; }', 'g is a generator: consume it with'],
      ['fn a() yield I32 { for (b()) |x| { yield x; }; }\nfn b() yield I32 { for (a()) |x| { yield x; }; }\nexport main() I32 { for (a()) |x| { x; }; 1; }', 'cannot recurse'],
      ['fn g(n: I32) yield I32 { for (g(n - 1)) |x| { yield x + 1; }; }\nexport main() I32 { for (g(3)) |x| { x; }; 1; }', 'passes its own values straight through'],
      ['fn g() yield I32 { yield 1; }\nexport main() I32 { for (g()) |x| { prune; }; 1; }', 'prune skips a subtree of a recursive generator'],
      ['export main() I32 { prune; 1; }', 'prune skips a subtree of a recursive generator'],
      ['fn g(n: I32) yield I32 { yield n; for (g(n - 1)) |x| { yield x; }; }\nexport main() I32 { for (g(3)) |x| { let f = cl() void { prune; }; }; 1; }', 'prune cannot appear inside a closure'],
      ['fn g() yield I32 { return 5; }\nexport main() I32 { for (g()) |x| { x; }; 1; }', 'ends with `return;`'],
      ['fn g() yield I32 { let f = cl() void { yield 1; }; }\nexport main() I32 { for (g()) |x| { x; }; 1; }', 'inside a closure'],
      ['export main() I32 { await for ([1, 2]) |x| { x; }; 1; }', 'await for iterates a generator call'],
      ['fn g() yield I32 { yield 1; }\nexport main() I32 { for (g()) |x, i| { x; }; 1; }', 'binds one value'],
      ['fn g(n: I32) yield I32 { yield n; }\nexport main() I32 { for (g()) |x| { x; }; 1; }', 'expects 1 argument(s), got 0'],
      ['fn g() yield I32 { yield "s"; }\nexport main() I32 { for (g()) |x| { x; }; 1; }', 'expected I32, got Str'],
    ];
    for (const [source, message] of cases) {
      const errors = await errorsOf(compiler, ROOT, source);
      assert(errors.some(e => e.message.includes(message)), `${source}\n  got ${describe(errors)}`);
    }
  });

  test('operators: compound assignments nested inside a compound value are lowered', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'nested_compound.utu', source: `
      export lib {
          fn loop_value() I32 { let h = 10; h += { let i = 0; while (i < 3) { i += 1; }; i; }; h; }
          fn deep() I32 { let h = 1; h *= { let a = 2; a += { let b = 3; b -= 1; b; }; a; }; h; }
          fn searched(n: I32) I32 { let hits = 0; let xs = Array[I32].new(n, 0); for (0..<n) |i| { xs[i] = i * 3; }; for (0..<n) |q| { hits += xs bisect |v| { v < q * 2; }; }; hits; }
      }
    `});
    assertEq(instance.exports.loop_value(), 13);
    assertEq(instance.exports.deep(), 4);
    const n = 300;
    let expected = 0;
    for (let q = 0; q < n; q++) expected += Math.min(n, Math.ceil((q * 2) / 3));
    assertEq(instance.exports.searched(n), expected);
  });

  test('iterators: integer sorts use radix sort and agree with a reference everywhere', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'radix_sort.utu', source: `
      export lib {
          fn make(n: I32, seed: I32) Array[I32] {
              let xs = Array[I32].new(n, 0);
              let s = seed;
              for (0..<n) |i| { s = s * 1103515245 + 12345; xs[i] = s ^ (s << 13); };
              if n > 2 { xs[0] = 2147483647; xs[1] = -2147483648; xs[2] = 0; };
              xs;
          }
          fn at(xs: Array[I32], i: I32) I32 { xs[i]; }
          fn up(xs: Array[I32]) Array[I32] { xs sort(I32) |a, b| { a < b; }; }
          fn down(xs: Array[I32]) Array[I32] { xs sort(I32) |a, b| { a > b; }; }
          fn unsigned_up(xs: Array[I32]) Array[U32] { xs map |x| { x.to_u32(); } sort(U32) |a, b| { a < b; }; }
          fn unsigned_at(xs: Array[U32], i: I32) U32 { xs[i]; }
          fn unsigned_len(xs: Array[U32]) I32 { xs.len(); }
          fn len(xs: Array[I32]) I32 { xs.len(); }
      }
    `});
    const e = instance.exports;
    const make = (n, seed) => {
      const xs = []; let s = seed;
      for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) | 0; xs.push(s ^ (s << 13)); }
      if (n > 2) { xs[0] = 2147483647; xs[1] = -2147483648; xs[2] = 0; }
      return xs;
    };
    const read = (xs, at = e.at, len = e.len) => Array.from({ length: len(xs) }, (_, i) => at(xs, i));
    for (const n of [0, 1, 2, 3, 100, 511, 512, 513, 1000, 5000]) {
      const js = make(n, 7 + n), xs = e.make(n, 7 + n);
      assertEq(JSON.stringify(read(e.up(xs))), JSON.stringify([...js].sort((a, b) => a - b)), `ascending n=${n}`);
      assertEq(JSON.stringify(read(e.down(xs))), JSON.stringify([...js].sort((a, b) => b - a)), `descending n=${n}`);
      const unsigned = js.map(x => x >>> 0).sort((a, b) => a - b);
      assertEq(JSON.stringify(read(e.unsigned_up(xs), e.unsigned_at, e.unsigned_len).map(x => x >>> 0)), JSON.stringify(unsigned), `U32 n=${n}`);
    }
  });

  test('iterators: flat_map over an array literal yields each element without allocating', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'flat_map_literal.utu', source: `
      export lib {
          fn pairs(n: I32) I32 { let xs = Array[I32].new(n, 1); xs map |x, i| { x + i.to_i32(); } flat_map |x| { [x, -x * 10]; } fold(0) |a, v| { a * 3 + v; }; }
          fn empty(n: I32) I32 { let xs = Array[I32].new(n, 1); xs flat_map |x| { let ignored: Array[I32] = []; ignored; } count; }
          fn none(n: I32) I32 { let xs = Array[I32].new(n, 1); xs flat_map |x| { []; } count; }
          fn statements(n: I32) I32 { let xs = Array[I32].new(n, 2); xs flat_map |x| { let y = x * 5; [y, y + 1, y + 2]; } sum; }
          fn cut(n: I32, k: I32) I32 { let xs = Array[I32].new(n, 1); xs map |x, i| { i.to_i32(); } flat_map |x| { [x, x, x]; } take(k) sum; }
          fn wide(n: I32) I32 { let xs = Array[I32].new(n, 1); xs flat_map |x| { [x, x, x, x, x]; } sum; }
      }
    `});
    const e = instance.exports;
    for (const n of [0, 1, 2, 7]) {
      let acc = 0;
      for (let i = 0; i < n; i++) { const x = 1 + i; acc = (Math.imul(acc, 3) + x) | 0; acc = (Math.imul(acc, 3) - x * 10) | 0; }
      assertEq(e.pairs(n), acc, `pairs(${n})`);
      assertEq(e.empty(n), 0);
      assertEq(e.none(n), 0);
      assertEq(e.statements(n), n * (10 + 11 + 12));
      assertEq(e.wide(n), 5 * n, 'more than four elements falls back to the array');
      for (const k of [0, 1, 2, 4, 3 * n + 3]) {
        const values = Array.from({ length: n }, (_, i) => [i, i, i]).flat().slice(0, Math.max(0, k));
        assertEq(e.cut(n, k), values.reduce((a, x) => a + x, 0), `cut(${n}, ${k})`);
      }
    }
  });

  test('iterators: scalar reduce accumulates in a local; empty input yields null', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'scalar_reduce.utu', source: `
      export lib {
          fn ints(n: I32) I32 { let xs = Array[I32].new(n, 3); promote xs reduce(I32) |a, x, i| { a * 2 + x + i.to_i32(); } { |f| => f.value, ~> -1, }; }
          fn floats(n: I32) F64 { let xs = Array[F64].new(n, 1.5); promote xs reduce(F64) |a, x| { a + x; } { |f| => f.value, ~> -1.0, }; }
      }
    `});
    for (const n of [0, 1, 2, 9]) {
      let acc = 3;
      for (let i = 1; i < n; i++) acc = (acc * 2 + 3 + i) | 0;
      assertEq(instance.exports.ints(n), n ? acc : -1, `ints(${n})`);
      assertEq(instance.exports.floats(n), n ? 1.5 * n : -1, `floats(${n})`);
    }
  });

  test('loops: -O3 unrolls counted while loops and leaves the counter exactly as before', async ({ ROOT }) => {
    const source = `export lib {
      fn sum(n: I32) I32 { let xs = Array[I32].new(n, 2); let s = 0; let i = 0; while (i < n) { s += xs[i] + i; i += 1; }; s * 1000 + i; }
      fn early(n: I32, stop: I32) I32 { let s = 0; let i = 0; while (i < n) { if i == stop { break; }; s += 1; i += 1; }; s * 1000 + i; }
      fn wide(n: I64) I64 { let s: I64 = 0; let i: I64 = 0; while (i < n) { s += i; i += 1; }; s; }
      fn start(a: I32, n: I32) I32 { let i = a; let c = 0; while (i < n) { c += 1; i += 1; }; c * 1000 + i; }
      fn moving(n: I32) I32 { let i = 0; let m = n; let c = 0; while (i < m) { m -= 1; c += 1; i += 1; }; c * 1000 + i; }
    }`;
    const results = {};
    for (const optimize of ['size', 'speed']) {
      const { instance, doc } = await instantiateAt(ROOT, `counted_while_${optimize}.utu`, source, optimize);
      const e = instance.exports;
      const out = [];
      for (let n = -1; n <= 11; n++) out.push(e.sum(Math.max(0, n)), e.early(11, n), String(e.wide(BigInt(n))), e.start(n, 6), e.moving(n));
      results[optimize] = JSON.stringify(out);
      if (optimize === 'speed') {
        assert((emitText(doc).match(/\(array\.get /g) ?? []).length >= 5, 'the counted while loop is unrolled');
      }
    }
    assertEq(results.speed, results.size, 'unrolled loops give the same results, counters included');
  });

  test('iterators: a side-effect-free collect feeding another pipeline is fused away', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'fused_collect.utu', source: `
      struct Log:
          | v: I32
      export lib {
          fn fused(n: I32) I32 { let xs = Array[I32].new(n, 3); (xs map |x, i| { x - i.to_i32(); } collect(I32)) filter |x| { x > 0; } sum; }
          fn twice(n: I32) I32 { let xs = Array[I32].new(n, 1); ((xs map |x| { x + 1; } collect(I32)) map |x| { x * 10; } collect(I32)) sum; }
          fn cut(n: I32) I32 { let xs = Array[I32].new(n, 2); (xs map |x| { x * x; } collect(I32)) take(2) sum; }
          fn ordered() I32 {
              let log = Log { v: 0 };
              let xs = [1, 2, 3];
              let total = (xs map |x| { log.v = log.v * 10 + x; x; } collect(I32)) map |x| { log.v = log.v * 10 + x; x; } sum;
              log.v;
          }
      }
    `});
    for (const n of [0, 1, 2, 5, 9]) {
      assertEq(instance.exports.fused(n), Array.from({ length: n }, (_, i) => 3 - i).filter(x => x > 0).reduce((a, x) => a + x, 0), `fused(${n})`);
      assertEq(instance.exports.twice(n), 20 * n);
      assertEq(instance.exports.cut(n), 4 * Math.min(2, n));
    }
    assertEq(instance.exports.ordered(), 123123, 'stages with effects keep running to completion in order');
    const fused = await instantiateAt(ROOT, 'fused_shape.utu', 'export lib { fn run(xs: Array[I32]) I32 { (xs map |x| { x + 1; } collect(I32)) filter |x| { x > 0; } sum; } }', 'size');
    const single = await instantiateAt(ROOT, 'single_shape.utu', 'export lib { fn run(xs: Array[I32]) I32 { xs map |x| { x + 1; } filter |x| { x > 0; } sum; } }', 'size');
    assertEq(fused.wasm.length, single.wasm.length, 'the fused pipeline compiles like one pipeline');
  });

  test('iterators: integer-key group_by and distinct_by hash, across many keys and key types', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'hashed_groups.utu', source: `
      export lib {
          fn make(n: I32) Array[I32] { let xs = Array[I32].new(n, 0); let s = 7; for (0..<n) |i| { s = s * 1103515245 + 12345; xs[i] = s; }; xs; }
          fn distinct_count(xs: Array[I32], m: I32) I32 { (xs distinct_by(I32, I32) |x| { x & m; }).len(); }
          fn first_of(xs: Array[I32], m: I32, k: I32) I32 { (xs distinct_by(I32, I32) |x| { x & m; })[k]; }
          fn group_count(xs: Array[I32], m: I32) I32 { (xs group_by(I32, I32) |x| { x & m; }).len(); }
          fn group_checksum(xs: Array[I32], m: I32) I32 { (xs group_by(I32, I32) |x| { x & m; }) fold(0) |a, g, i| { a * 31 + g.key * 7 + g.values.len() + g.values[0]; }; }
          fn wide_keys(xs: Array[I32]) I32 { (xs distinct_by(I32, I64) |x| { x.to_i64() * 4294967296; }).len(); }
          fn unsigned_keys(xs: Array[I32]) I32 { (xs group_by(I32, U32) |x| { x.to_u32() >>> 20; }).len(); }
      }
    `});
    const e = instance.exports;
    const make = n => { const xs = []; let s = 7; for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) | 0; xs.push(s); } return xs; };
    for (const n of [0, 1, 50, 3000]) {
      const js = make(n), xs = e.make(n);
      for (const m of [0, 7, 255, 4095, -1]) {
        const firsts = [], seen = new Set();
        for (const x of js) if (!seen.has(x & m)) { seen.add(x & m); firsts.push(x); }
        assertEq(e.distinct_count(xs, m), firsts.length, `distinct n=${n} m=${m}`);
        if (firsts.length) assertEq(e.first_of(xs, m, firsts.length - 1), firsts.at(-1), 'first occurrences in order');
        const groups = new Map();
        for (const x of js) { if (!groups.has(x & m)) groups.set(x & m, []); groups.get(x & m).push(x); }
        assertEq(e.group_count(xs, m), groups.size, `groups n=${n} m=${m}`);
        let check = 0;
        for (const [key, values] of groups) check = (Math.imul(check, 31) + Math.imul(key, 7) + values.length + values[0]) | 0;
        assertEq(e.group_checksum(xs, m), check, `group order and contents n=${n} m=${m}`);
      }
      assertEq(e.wide_keys(xs), new Set(js).size, `I64 keys n=${n}`);
      assertEq(e.unsigned_keys(xs), new Set(js.map(x => (x >>> 0) >>> 20)).size, `U32 keys n=${n}`);
    }
  });

  test('iterators: fast_sum is exact for integers and close for floats, at every length', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'fast_sum.utu', source: `
      export lib {
          fn ints(n: I32) I32 { let xs = Array[I32].new(n, 0); for (0..<n) |i| { xs[i] = i * 2147483 - 7; }; xs fast_sum; }
          fn plain(n: I32) I32 { let xs = Array[I32].new(n, 0); for (0..<n) |i| { xs[i] = i * 2147483 - 7; }; xs sum; }
          fn floats(n: I32) F64 { let xs = Array[F64].new(n, 0.0); for (0..<n) |i| { xs[i] = i.to_f64() * 0.1; }; xs filter |x| { x > 0.05; } fast_sum; }
          fn wide(n: I32) I64 { let xs = Array[I64].new(n, 0); for (0..<n) |i| { xs[i] = i.to_i64() * 3000000000; }; xs fast_sum; }
      }
    `});
    for (let n = 0; n <= 13; n++) {
      assertEq(instance.exports.ints(n), instance.exports.plain(n), `ints(${n}) wraps exactly like sum`);
      const expected = Array.from({ length: n }, (_, i) => i * 0.1).filter(x => x > 0.05).reduce((a, x) => a + x, 0);
      assert(Math.abs(instance.exports.floats(n) - expected) <= 1e-12 * Math.max(1, expected), `floats(${n})`);
      assertEq(instance.exports.wide(n), BigInt(n * (n - 1) / 2) * 3000000000n, `wide(${n})`);
    }
  });

  test('modules: two files may import the same module, and outside code can build its structs', async ({ ROOT }) => {
    const dir = path.join(ROOT, '.tmp', 'shared_module');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'core.utu'), `mod core {
    struct Point:
        | x: I32
        | label: Str
    struct Bag:
        | points: Array[Point]
    fn sum(b: Bag) I32 {
        b.points fold(0) |a, p| { a + p.x; };
    }
}
`);
    await fs.writeFile(path.join(dir, 'view.utu'), `using core from "./core.utu";
mod view {
    fn describe(b: core.Bag) I32 {
        core.sum(b) * 10;
    }
}
`);
    await fs.writeFile(path.join(dir, 'main.utu'), `using core from "./core.utu";
using view from "./view.utu";
export lib {
    fn make(n: I32) core.Bag {
        core.Bag { points: (0..<n) map |i| { core.Point { x: i, label: "p" }; } collect(core.Point) };
    }
    fn run(b: core.Bag) I32 {
        view.describe(b) + core.sum(b);
    }
}
`);
    const parser = await initParser({ wasmDir: `${ROOT}/` });
    const compiler = createCompiler({ parser, target: 'normal', readFile: file => fs.readFile(file, 'utf8'), resolvePath: (from, relative) => path.resolve(path.dirname(from), relative) });
    const doc = await compiler.compileFile(path.join(dir, 'main.utu'));
    const errors = [...doc.querySelectorAll('[data-error]')].map(node => node.dataset.errorMessage ?? node.dataset.error);
    assertEq(errors.join('; '), '', 'no duplicate or unresolved declarations');
    const { instance } = await instantiateLowered(emitBinary(doc), await buildImportObject(doc));
    const bag = instance.exports.make(5);
    assertEq(instance.exports.run(bag), 110, 'structs with Str fields cross the export boundary as handles');
  });

  test('modules: a module file compiles on its own, generic instantiations of its types included', async ({ ROOT }) => {
    const { instance } = await instantiateAt(ROOT, 'standalone_module.utu', `mod shapes {
    struct Box:
        | w: I32
        | kids: Array[Box]
    fn total(b: Box) I32 {
        b.kids fold(b.w) |a, k| { a + total(k); };
    }
    fn make() Box {
        Box { w: 1, kids: [Box { w: 2, kids: [] }, Box { w: 3, kids: [Box { w: 4, kids: [] }] }] };
    }
}
export lib {
    fn run() I32 { shapes.total(shapes.make()); }
}`, 'size');
    assertEq(instance.exports.run(), 10, 'recursion through Array[Self] is allowed');
  });

  test('iterators: ranges start pipelines, and collect builds arrays of arrays', async ({ ROOT }) => {
    const { instance } = await instantiateAt(ROOT, 'range_sources.utu', `export lib {
    fn squares(n: I32) I32 { let xs = (0..<n) map |i| { i * i; } collect(I32); xs[n - 1] + xs.len(); }
    fn inclusive() I32 { (1...10) sum; }
    fn empty() I32 { (5..<2) count; }
    fn search() I32 { (10..<100) bisect |v| { v * v < 2000; }; }
    fn pairs() I32 { let ps = (0..<4) map |i| { [i, i * 2]; } collect(Array[I32]); ps[3][1] + ps.len(); }
    fn shadow(n: I32) I64 { let x: ?Str = "a"; promote x { |s| => { let zero: I64 = 0; (0..<n) fold(zero) |a, i| { a + i.to_i64(); }; }, ~> -1, }; }
}`, 'size');
    const e = instance.exports;
    assertEq(e.squares(5), 21);
    assertEq(e.inclusive(), 55);
    assertEq(e.empty(), 0);
    assertEq(e.search(), 35, 'bisect over a range returns the position');
    assertEq(e.pairs(), 10);
    assertEq(e.shadow(5), 10n, 'a literal fallback takes the I64 return type through nested blocks');
  });

  test('match: negative integer and float patterns select the right arm', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'negative_patterns.utu', source: `
      export lib {
          fn sign(x: I32) I32 { match x { -1 => 10, 0 => 20, 1 => 30, - 2 => 40, -0x10 => 50, ~> 0, }; }
          fn wide(x: I64) I32 { match x { -9000000000 => 1, ~> 0, }; }
          fn real(x: F64) I32 { match x { -1.5 => 1, 1.5 => 2, ~> 0, }; }
      }
    `});
    assertEq([-1, 0, 1, -2, -16, 7].map(n => instance.exports.sign(n)).join(','), '10,20,30,40,50,0');
    assertEq(instance.exports.wide(-9000000000n), 1);
    assertEq(instance.exports.real(-1.5), 1);
    assertEq(instance.exports.real(1.5), 2);
  });

  test('match: invalid scrutinees and patterns are diagnosed instead of crashing codegen', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const cases = [
      ['export main() I32 { match "x" { 1 => 1, ~> 0, }; }', 'type-mismatch', '"x"', 'use alt for enums'],
      ['export main() I32 { match 1 { 1.5 => 1, ~> 0, }; }', 'type-mismatch', '1.5 => 1,', 'not an integer'],
      ['export main() I32 { match 1 { true => 1, ~> 0, }; }', 'type-mismatch', 'true => 1,', 'cannot match values of type I32'],
      ['export main() I32 { match true { 1 => 1, ~> 0, }; }', 'type-mismatch', '1 => 1,', 'not a Bool'],
      ['export main() I32 { match 1 { 99999999999 => 1, ~> 0, }; }', 'type-mismatch', '99999999999 => 1,', 'out of range for I32'],
      ['export main() I32 { let x: U32 = 1; match x { -1 => 1, ~> 0, }; }', 'type-mismatch', '-1 => 1,', 'out of range for U32'],
      ['export main() I32 { match 1 { 1 => 1, 0x1 => 2, ~> 0, }; }', 'duplicate-declaration', '0x1 => 2,', "Duplicate match pattern '0x1'"],
    ];
    for (const [source, kind, text, message] of cases) {
      const errors = await errorsOf(compiler, ROOT, source);
      const match = errors.find(e => e.kind === kind && e.text === text);
      assert(match, `${source}\n  got ${describe(errors)}`);
      assert(match.message.includes(message), match.message);
    }
  });

  test('operators: missing operators name the operator the user wrote', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const struct = 'struct Box:\n    | value: I32\n';
    const cases = [
      ['Bool', 'b == b', "Box has no '==' operator (Box.eq)"],
      ['I32', 'b + 1', "Box has no '+' operator (Box.add)"],
      ['Bool', 'b < b', "Box has no '<' operator"],
      ['I32', 'b[0]', "Box has no '[]' operator (Box.get_index)"],
    ];
    for (const [type, expression, message] of cases) {
      const errors = await errorsOf(compiler, ROOT, `${struct}export main() ${type} { let b = Box { value: 1 }; ${expression}; }`);
      assertEq(errors.length, 1, describe(errors));
      assertEq(errors[0].kind, 'unknown-operator');
      assertEq(errors[0].text, expression);
      assert(errors[0].message.includes(message), errors[0].message);
    }
  });

  test('types: an unknown type is reported once, where it is written', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    for (const source of [
      'export main() Nope { 1; }',
      'fn f(x: Nope) I32 { 1; }\nexport main() I32 { f(2); }',
      'fn f() ?Nope { Nope.null; }\nexport main() I32 { 1; }',
    ]) {
      const errors = await errorsOf(compiler, ROOT, source);
      const unknown = errors.filter(e => e.kind === 'unknown-type');
      assert(unknown.length >= 1 && unknown.every(e => e.text === 'Nope'), describe(errors));
      assert(!errors.some(e => e.kind === 'type-mismatch'), `no follow-on mismatches: ${describe(errors)}`);
    }
  });

  test('syntax: recovery reports each error offset once', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    for (const source of [
      'struct B:\n    | n: \nexport main() I32 { let b = B { n: 1 }; 1; }',
      'export main() I32 { let = ; let x = (1 + ; x; }',
      'fn a( { }\nfn b() I32 { 2 }\n',
    ]) {
      const errors = (await errorsOf(compiler, ROOT, source)).filter(e => e.kind === 'parse-error');
      assert(errors.length > 0, source);
      const starts = errors.map(e => e.primary.start);
      assertEq(new Set(starts).size, starts.length, `duplicate offsets in ${describe(errors)}`);
      assert(!errors.some(e => /parse error\(s\)/.test(e.message)), 'no generic summary');
    }
  });
}
