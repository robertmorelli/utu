import { compileAndInstantiate, withTempUtu } from './test-harness.mjs';

export function registerCodegenHeapTests({ test, assert, assertEq, assertNoErrors, makeCompiler }) {
  test('codegen: struct round-trip — define, construct, read field, return', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_struct.utu', source: `
      struct Point:
        | x : i32
        | y : i32
      export lib {
        fn make_x(a: i32, b: i32) i32 {
          let p: Point = Point { x: a, y: b };
          p.x;
        }
        fn make_y(a: i32, b: i32) i32 {
          let p: Point = Point { x: a, y: b };
          p.y;
        }
        fn swapped(a: i32, b: i32) i32 {
          let p: Point = Point { y: b, x: a };
          p.x + p.y;
        }
      }
    ` });
    assertEq(instance.exports.make_x(7, 9), 7);
    assertEq(instance.exports.make_y(7, 9), 9);
    assertEq(instance.exports.swapped(3, 5), 8);
  });

  test('codegen: nested struct fields round-trip through struct.new/get', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_nested_struct.utu', source: `
      struct Point:
        | x : i32
        | y : i32
      struct Line:
        | start : Point
        | end : Point
      export lib {
        fn dx(ax: i32, ay: i32, bx: i32, by: i32) i32 {
          let l: Line = Line {
            start: Point { x: ax, y: ay },
            end: Point { x: bx, y: by },
          };
          l.end.x - l.start.x;
        }
      }
    ` });
    assertEq(instance.exports.dx(3, 4, 10, 20), 7);
  });

  test('codegen: struct field assignment lowers to struct.set', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_struct_set.utu', source: `
      struct Counter:
        | n : i32
      export lib {
        fn bump_twice(start: i32) i32 {
          let c: Counter = Counter { n: start };
          c.n = c.n + 1;
          c.n = c.n + 1;
          c.n;
        }
      }
    ` });
    assertEq(instance.exports.bump_twice(10), 12);
  });

  test('codegen: nested struct field assignment round-trips through cast + struct.set', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_nested_struct_set.utu', source: `
      struct Point:
        | x : i32
        | y : i32
      struct Line:
        | start : Point
        | end : Point
      export lib {
        fn shift_start(ax: i32, ay: i32) i32 {
          let l: Line = Line {
            start: Point { x: ax, y: ay },
            end: Point { x: 0, y: 0 },
          };
          l.start.x = l.start.x + 5;
          l.start.x;
        }
      }
    ` });
    assertEq(instance.exports.shift_start(7, 9), 12);
  });

  test('codegen: T.null lowers to ref.null and round-trips through promote', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_null_ref.utu', source: `
      struct Counter:
        | n : i32
      export lib {
        fn maybe_counter(flag: bool) ?Counter {
          if flag { Counter { n: 41 }; } else { Counter.null; };
        }
        fn read_counter(flag: bool) i32 {
          promote maybe_counter(flag) {
            |c| => c.n + 1,
            ~> 0,
          };
        }
      }
    ` });
    assertEq(instance.exports.read_counter(true), 42);
    assertEq(instance.exports.read_counter(false), 0);
  });

  test('codegen: context-typed null literal lowers to ref.null', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_null_literal.utu', source: `
      struct Counter:
        | n : i32
      export lib {
        fn from_let() i32 {
          let c: ?Counter = null;
          promote c {
            |value| => value.n,
            ~> 7,
          };
        }
      }
    ` });
    assertEq(instance.exports.from_let(), 7);
  });

  test('compile: normal target lowers promote before codegen', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'lowered_promote_normal.utu', `
      struct Counter:
        | n : i32
      export lib {
        fn maybe(flag: bool) ?Counter {
          if flag { Counter { n: 7 }; } else { Counter.null; };
        }
        fn unwrap(flag: bool) i32 {
          promote maybe(flag) {
            |c| => c.n,
            ~> 0,
          };
        }
      }
    `, async (file) => {
      const doc = await compiler.compileFile(file);
      assertNoErrors(doc);
      assert(!doc.querySelector('ir-promote'), 'supported promote should be lowered out of normal-target IR');
      assert(doc.querySelector('ir-ref-is-null'), 'lowered promote should introduce an explicit null test');
      assert(doc.querySelector('ir-ref-cast'), 'lowered promote should introduce an explicit ref cast');
    });
  });

  test('codegen: implicit struct init &{} works when context type is known', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_implicit_init.utu', source: `
      struct Pair:
        | a : i32
        | b : i32
      export lib {
        fn sum() i32 {
          let p: Pair = &{ a: 7, b: 8 };
          p.a + p.b;
        }
      }
    ` });
    assertEq(instance.exports.sum(), 15);
  });

  test('codegen: orelse unwraps nullable refs and uses fallback on null', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_orelse.utu', source: `
      struct Counter:
        | n : i32
      export lib {
        fn maybe_counter(flag: bool) ?Counter {
          if flag { Counter { n: 7 }; } else { Counter.null; };
        }
        fn pick(flag: bool) i32 {
          let c: Counter = maybe_counter(flag) orelse Counter { n: 99 };
          c.n;
        }
      }
    ` });
    assertEq(instance.exports.pick(true), 7);
    assertEq(instance.exports.pick(false), 99);
  });

  test('codegen: enum variant constructors lower as heap values with payload fields', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_variant_ctor.utu', source: `
      enum Shape:
        | Circle { radius: i32 }
      export lib {
        fn radius() i32 {
          let c: Circle = Circle { radius: 7 };
          c.radius;
        }
      }
    ` });
    assertEq(instance.exports.radius(), 7);
  });

  for (const tagType of ['i64', 'u32']) {
    test(`codegen: enum alt dispatch honors non-i32 tag type (${tagType})`, async ({ ROOT }) => {
      const { emitBinary, instantiateLowered } = await import('../src/compiler/codegen/index.js');
      const { linkTypeDecls } = await import('../src/compiler/link-type-decls.js');
      const { lowerBackendControl } = await import('../src/compiler/lower-backend-control.js');
      const compiler = await makeCompiler({ ROOT, target: 'analysis' });
      await withTempUtu(ROOT, `codegen_alt_${tagType}_tag.utu`, `
        enum Shape:
          | Circle { radius: i32 }
          | Rect { width: i32 }
        export lib {
          fn classify(shape: Shape) i32 {
            alt shape {
              Circle => 11,
              Rect => 22,
              ~> 99,
            };
          }
          fn circle() i32 {
            classify(Circle { radius: 7 });
          }
          fn rect() i32 {
            classify(Rect { width: 4 });
          }
        }
      `, async (file) => {
        const doc = await compiler.compileFile(file);
        assertNoErrors(doc);
        const root = doc.body.firstChild;
        const exportLib = root?.querySelector(':scope > ir-export-lib');
        for (const fn of [...exportLib?.querySelectorAll(':scope > ir-fn') ?? []]) root.appendChild(fn);
        doc.querySelector('ir-enum[name="Shape"]')?.setAttribute('tag-type', tagType);
        const typeIndex = linkTypeDecls(doc);
        lowerBackendControl(doc, typeIndex, { target: 'normal' });
        assert(!doc.querySelector('ir-alt'), `non-i32 tag alt should be lowered before codegen (${tagType})`);
        assert(
          doc.querySelector(`ir-call[data-resolved-name="${tagType}:eq"]`),
          `tag dispatch should resolve ${tagType}:eq`,
        );
        doc.querySelector('ir-fn[name="circle"]')?.setAttribute('data-export', 'wasm');
        doc.querySelector('ir-fn[name="rect"]')?.setAttribute('data-export', 'wasm');
        const { instance } = await instantiateLowered(emitBinary(doc));
        assertEq(instance.exports.circle(), 11);
        assertEq(instance.exports.rect(), 22);
      });
    });
  }

  test('codegen: alt dispatches enum variants by rec shape and fallback', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_alt_dispatch.utu', source: `
      enum Shape:
        | Circle { radius: i32 }
        | Rect { width: i32, height: i32 }
        | Triangle { base: i32, height: i32, skew: i32 }
      export lib {
        fn classify(shape: Shape) i32 {
          alt shape {
            Circle => 7,
            ~> fallback(shape),
          };
        }
        fn fallback(shape: Shape) i32 {
          alt shape {
            Rect => 12,
            Triangle => 9,
            ~> 0,
          };
        }
        fn circle() i32 { classify(Circle { radius: 7 }); }
        fn rect() i32 { classify(Rect { width: 3, height: 4 }); }
        fn triangle() i32 { classify(Triangle { base: 5, height: 4, skew: 1 }); }
      }
    ` });
    assertEq(instance.exports.circle(), 7);
    assertEq(instance.exports.rect(), 12);
    assertEq(instance.exports.triangle(), 9);
  });
}
