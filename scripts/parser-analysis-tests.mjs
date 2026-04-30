import { withTempUtu } from './test-harness.mjs';

export function registerParserAnalysisTests({ test, assert, assertEq, assertNoErrors, makeCompiler }) {
  test('parse: free function', async ({ compiler }) => {
    const doc = compiler.parseSource(`
      export lib {
        fn add(a: i32, b: i32) i32 { a }
      }
    `);
    const fn = doc.querySelector('ir-fn');
    assert(fn, 'expected ir-fn');
    assertEq(fn.getAttribute('name'), 'add');
  });

  test('parse: struct declaration', async ({ compiler }) => {
    const doc = compiler.parseSource(`
      struct Point:
        | x : i32
        | y : i32
      export lib {
        fn Point.dist |p| () i32 { p.x }
      }
    `);
    const struct = doc.querySelector('ir-struct');
    assert(struct, 'expected ir-struct');
    assertEq(struct.getAttribute('name'), 'Point');
  });

  test('parse: enum variant payload fields are preserved', async ({ compiler }) => {
    const doc = compiler.parseSource(`
      enum Shape:
        | Circle { radius: i32 }
        | Rect { width: i32, height: i32 }
    `);
    const circle = doc.querySelector('ir-variant[name="Circle"]');
    const rect = doc.querySelector('ir-variant[name="Rect"]');
    assert(circle, 'expected ir-variant[name="Circle"]');
    assert(rect, 'expected ir-variant[name="Rect"]');
    assertEq(circle.querySelectorAll(':scope > ir-field').length, 1, 'Circle should keep one payload field');
    assertEq(rect.querySelectorAll(':scope > ir-field').length, 2, 'Rect should keep two payload fields');
  });

  test('parse: every node has a unique id', async ({ compiler }) => {
    const doc = compiler.parseSource(`export lib { fn add(a: i32, b: i32) i32 { a } }`);
    const all = doc.querySelectorAll('[id]');
    assertEq(new Set([...all].map(n => n.id)).size, all.length, 'duplicate node ids found');
  });

  test('parse: @ir DSL accepts slash-backslash delimiters', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'parser_new_dsl_delims.utu', `
      export lib {
        fn answer() i32 { @ir/\\<ir-lit kind="int" type="i32" value="42"/>\\/; }
      }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      const lit = doc.querySelector('ir-lit[value="42"]');
      assert(lit, 'expected @ir body to round-trip to ir-lit node');
    });
  });

  test('parse: source positions are stamped and survive implicit init lowering', async ({ ROOT, compiler }) => {
    const parsed = compiler.parseSource(`export lib { fn answer() i32 { 42; } }`, '/tmp/source_positions.utu');
    for (const node of [parsed.body.firstChild, ...parsed.querySelectorAll('ir-fn, ir-lit')]) {
      assert(node.dataset.row, `<${node.localName}> missing data-row`);
      assert(node.dataset.col, `<${node.localName}> missing data-col`);
      assert(node.dataset.endRow, `<${node.localName}> missing data-end-row`);
      assert(node.dataset.endCol, `<${node.localName}> missing data-end-col`);
      assertEq(node.dataset.sourceFile, '/tmp/source_positions.utu', `<${node.localName}> source file mismatch`);
    }

    const loweringCompiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'source_positions_implicit.utu', `
      struct Point:
        | x : i32
        | y : i32
      export lib {
        fn make() Point {
          let p: Point = &{ x: 1, y: 2 };
          p;
        }
      }
    `, async (file) => {
      const doc = await loweringCompiler.compileFile(file);
      const init = doc.querySelector('ir-struct-init[data-lowered-implicit-struct-init="true"]');
      assert(init, 'expected lowered implicit struct init');
      assert(init.dataset.row, 'lowered implicit init missing data-row');
      assert(init.dataset.col, 'lowered implicit init missing data-col');
      assert(init.dataset.endRow, 'lowered implicit init missing data-end-row');
      assert(init.dataset.endCol, 'lowered implicit init missing data-end-col');
      assertEq(init.dataset.sourceFile, file, 'lowered implicit init source file mismatch');
    });
  });

  test('compile: module instantiation and hoisting (in-memory)', async ({ compiler }) => {
    const doc = compiler.parseSource(`
      mod Box[T1] {
        struct &[]:
          | value : T1
        fn &.get |b| () T1 { b.value }
      }
      using Box[i32] |IntBox|;
      export lib {
        fn unwrap(b: IntBox) i32 { b.value }
      }
    `);
    assert(doc.querySelector('ir-module'), 'expected ir-module');
    assert(doc.querySelector('ir-using'), 'expected ir-using');
  });

  test('analysis: type inference stamps data-type on int literal', async ({ compiler }) => {
    const { linkTypeDecls } = await import('../src/compiler/link-type-decls.js');
    const { resolveBindings } = await import('../src/compiler/resolve-bindings.js');
    const { inferTypes } = await import('../src/compiler/infer-types.js');
    const doc = compiler.parseSource(`export lib { fn answer() i32 { 42; } }`);
    const typeIndex = linkTypeDecls(doc);
    resolveBindings(doc);
    inferTypes(doc, typeIndex);
    const lit = doc.querySelector('ir-lit[kind="int"]');
    assert(lit, 'expected ir-lit[kind="int"]');
    assert(lit.dataset.type, `ir-lit[kind="int"] has no data-type after inferTypes`);
  });

  test('analysis: alt arm bindings carry variant field types', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'analysis_alt_variant.utu', `
      enum Shape:
        | Circle { radius: i32 }
        | Rect { width: i32, height: i32 }
      export lib {
        fn area(shape: Shape) i32 {
          alt shape {
            Circle |c| => c.radius,
            ~> 0,
          };
        }
      }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      const access = doc.querySelector('ir-alt-arm[variant="Circle"] ir-field-access[field="radius"]');
      assert(access, 'expected c.radius field access');
      assertEq(access.firstElementChild?.dataset.type, 'Circle', 'alt binding should infer exact variant type');
      assertEq(access.dataset.type, 'i32', 'variant field access should resolve to payload field type');
    });
  });

  test('compile: normal target lowers supported alt before codegen', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'lowered_alt_normal.utu', `
      enum Shape:
        | Circle { radius: i32 }
        | Rect { width: i32, height: i32 }
        | Triangle { base: i32, height: i32, skew: i32 }
      export lib {
        fn classify(shape: Shape) i32 {
          alt shape {
            Circle => 7,
            ~> 0,
          };
        }
      }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      assertNoErrors(doc);
      assert(!doc.querySelector('ir-alt'), 'supported alt should be lowered out of normal-target IR');
      assert(doc.querySelector('ir-i32-eq'), 'lowered enum alt should introduce an explicit tag comparison');
      assert(doc.querySelector('ir-field-access[field="__tag"]'), 'lowered enum alt should read the synthetic __tag field');
    });
  });

  test('analysis: analyzeFile returns structured diagnostics', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'analysis_diag.utu', `export lib { fn bad() i32 { missing_name; } }`, async (file) => {
      const { doc, artifacts } = await compiler.analyzeFile(file);
      assert(doc, 'expected analysis doc');
      assert(artifacts, 'expected artifacts');
      assert(artifacts.diagnostics.some(d => d.kind === 'unknown-variable'), 'expected unknown-variable diagnostic');
    });
  });

  test('analysis: diagnostics format with source snippet', async ({ ROOT }) => {
    const { formatDiagnostics } = await import('../src/index.js');
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    const source = `export lib {
  fn bad() i32 {
    missing_name;
  }
}
`;
    await withTempUtu(ROOT, 'formatted_diag.utu', source, async (file) => {
      const { default: fs } = await import('node:fs/promises');
      let diagnostics = [];
      try {
        diagnostics = (await compiler.analyzeFile(file)).artifacts.diagnostics;
      } catch (error) {
        diagnostics = error.artifacts?.diagnostics ?? [];
      }
      const formatted = await formatDiagnostics(diagnostics, { readFile: (p) => fs.readFile(p, 'utf8') });
      assertEq(formatted.trim(), `${file}:3:5: error: Unknown variable 'missing_name'
  |
3 |     missing_name;
  |     ^`);
    });
  });

  test('resolve-methods: static call reads type from child node', async ({ compiler }) => {
    const { linkTypeDecls } = await import('../src/compiler/link-type-decls.js');
    const { resolveBindings } = await import('../src/compiler/resolve-bindings.js');
    const { inferTypes } = await import('../src/compiler/infer-types.js');
    const { resolveMethods } = await import('../src/compiler/resolve-methods.js');
    const doc = compiler.parseSource(`
      export lib {
        struct Vec:
          | x : f32
        fn Vec.zero() Vec { Vec { x: 0.0 } }
        fn make() Vec { Vec.zero() }
      }
    `);
    const typeIndex = linkTypeDecls(doc);
    resolveBindings(doc);
    inferTypes(doc, typeIndex);
    resolveMethods(doc, typeIndex);
    const errNode = doc.querySelector('[data-error^="unknown-method:null"]');
    assert(!errNode, `static call emitted null-type error: ${errNode?.getAttribute('data-error')}`);
  });

  test('std:array — inline Array[i32] auto-instantiates module', async ({ ROOT, compiler }) => {
    await withTempUtu(ROOT, 'test_array_import.utu', `
      using Array from std:array;
      export lib {
        fn make_arr() Array[i32] {
          Array[i32].new(10);
        }
      }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      assertNoErrors(doc);
      const typeDef = doc.querySelector('ir-type-def[name="Array__i32"]');
      assert(typeDef, 'expected ir-type-def[name="Array__i32"] after inline instantiation');
      const wasmArr = typeDef.querySelector('ir-wasm-array');
      assert(wasmArr, 'expected ir-wasm-array inside ir-type-def after DSL expansion');
      assertEq(wasmArr.getAttribute('elem'), 'i32', 'ir-wasm-array elem should be i32 after T1 substitution');
      assertEq(wasmArr.getAttribute('mut'), 'true', 'ir-wasm-array should be mutable');
    });
  });

  test('standard-dsls: @es and @wat plugins have expand method', async () => {
    const { createStandardDsls } = await import('../src/compiler/standard-dsls.js');
    const dsls = createStandardDsls({ parser: null, createDocument: null });
    assert(typeof dsls.es.expand === 'function', '@es missing expand()');
    assert(typeof dsls.wat.expand === 'function', '@wat missing expand()');
    assertEq(dsls.es.expand({}), null, '@es expand should return null');
    assertEq(dsls.wat.expand({}), null, '@wat expand should return null');
  });
}
