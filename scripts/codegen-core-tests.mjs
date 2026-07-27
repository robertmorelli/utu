import { compileAndInstantiate, withTempUtu } from './test-harness.mjs';

export function registerCodegenCoreTests({ test, assert, assertEq, assertNoErrors, makeCompiler }) {
  test('codegen: arithmetic + free-fn calls run as wasm', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_arith.utu',
      source: `
        export lib {
          fn add(a: I32, b: I32) I32 { a + b; }
          fn scaled_sum(a: I32, b: I32) I32 {
            let sum: I32 = add(a, b);
            let diff: I32 = a - b;
            sum * 2 + diff;
          }
          fn bit_mix(a: I32, b: I32) I32 { ((a << 2) ^ b) & 31; }
        }
      `,
    });
    assertEq(instance.exports.add(2, 3), 5);
    assertEq(instance.exports.scaled_sum(10, 4), 34);
    assertEq(instance.exports.bit_mix(3, 5), 9);
  });

  test('codegen: explainability facts include functions/exports/size', async ({ ROOT }) => {
    const { emitBinary } = await import('../src/compiler/codegen/index.js');
    const { createExplainabilityArtifacts } = await import('../src/index.js');
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'codegen_explainability.utu', `
      export lib {
        fn add(a: I32, b: I32) I32 { a + b; }
      }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      const artifacts = createExplainabilityArtifacts();
      const bin = emitBinary(doc, { artifacts });
      assert(bin.length > 0, 'expected wasm bytes');
      assert(artifacts.lowerings.some(x => x.kind === 'codegen-function'), 'expected codegen-function fact');
      assert(artifacts.lowerings.some(x => x.kind === 'codegen-export'), 'expected codegen-export fact');
      assert(artifacts.sizes.some(x => x.kind === 'wasm-module'), 'expected wasm-module size fact');
    });
  });

  test('codegen: emitBinary can return a wasm source map', async ({ ROOT }) => {
    const { emitBinary } = await import('../src/compiler/codegen/index.js');
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'codegen_source_map.utu', `
      export lib {
        fn add(a: I32, b: I32) I32 { a + b; }
      }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      assertNoErrors(doc);
      const result = emitBinary(doc, { sourceMap: true });
      assert(result.binary instanceof Uint8Array, 'expected wasm binary bytes');
      const sourceMap = JSON.parse(result.sourceMap);
      assertEq(sourceMap.version, 3, 'expected source map v3');
      assert(sourceMap.sources?.length > 0, 'expected source map sources');
      assert(sourceMap.sources.includes(file), 'expected source map to reference source file');
      // Binaryen always emits one ';' per function as a group separator, so a
      // length>0 check is too weak — it would pass even with zero real
      // mappings. Strip group/segment separators and require at least one
      // actual VLQ segment character.
      const vlqChars = sourceMap.mappings.replace(/[;,]/g, '');
      assert(vlqChars.length > 0, `expected at least one VLQ segment in mappings, got ${JSON.stringify(sourceMap.mappings)}`);
    });
  });

  test('codegen: source maps survive stringMode=native and degrade-but-survive stringMode=lowered for string-using code', async ({ ROOT }) => {
    const { emitBinary } = await import('../src/compiler/codegen/index.js');
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'codegen_source_map_strings.utu', `
      export lib {
        fn greet_len() I32 { Str.len("hello"); }
      }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      assertNoErrors(doc);

      // native: full-fidelity mappings — every emitted expr should carry loc.
      const native = emitBinary(doc, { sourceMap: true, stringMode: 'native' });
      const nativeMap = JSON.parse(native.sourceMap);
      assertEq(nativeMap.version, 3);
      assert(nativeMap.sources.includes(file), 'native: source file must appear in sources');
      const nativeSegments = nativeMap.mappings.replace(/[;,]/g, '');
      assert(nativeSegments.length > 0, 'native: expected at least one VLQ segment');

      // lowered: passes synthesise Externref/magic-import ops without debug
      // info — but the original ops in untouched functions should still have
      // mappings, so the source file must still appear and mappings must
      // still parse. This pins the documented caveat in JSDoc.
      const lowered = emitBinary(doc, { sourceMap: true, stringMode: 'lowered' });
      const loweredMap = JSON.parse(lowered.sourceMap);
      assertEq(loweredMap.version, 3, 'lowered: source map must still parse');
      assert(Array.isArray(loweredMap.sources), 'lowered: sources field must exist');
      assert(typeof loweredMap.mappings === 'string', 'lowered: mappings field must exist');
    });
  });

  test('codegen: control flow (if/while) + recursion-free locals', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_cf.utu',
      source: `
        export lib {
          fn abs(x: I32) I32 { if x < 0 { 0 - x; } else { x; }; }
          fn sum_to(n: I32) I32 {
            let i: I32 = 0;
            let acc: I32 = 0;
            while (i <= n) { acc = acc + i; i = i + 1; };
            acc;
          }
          fn fact(n: I32) I32 {
            let acc: I32 = 1;
            let i: I32 = 1;
            while (i <= n) { acc = acc * i; i = i + 1; };
            acc;
          }
        }
      `,
    });
    assertEq(instance.exports.abs(-7), 7);
    assertEq(instance.exports.abs(7), 7);
    assertEq(instance.exports.sum_to(10), 55);
    assertEq(instance.exports.fact(5), 120);
  });

  test('codegen: match lowers dense patterns to br_table and sparse to if/else', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_match.utu',
      source: `
        export lib {
          fn dense_pick(x: I32) I32 {
            match x {
              0 => 10,
              1 => 20,
              2 => 30,
              ~> 99,
            };
          }
          fn sparse_pick(x: I32) I32 {
            match x {
              0   => 1,
              100 => 2,
              ~> 0,
            };
          }
        }
      `,
    });
    assertEq(instance.exports.dense_pick(0), 10);
    assertEq(instance.exports.dense_pick(1), 20);
    assertEq(instance.exports.dense_pick(2), 30);
    assertEq(instance.exports.dense_pick(7), 99);
    assertEq(instance.exports.sparse_pick(0), 1);
    assertEq(instance.exports.sparse_pick(100), 2);
    assertEq(instance.exports.sparse_pick(50), 0);
  });

  test('codegen: sparse I64 match preserves full-width arm patterns', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_match_i64.utu',
      source: `
        export lib {
          fn dense64(x: I64) I32 {
            match x {
              0 => 10,
              1 => 20,
              2 => 30,
              ~> 99,
            };
          }
          fn pick64(x: I64) I32 {
            match x {
              0 => 1,
              4294967296 => 2,
              ~> 0,
            };
          }
        }
      `,
    });
    assertEq(instance.exports.dense64(0n), 10);
    assertEq(instance.exports.dense64(1n), 20);
    assertEq(instance.exports.dense64(2n), 30);
    assertEq(instance.exports.dense64(3n), 99);
    assertEq(instance.exports.pick64(0n), 1);
    assertEq(instance.exports.pick64(4294967296n), 2);
    assertEq(instance.exports.pick64(1n), 0);
  });

  test('codegen: F32/F64 match lowers dense and sparse float patterns', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_match_float.utu',
      source: `
        export lib {
          fn dense32(x: F32) I32 {
            match x {
              0.0 => 10,
              1.0 => 20,
              ~> 99,
            };
          }
          fn sparse32(x: F32) I32 {
            match x {
              0.0 => 1,
              100.5 => 2,
              ~> 0,
            };
          }
          fn dense64(x: F64) I32 {
            match x {
              0.0 => 10,
              1.0 => 20,
              ~> 99,
            };
          }
          fn sparse64(x: F64) I32 {
            match x {
              0.0 => 1,
              100.5 => 2,
              ~> 0,
            };
          }
        }
      `,
    });
    assertEq(instance.exports.dense32(0), 10);
    assertEq(instance.exports.dense32(1), 20);
    assertEq(instance.exports.dense32(2), 99);
    assertEq(instance.exports.sparse32(0), 1);
    assertEq(instance.exports.sparse32(100.5), 2);
    assertEq(instance.exports.sparse32(1), 0);
    assertEq(instance.exports.dense64(0), 10);
    assertEq(instance.exports.dense64(1), 20);
    assertEq(instance.exports.dense64(2), 99);
    assertEq(instance.exports.sparse64(0), 1);
    assertEq(instance.exports.sparse64(100.5), 2);
    assertEq(instance.exports.sparse64(1), 0);
  });

  test('codegen: @es value import runs through real wasm imports', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'es_value_import.utu',
      source: `
        let lucky: I32 = @es/\\41\\/;
        export lib {
          fn get_lucky() I32 { lucky; }
        }
      `,
    });
    assertEq(instance.exports.get_lucky(), 41);
  });

  test('codegen: @es function import runs through real wasm imports', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'es_function_import.utu',
      source: `
        let add: fun(I32, I32) I32 = @es/\\(a, b) => a + b\\/;
        export lib {
          fn sum(a: I32, b: I32) I32 { add(a, b); }
        }
      `,
    });
    assertEq(instance.exports.sum(3, 4), 7);
  });

  test('codegen: @es string import composes with lowered strings', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'es_string_import.utu',
      source: `
        let cat: fun(Str, Str) Str = @es/\\(a, b) => a + b\\/;
        export lib {
          fn greet() Str { cat("hi ", "there"); }
        }
      `,
    });
    assertEq(instance.exports.greet(), 'hi there');
  });

  test('codegen: @es without typed let stays diagnostic-only', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'es_missing_type.utu', `
      export lib {
        fn bad() I32 { @es/\\41\\/; }
      }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      const err = doc.querySelector('ir-dsl[name="es"][data-error-kind="invalid-dsl-usage"]');
      assert(err, 'expected unexpanded @es diagnostic');
    });
  });

  test('codegen: fun values are real wasm function references', async ({ ROOT }) => {
    const { instance, doc } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_fun_ptr.utu',
      source: `
        export lib {
          fn double(x: I32) I32 { x * 2; }
          fn triple(x: I32) I32 { x * 3; }
          fn apply(pick: Bool, n: I32) I32 {
            let f: fun(I32) I32 = double;
            let g: fun(I32) I32 = triple;
            if pick { f(n); } else { g(n); };
          }
        }
      `,
    });
    assertEq(instance.exports.apply(1, 5), 10);
    assertEq(instance.exports.apply(0, 5), 15);
    // A `fun` is a typed function reference, not a table index: ref.func to
    // produce it, call_ref to call it, and no table anywhere.
    const { emitText } = await import('../src/compiler/codegen/index.js');
    const wat = emitText(doc);
    assert(/ref\.func/.test(wat), 'expected fun values to lower to ref.func');
    assert(/call_ref/.test(wat), 'expected fun calls to lower to call_ref');
    assert(!/call_indirect|\(table /.test(wat), 'a fun must not go through a function table');
  });

  test('codegen: closures run with captured scalars and GC references', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_closures.utu',
      source: `
        struct Box:
          | v : I32
        export lib {
          fn double(x: I32) I32 { x * 2; }
          fn scalar_capture(n: I32) I32 {
            let f: cl(I32) I32 = cl(x) { x * n; };
            f(3);
          }
          fn gc_capture(n: I32) I32 {
            let b: Box = Box { v: 10 };
            let f: cl(I32) I32 = cl(x) { x + b.v + n; };
            f(1);
          }
          fn nested(m: I32) I32 {
            let outer: cl(I32) I32 = cl(x) {
              let inner: cl(I32) I32 = cl(y) { y + m; };
              inner(x);
            };
            outer(5);
          }
          fn zero_arg() I32 {
            let t: cl() I32 = cl() { 99; };
            t();
          }
          fn decayed(n: I32) I32 {
            let c: cl(I32) I32 = double;
            c(n);
          }
        }
      `,
    });
    assertEq(instance.exports.scalar_capture(7), 21);
    assertEq(instance.exports.gc_capture(4), 15);
    assertEq(instance.exports.nested(4), 9, 'inner closure must see a capture threaded through the outer one');
    assertEq(instance.exports.zero_arg(), 99);
    assertEq(instance.exports.decayed(4), 8, 'a fun decays to a cl with an empty environment');
  });

  test('codegen: scalars are snapshot and GC references are shared', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_closure_modes.utu',
      source: `
        struct Counter:
          | n : I32
        export lib {
          fn capture_modes() I32 {
            let base: I32 = 100;
            let c: Counter = Counter { n: 1 };
            let read: cl() I32 = cl() { base + c.n; };
            base = 999;
            c.n = 5;
            read();
          }
        }
      `,
    });
    // 100, not 999 — the scalar was copied into the environment when the
    // closure was built.  5, not 1 — the Counter is shared, so a mutation
    // through it is visible.
    assertEq(instance.exports.capture_modes(), 105);
  });

  test('codegen: fun decays to cl in every declared-type position', async ({ ROOT }) => {
    // Decay and literal typing both need "where does a declared type meet a
    // value?". They each grew their own list and the lists disagreed: decay
    // covered let/global/arguments but not return position, struct fields, or
    // assignment, so these three typechecked and then crashed the backend.
    // Both now read the one enumeration in type-contexts.js.
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_decay_positions.utu',
      source: `
        struct Holder:
          | cb : cl(I32) I32
        export lib {
          fn double(x: I32) I32 { x * 2; }
          fn from_return() cl(I32) I32 { double; }
          fn from_field() Holder { Holder { cb: double }; }
          fn from_assign() I32 {
            let c: cl(I32) I32 = cl(x) { x; };
            c = double;
            c(21);
          }
        }
      `,
    });
    assertEq(typeof instance.exports.from_return(), 'function', 'a returned cl is a JS function');
    assertEq(instance.exports.from_return()(4), 8);
    assert(instance.exports.from_field() != null, 'a cl stored in a struct field round-trips');
    assertEq(instance.exports.from_assign(), 42);
  });

  test('codegen: a utu closure is callable from JS as a plain function', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_closure_js.utu',
      source: `
        let js_apply: fun(cl(I32) I32, I32) I32 = @es/\\ (f, v) => f(v) \\/;
        let js_twice: fun(cl(I32) I32, I32) I32 = @es/\\ (f, v) => f(f(v)) \\/;
        export lib {
          fn to_js(n: I32) I32 {
            let f: cl(I32) I32 = cl(x) { x * n; };
            js_apply(f, 5);
          }
          fn to_js_twice(n: I32) I32 {
            let f: cl(I32) I32 = cl(x) { x + n; };
            js_twice(f, 0);
          }
        }
      `,
    });
    assertEq(instance.exports.to_js(3), 15, 'JS must be able to invoke a utu closure directly');
    assertEq(instance.exports.to_js_twice(3), 6, 'captures survive repeated invocation from JS');
  });

  test('codegen: multi-argument closure types survive type-list splitting', async ({ ROOT }) => {
    // `cl(I32, I32) I32` nested inside a `fun(...)` parameter list — splitting
    // the outer list on commas without tracking brackets truncates it to
    // "cl(I32".
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_closure_multi.utu',
      source: `
        let js_call2: fun(cl(I32, I32) I32, I32, I32) I32 = @es/\\ (f, a, b) => f(a, b) \\/;
        export lib {
          fn run(a: I32, b: I32) I32 {
            let f: cl(I32, I32) I32 = cl(x, y) { x + y; };
            js_call2(f, a, b);
          }
        }
      `,
    });
    assertEq(instance.exports.run(3, 4), 7);
  });

  test('codegen: test blocks run as wasm and asserts trap on failure', async ({ ROOT }) => {
    const { emitBinary, instantiateLowered } = await import('../src/compiler/codegen/index.js');
    const { buildImportObject } = await import('../src/index.js');
    const compiler = await makeCompiler({ ROOT, target: 'test' });
    await withTempUtu(ROOT, 'codegen_test_target.utu', `
      fn add(a: I32, b: I32) I32 { a + b; }
      test "passes" { assert add(2, 2) == 4; }
      test "fails" { assert add(2, 2) == 5; }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      assertNoErrors(doc);
      const { instance } = await instantiateLowered(emitBinary(doc), buildImportObject(doc));
      // The test target exports each `test` block so a host runner can call it.
      assert(typeof instance.exports.__test_0 === 'function', 'expected test blocks to be exported');
      instance.exports.__test_0();
      let trapped = false;
      try { instance.exports.__test_1(); } catch { trapped = true; }
      assert(trapped, 'a failing assert must trap');
    });
  });

  test('codegen: a Promise crosses to JS as a real promise', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_promise_value.utu',
      source: `
        let make: fun(Str) Promise[Str] = @es/\\ (u) => Promise.resolve("body:" + u) \\/;
        export lib { fn get(u: Str) Promise[Str] { make(u); } }
      `,
    });
    const p = instance.exports.get('/x');
    assertEq(typeof p.then, 'function', 'Promise[T] must be an actual JS promise');
    assertEq(await p, 'body:/x');
  });

  test('codegen: .then runs a utu closure as the JS callback', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_promise_then.utu',
      source: `
        let later: fun(I32) Promise[I32] = @es/\\ (v) => Promise.resolve(v * 2) \\/;
        let record: fun(I32) void = @es/\\ (v) => { globalThis.__utu_seen = v; } \\/;
        let seen: fun() I32 = @es/\\ () => globalThis.__utu_seen ?? -1 \\/;
        export lib {
          fn subscribe(n: I32) void { later(n).then(cl(v) { record(v); }); }
          fn observed() I32 { seen(); }
        }
      `,
    });
    instance.exports.subscribe(21);
    await new Promise(resolve => setTimeout(resolve, 20));
    assertEq(instance.exports.observed(), 42);
  });

  test('codegen: await suspends the wasm stack via JSPI', async ({ ROOT }) => {
    if (typeof WebAssembly.Suspending !== 'function') return; // host without JSPI
    const { promisifyExports, readRuntimeSpec } = await import('../src/runtime/host-imports.js');
    const { doc, instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_await.utu',
      source: `
        let later: fun(I32) Promise[I32] =
          @es/\\ (v) => new Promise(r => setTimeout(() => r(v * 2), 5)) \\/;
        export lib {
          fn compute(n: I32) I32 {
            let doubled: I32 = await later(n);
            doubled + 1;
          }
        }
      `,
    });
    const spec = readRuntimeSpec(doc.body.firstChild, 'promiseRuntime');
    assert(spec.awaits.includes('I32'), 'await must record its value type as a host import');
    assert(spec.asyncExports.includes('compute'), 'an export that awaits must be promisified');
    // A real timer elapses inside the wasm frame — straight-line utu code,
    // suspended and resumed by the host with no CPS transform in the compiler.
    assertEq(await promisifyExports(instance, spec).compute(20), 41);
  });

  test('codegen: @es CI examples compile cleanly', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    // These @es-bearing examples compile cleanly with the currently supported
    // surface. The other @es examples exercise pre-existing gaps unrelated to
    // the import DSL itself: pipe placeholder arity in string_roundtrip,
    // I64-vs-I32 literal defaults in imports_exports, ref.is_null syntax in
    // import_values, F32 literal defaults in codegen_structs, and unsupported
    // syntax in codegen_composition.
    const files = [
      'examples/ci/codegen_jsgen.utu',
      'examples/ci/codegen_globals.utu',
      'examples/ci/codegen_match.utu',
      'examples/ci/node_builtin_imports.utu',
    ];
    for (const rel of files) {
      const doc = await compiler.compileFile(`${ROOT}/${rel}`);
      assertNoErrors(doc);
    }
  });
}
