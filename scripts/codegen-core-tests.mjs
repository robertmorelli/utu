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
          fn add(a: i32, b: i32) i32 { a + b; }
          fn scaled_sum(a: i32, b: i32) i32 {
            let sum: i32 = add(a, b);
            let diff: i32 = a - b;
            sum * 2 + diff;
          }
          fn bit_mix(a: i32, b: i32) i32 { ((a << 2) ^ b) & 31; }
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
        fn add(a: i32, b: i32) i32 { a + b; }
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
        fn add(a: i32, b: i32) i32 { a + b; }
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
        fn greet_len() i32 { str.len("hello"); }
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

      // lowered: passes synthesise externref/magic-import ops without debug
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
          fn abs(x: i32) i32 { if x < 0 { 0 - x; } else { x; }; }
          fn sum_to(n: i32) i32 {
            let i: i32 = 0;
            let acc: i32 = 0;
            while (i <= n) { acc = acc + i; i = i + 1; };
            acc;
          }
          fn fact(n: i32) i32 {
            let acc: i32 = 1;
            let i: i32 = 1;
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
          fn dense_pick(x: i32) i32 {
            match x {
              0 => 10,
              1 => 20,
              2 => 30,
              ~> 99,
            };
          }
          fn sparse_pick(x: i32) i32 {
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

  test('codegen: sparse i64 match preserves full-width arm patterns', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_match_i64.utu',
      source: `
        export lib {
          fn dense64(x: i64) i32 {
            match x {
              0 => 10,
              1 => 20,
              2 => 30,
              ~> 99,
            };
          }
          fn pick64(x: i64) i32 {
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

  test('codegen: f32/f64 match lowers dense and sparse float patterns', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_match_float.utu',
      source: `
        export lib {
          fn dense32(x: f32) i32 {
            match x {
              0.0 => 10,
              1.0 => 20,
              ~> 99,
            };
          }
          fn sparse32(x: f32) i32 {
            match x {
              0.0 => 1,
              100.5 => 2,
              ~> 0,
            };
          }
          fn dense64(x: f64) i32 {
            match x {
              0.0 => 10,
              1.0 => 20,
              ~> 99,
            };
          }
          fn sparse64(x: f64) i32 {
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
        let lucky: i32 = @es/\\41\\/;
        export lib {
          fn get_lucky() i32 { lucky; }
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
        let add: fun(i32, i32) i32 = @es/\\(a, b) => a + b\\/;
        export lib {
          fn sum(a: i32, b: i32) i32 { add(a, b); }
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
        let cat: fun(str, str) str = @es/\\(a, b) => a + b\\/;
        export lib {
          fn greet() str { cat("hi ", "there"); }
        }
      `,
    });
    assertEq(instance.exports.greet(), 'hi there');
  });

  test('codegen: @es without typed let stays diagnostic-only', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'es_missing_type.utu', `
      export lib {
        fn bad() i32 { @es/\\41\\/; }
      }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      const err = doc.querySelector('ir-dsl[name="es"][data-error-kind="invalid-dsl-usage"]');
      assert(err, 'expected unexpanded @es diagnostic');
    });
  });

  test('codegen: @es CI examples compile cleanly', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    // These @es-bearing examples compile cleanly with the currently supported
    // surface. The other @es examples exercise pre-existing gaps unrelated to
    // the import DSL itself: pipe placeholder arity in string_roundtrip,
    // i64-vs-i32 literal defaults in imports_exports, ref.is_null syntax in
    // import_values, f32 literal defaults in codegen_structs, and unsupported
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
