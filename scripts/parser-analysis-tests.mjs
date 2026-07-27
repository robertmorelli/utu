import { withTempUtu } from './test-harness.mjs';

export function registerParserAnalysisTests({ test, assert, assertEq, assertNoErrors, makeCompiler }) {
  test('parse: free function', async ({ compiler }) => {
    const doc = compiler.parseSource(`
      export lib {
        fn add(a: I32, b: I32) I32 { a }
      }
    `);
    const fn = doc.querySelector('ir-fn');
    assert(fn, 'expected ir-fn');
    assertEq(fn.getAttribute('name'), 'add');
  });

  test('parse: struct declaration', async ({ compiler }) => {
    const doc = compiler.parseSource(`
      struct Point:
        | x : I32
        | y : I32
      export lib {
        fn Point.dist |p| () I32 { p.x }
      }
    `);
    const struct = doc.querySelector('ir-struct');
    assert(struct, 'expected ir-struct');
    assertEq(struct.getAttribute('name'), 'Point');
  });

  test('parse: enum variant payload fields are preserved', async ({ compiler }) => {
    const doc = compiler.parseSource(`
      enum Shape:
        | Circle { radius: I32 }
        | Rect { width: I32, height: I32 }
    `);
    const circle = doc.querySelector('ir-variant[name="Circle"]');
    const rect = doc.querySelector('ir-variant[name="Rect"]');
    assert(circle, 'expected ir-variant[name="Circle"]');
    assert(rect, 'expected ir-variant[name="Rect"]');
    assertEq(circle.querySelectorAll(':scope > ir-field').length, 1, 'Circle should keep one payload field');
    assertEq(rect.querySelectorAll(':scope > ir-field').length, 2, 'Rect should keep two payload fields');
  });

  test('parse: every node has a unique id', async ({ compiler }) => {
    const doc = compiler.parseSource(`export lib { fn add(a: I32, b: I32) I32 { a } }`);
    const all = doc.querySelectorAll('[id]');
    assertEq(new Set([...all].map(n => n.id)).size, all.length, 'duplicate node ids found');
  });

  test('parse: @ir DSL accepts slash-backslash delimiters', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'parser_new_dsl_delims.utu', `
      export lib {
        fn answer() I32 { @ir/\\<ir-lit kind="int" type-name="I32" value="42"/>\\/; }
      }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      const lit = doc.querySelector('ir-lit[value="42"]');
      assert(lit, 'expected @ir body to round-trip to ir-lit node');
    });
  });

  test('parse: source positions are stamped and survive implicit init lowering', async ({ ROOT, compiler }) => {
    const parsed = compiler.parseSource(`export lib { fn answer() I32 { 42; } }`, '/tmp/source_positions.utu');
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
        | x : I32
        | y : I32
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
      using Box[I32] |IntBox|;
      export lib {
        fn unwrap(b: IntBox) I32 { b.value }
      }
    `);
    assert(doc.querySelector('ir-module'), 'expected ir-module');
    assert(doc.querySelector('ir-using'), 'expected ir-using');
  });

  test('analysis: type inference stamps data-type-name on int literal', async ({ compiler }) => {
    const { linkTypeDecls } = await import('../src/compiler/link-type-decls.js');
    const { resolveBindings } = await import('../src/compiler/resolve-bindings.js');
    const { inferTypes } = await import('../src/compiler/infer-types.js');
    const doc = compiler.parseSource(`export lib { fn answer() I32 { 42; } }`);
    const typeIndex = linkTypeDecls(doc);
    resolveBindings(doc);
    inferTypes(doc, typeIndex);
    const lit = doc.querySelector('ir-lit[kind="int"]');
    assert(lit, 'expected ir-lit[kind="int"]');
    assert(lit.dataset['typeName'], `ir-lit[kind="int"] has no data-type-name after inferTypes`);
  });

  test('analysis: alt arm bindings carry variant field types', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'analysis_alt_variant.utu', `
      enum Shape:
        | Circle { radius: I32 }
        | Rect { width: I32, height: I32 }
      export lib {
        fn area(shape: Shape) I32 {
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
      assertEq(access.firstElementChild?.dataset['typeName'], 'Circle', 'alt binding should infer exact variant type');
      assertEq(access.dataset['typeName'], 'I32', 'variant field access should resolve to payload field type');
    });
  });

  test('compile: normal target lowers supported alt before codegen', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'lowered_alt_normal.utu', `
      enum Shape:
        | Circle { radius: I32 }
        | Rect { width: I32, height: I32 }
        | Triangle { base: I32, height: I32, skew: I32 }
      export lib {
        fn classify(shape: Shape) I32 {
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
    await withTempUtu(ROOT, 'analysis_diag.utu', `export lib { fn bad() I32 { missing_name; } }`, async (file) => {
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
  fn bad() I32 {
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
          | x : F32
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

  test('std:Array — inline Array[I32] auto-instantiates module', async ({ ROOT, compiler }) => {
    await withTempUtu(ROOT, 'test_array_import.utu', `
      using Array from std:Array;
      export lib {
        fn make_arr() Array[I32] {
          Array[I32].new(10, 0);
        }
      }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      assertNoErrors(doc);
      const typeDef = doc.querySelector('ir-type-def[name="Array__I32"]');
      assert(typeDef, 'expected ir-type-def[name="Array__I32"] after inline instantiation');
      const wasmArr = typeDef.querySelector('ir-wasm-array');
      assert(wasmArr, 'expected ir-wasm-array inside ir-type-def after DSL expansion');
      assertEq(wasmArr.getAttribute('type-repr'), 'wasm-array:elem=I32:mut=true', 'ir-wasm-array type-repr should reflect T1=I32 substitution and mutability');
    });
  });

  test('types: nominal names may share Externref representation', async ({ ROOT }) => {
    const { emitText } = await import('../src/compiler/codegen/index.js');

    const invalidCompiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'nominal_externref_rejects_assignment.utu', `
      mod Document { type & = @ir/\\ <ir-wasm-ref type-repr="wasm-externref"/> \\/ }
      mod Element { type & = @ir/\\ <ir-wasm-ref type-repr="wasm-externref"/> \\/ }
      export lib {
        fn bad(element: Element) Document {
          let doc: Document = element;
          doc;
        }
      }
    `, async (file) => {
      const { doc, artifacts } = await invalidCompiler.analyzeFile(file);
      assert(doc, 'expected analysis doc for nominal Externref mismatch');
      assert(
        artifacts.diagnostics.some(d =>
          d.kind === 'type-mismatch'
          && d.data?.expected === 'Document'
          && d.data?.actual === 'Element'
        ),
        'expected Document <- Element assignment to be rejected by type-name',
      );
    });

    const normalCompiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'nominal_externref_codegen_params.utu', `
      mod Document { type & = @ir/\\ <ir-wasm-ref type-repr="wasm-externref"/> \\/ }
      mod Element { type & = @ir/\\ <ir-wasm-ref type-repr="wasm-externref"/> \\/ }
      export lib {
        fn pair(doc: Document, element: Element) void {}
      }
    `, async (file) => {
      const doc = await normalCompiler.compileFile(file);
      const root = doc.body.firstChild;
      assertEq(root.querySelector('ir-type-def[name="Document"]')?.dataset['typeRepr'], 'wasm-externref');
      assertEq(root.querySelector('ir-type-def[name="Element"]')?.dataset['typeRepr'], 'wasm-externref');
      const wat = emitText(doc);
      assert(
        /\(type \$\d+ \(func \(param externref externref\)\)/.test(wat)
          && /\(func \$pair \(type \$\d+\) \(param \$\d+ externref\) \(param \$\d+ externref\)/.test(wat),
        `expected both nominal params to lower to externref, got:\n${wat}`,
      );
    });
  });

  test('closures: parse cl literal and cl/fun types', async ({ compiler }) => {
    const doc = compiler.parseSource(`
      export lib {
        fn run(n: I32) I32 {
          let f: cl(I32) I32 = cl(x) { x * n; };
          let g: fun(I32) I32 = double;
          f(3);
        }
      }
    `);
    const closure = doc.querySelector('ir-closure');
    assert(closure, 'expected ir-closure');
    assertEq(closure.querySelectorAll(':scope > ir-param-list > ir-param').length, 1);
    assert(doc.querySelector('ir-type-cl'), 'expected ir-type-cl for cl(I32) I32');
    assert(doc.querySelector('ir-type-fn'), 'expected ir-type-fn for fun(I32) I32');
  });

  test('closures: free variables are captured, bound params are not', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'closure_captures.utu', `
      export lib {
        fn outer(n: I32, m: I32) I32 {
          let a: I32 = 5;
          let f: cl(I32) I32 = cl(x) { x * n + a; };
          let g: cl(I32) I32 = cl(x) { x + 1; };
          let h: cl(I32) I32 = cl(x) { let inner: cl(I32) I32 = cl(y) { y + m; }; x; };
          f(1) + g(2) + h(3);
        }
      }
    `, async (file) => {
      const { doc } = await compiler.analyzeFile(file);
      const root = doc.body.firstChild;
      const envs = [...root.querySelectorAll('ir-struct[name^="__ClosureEnv"]')].map(env => ({
        name: env.getAttribute('name'),
        fields: [...env.querySelectorAll(':scope > ir-field')].map(f => f.getAttribute('name')).sort(),
      }));
      const byFields = envs.map(env => env.fields.join(','));
      assert(byFields.includes('a,n'), `expected an env capturing n and a, got ${JSON.stringify(byFields)}`);
      assert(byFields.includes(''), 'expected a capture-free closure to produce an empty env');
      // `m` is free in the inner closure and must also be captured by the outer
      // one, which has to thread it inward.
      assertEq(byFields.filter(f => f === 'm').length, 2, 'expected m captured at both nesting levels');
    });
  });

  test('closures: lifted to top-level fns reading captures from the env param', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'closure_lift.utu', `
      struct Box:
        | v : I32
      export lib {
        fn run(b: Box, n: I32) I32 {
          let f: cl(I32) I32 = cl(x) { x + n; };
          f(1);
        }
      }
    `, async (file) => {
      const { doc } = await compiler.analyzeFile(file);
      const root = doc.body.firstChild;
      const lifted = root.querySelector('ir-fn[data-closure-lifted]');
      assert(lifted, 'expected a lifted closure fn');
      const params = [...lifted.querySelectorAll(':scope > ir-param-list > ir-param')]
        .map(p => p.getAttribute('name'));
      assertEq(params[0], '__env', 'environment must be the first parameter');
      assertEq(params[1], 'x', 'closure parameters follow the environment');
      const make = root.querySelector('ir-make-closure');
      assert(make, 'expected ir-make-closure at the original site');
      assertEq(make.dataset['typeName'], 'cl(I32) I32');
      assert(
        lifted.querySelector('ir-field-access[data-rewrite-kind="closure-capture-read"]'),
        'captured reads should become field reads on __env',
      );
    });
  });

  test('closures: scalars snapshot, GC references share', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'closure_modes.utu', `
      struct Box:
        | v : I32
      export lib {
        fn run(b: Box, n: F64) I32 {
          let f: cl(I32) I32 = cl(x) { x + b.v; };
          let g: cl() F64 = cl() { n; };
          f(1);
        }
      }
    `, async (file) => {
      const { doc } = await compiler.analyzeFile(file);
      const root = doc.body.firstChild;
      const modes = new Map(
        [...root.querySelectorAll('ir-struct[name^="__ClosureEnv"] > ir-field')]
          .map(f => [f.getAttribute('name'), f.dataset.captureMode]),
      );
      assertEq(modes.get('b'), 'shared', 'GC references are captured by sharing the object');
      assertEq(modes.get('n'), 'snapshot', 'scalars are captured by value');
    });
  });

  test('closures: fun decays to cl, but cl never decays to fun', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'closure_decay.utu', `
      export lib {
        fn double(x: I32) I32 { x * 2; }
        fn ok() I32 { let c: cl(I32) I32 = double; 1; }
        fn bad() I32 { let g: fun(I32) I32 = cl(x) { x * 2; }; 1; }
      }
    `, async (file) => {
      const { artifacts } = await compiler.analyzeFile(file);
      const mismatches = artifacts.diagnostics.filter(d => d.kind === 'type-mismatch');
      assertEq(mismatches.length, 1, `expected exactly one mismatch, got ${JSON.stringify(mismatches.map(m => m.message))}`);
      assert(
        /expected fun\(I32\) I32, got cl\(I32\) I32/.test(mismatches[0].message),
        `expected the cl→fun direction to be rejected, got: ${mismatches[0].message}`,
      );
    });
  });

  test('analysis: assert conditions and test bodies are typed', async ({ ROOT }) => {
    // Two separate gaps met here: ir-assert stamped itself void without
    // inferring its condition, and the analysis target — the one editors use —
    // never walked ir-test bodies at all. Either one leaves every operand
    // inside a test untyped, so operator lowering cannot pick an overload.
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'analysis_test_bodies.utu', `
      fn add(a: I32, b: I32) I32 { a + b; }
      test "adds" {
        assert add(2, 2) == 4;
      }
    `, async (file) => {
      const { doc, artifacts } = await compiler.analyzeFile(file);
      assertEq(artifacts.diagnostics.length, 0, JSON.stringify(artifacts.diagnostics.map(d => d.message)));
      // The `==` has been lowered to an I32:eq call by now, so pick out the
      // inner user call rather than whichever one comes first.
      const call = [...doc.body.firstChild.querySelectorAll('ir-test ir-call')]
        .find(node => node.firstElementChild?.getAttribute('name') === 'add');
      assert(call, 'expected the call inside the test body to survive');
      assertEq(call.dataset['typeName'], 'I32', 'calls inside a test body must be typed');
    });
  });

  test('analysis: numeric literals adopt the type their context declares', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'analysis_literal_context.utu', `
      struct Pt:
        | x : F32
      fn takes64(v: I64) I64 { v; }
      fn wide() I64 {
        let a: I64 = 0;
        let b: F32 = 1.0;
        let c: U32 = 7;
        let p: Pt = Pt { x: 2.0 };
        takes64(41);
      }
    `, async (file) => {
      const { artifacts } = await compiler.analyzeFile(file);
      assertEq(artifacts.diagnostics.length, 0, JSON.stringify(artifacts.diagnostics.map(d => d.message)));
    });
  });

  test('analysis: literal adoption is nominal, not representational', async ({ ROOT }) => {
    // Bool is a wasm i32 exactly like I32 is, so a representation-keyed rule
    // would silently accept this. Adoption is declared by name in
    // std/LiteralDefaults.utu precisely so it cannot.
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'analysis_literal_nominal.utu', `
      export lib { fn bad() Bool { let b: Bool = 1; b; } }
    `, async (file) => {
      const { artifacts } = await compiler.analyzeFile(file);
      assert(
        artifacts.diagnostics.some(d => d.kind === 'type-mismatch'),
        'an int literal must not adopt Bool just because they share a representation',
      );
    });
  });

  test('analysis: while with no condition loops forever', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'analysis_while_empty.utu', `
      export lib {
        fn spin() I32 {
          let i: I32 = 0;
          while () { i += 1; if i == 3 { return i; }; };
          i;
        }
      }
    `, async (file) => {
      const { doc, artifacts } = await compiler.analyzeFile(file);
      assertEq(artifacts.diagnostics.length, 0, JSON.stringify(artifacts.diagnostics.map(d => d.message)));
      const cond = doc.body.firstChild.querySelector('ir-while')?.firstElementChild;
      assertEq(cond?.getAttribute('value'), 'true', 'an absent condition becomes a literal true');
    });
  });

  test('analysis: export main body is typed under the analysis target', async ({ ROOT }) => {
    // Under 'normal' this is rewritten into an ir-fn and typed as a side
    // effect; under 'analysis' it stays an ir-export-main. Skipping it meant a
    // program compiled and ran correctly while the editor showed errors in it.
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'analysis_export_main.utu', `
      fn double(x: I32) I32 { x * 2; }
      export main() I32 { double(2) + double(3); }
    `, async (file) => {
      const { artifacts } = await compiler.analyzeFile(file);
      assertEq(artifacts.diagnostics.length, 0, JSON.stringify(artifacts.diagnostics.map(d => d.message)));
    });
  });

  test('analysis: pipe placeholders keep every argument', async ({ ROOT }) => {
    // The argument list arrives wrapped (pipe_args > pipe_args_with_placeholder
    // > pipe_arg*). Walking only the target's direct children dropped them all,
    // which surfaced as a bogus arity error rather than anything pipe-shaped.
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    await withTempUtu(ROOT, 'analysis_pipe_args.utu', `
      export lib {
        fn clamp(x: I32, lo: I32, hi: I32) I32 { x + lo + hi; }
        fn lead(x: I32) I32 { x -o clamp(&, 1, 10); }
        fn mid(x: I32) I32 { x -o clamp(0, &, 10); }
      }
    `, async (file) => {
      const { doc, artifacts } = await compiler.analyzeFile(file);
      assertEq(artifacts.diagnostics.length, 0, JSON.stringify(artifacts.diagnostics.map(d => d.message)));
      for (const call of doc.body.firstChild.querySelectorAll('ir-call[data-rewrite-kind="pipe-call"]')) {
        assertEq(call.querySelector(':scope > ir-arg-list').children.length, 3);
      }
    });
  });

  test('analysis: closure CI example analyses cleanly', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const { artifacts } = await compiler.analyzeFile(`${ROOT}/examples/ci/codegen_closures.utu`);
    assertEq(artifacts.diagnostics.length, 0, JSON.stringify(artifacts.diagnostics.map(d => d.message)));
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
