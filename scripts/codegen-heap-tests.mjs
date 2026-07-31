import { compileAndInstantiate, withTempUtu } from './test-harness.mjs';

export function registerCodegenHeapTests({ test, assert, assertEq, assertNoErrors, makeCompiler }) {
  test('codegen: protocols dispatch across struct and enum implementors', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({
      ROOT,
      makeCompiler,
      assertNoErrors,
      name: 'codegen_protocol_dispatch.utu',
      source: `
        proto Score:
          | score(I32) I32
        struct Point[Score]:
          | value : I32
        tag enum Item[Score]:
          | Bonus { value: I32 }
        fn Score[Point].score |self| (bonus: I32) I32 { self.value + bonus; }
        fn Score[Bonus].score |self| (bonus: I32) I32 { self.value * 2 + bonus; }
        fn total(values: Array[Score]) I32 {
          let out: I32 = 0;
          for (0..<values.len()) |i| { out += values[i].score(1); };
          out;
        }
        export main() I32 {
          let values: Array[Score] = Array[Score].new_default(2);
          values[0] = Point { value: 3 };
          values[1] = Bonus { value: 4 };
          total(values);
        }
      `,
    });
    assertEq(instance.exports.main(), 13);
  });

  test('codegen: WasmGC arrays support fill, indexing, mutation, and nested loops', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_arrays_nested.utu', source: `
      export lib {
        fn count_primes(n: I32) I32 {
          let flags: Array[I32] = Array[I32].new(n, 1);
          flags[0] = 0;
          flags[1] = 0;
          let p: I32 = 2;
          while (p * p < n) {
            if flags[p] == 1 {
              let j: I32 = p * p;
              while (j < n) { flags[j] = 0; j = j + p; };
            };
            p = p + 1;
          };
          let i: I32 = 2;
          let count: I32 = 0;
          while (i < n) { count = count + flags[i]; i = i + 1; };
          count;
        }
      }
    ` });
    assertEq(instance.exports.count_primes(100), 25);
  });

  test('codegen: struct round-trip — define, construct, read field, return', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_struct.utu', source: `
      struct Point:
        | x : I32
        | y : I32
      export lib {
        fn make_x(a: I32, b: I32) I32 {
          let p: Point = Point { x: a, y: b };
          p.x;
        }
        fn make_y(a: I32, b: I32) I32 {
          let p: Point = Point { x: a, y: b };
          p.y;
        }
        fn swapped(a: I32, b: I32) I32 {
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
        | x : I32
        | y : I32
      struct Line:
        | start : Point
        | end : Point
      export lib {
        fn dx(ax: I32, ay: I32, bx: I32, by: I32) I32 {
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
        | n : I32
      export lib {
        fn bump_twice(start: I32) I32 {
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
        | x : I32
        | y : I32
      struct Line:
        | start : Point
        | end : Point
      export lib {
        fn shift_start(ax: I32, ay: I32) I32 {
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
        | n : I32
      export lib {
        fn maybe_counter(flag: Bool) ?Counter {
          if flag { Counter { n: 41 }; } else { Counter.null; };
        }
        fn read_counter(flag: Bool) I32 {
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
        | n : I32
      export lib {
        fn from_let() I32 {
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

  test('codegen: bare null in an if branch adopts the nullable return type', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_null_branch.utu', source: `
      struct Counter:
        | n : I32
      export lib {
        fn maybe(flag: Bool) ?Counter {
          if flag { Counter { n: 9 }; } else { null; };
        }
        fn read(flag: Bool) I32 {
          promote maybe(flag) {
            |value| => value.n,
            ~> 4,
          };
        }
      }
    ` });
    assertEq(instance.exports.read(true), 9);
    assertEq(instance.exports.read(false), 4);
  });

  test('codegen: promote preserves a literal false fallback', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors, name: 'codegen_promote_false.utu', source: `
      struct Counter:
        | n : I32
      export lib {
        fn has_value(flag: Bool) Bool {
          let value: ?Counter = if flag { Counter { n: 1 }; } else { null; };
          promote value {
            |counter| => true,
            ~> false,
          };
        }
      }
    ` });
    assertEq(instance.exports.has_value(true), 1);
    assertEq(instance.exports.has_value(false), 0);
  });

  test('compile: normal target lowers promote before codegen', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'lowered_promote_normal.utu', `
      struct Counter:
        | n : I32
      export lib {
        fn maybe(flag: Bool) ?Counter {
          if flag { Counter { n: 7 }; } else { Counter.null; };
        }
        fn unwrap(flag: Bool) I32 {
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
        | a : I32
        | b : I32
      export lib {
        fn sum() I32 {
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
        | n : I32
      export lib {
        fn maybe_counter(flag: Bool) ?Counter {
          if flag { Counter { n: 7 }; } else { Counter.null; };
        }
        fn pick(flag: Bool) I32 {
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
        | Circle { radius: I32 }
      export lib {
        fn radius() I32 {
          let c: Circle = Circle { radius: 7 };
          c.radius;
        }
      }
    ` });
    assertEq(instance.exports.radius(), 7);
  });

  for (const tagType of ['I64', 'U32']) {
    test(`codegen: enum alt dispatch honors non-I32 tag type (${tagType})`, async ({ ROOT }) => {
      const { emitBinary, instantiateLowered } = await import('../src/compiler/codegen/index.js');
      const { linkTypeDecls } = await import('../src/compiler/link-type-decls.js');
      const { lowerBackendControl } = await import('../src/compiler/lower-backend-control.js');
      const compiler = await makeCompiler({ ROOT, target: 'analysis' });
      await withTempUtu(ROOT, `codegen_alt_${tagType}_tag.utu`, `
        enum Shape:
          | Circle { radius: I32 }
          | Rect { width: I32 }
        export lib {
          fn classify(shape: Shape) I32 {
            alt shape {
              Circle => 11,
              Rect => 22,
              ~> 99,
            };
          }
          fn circle() I32 {
            classify(Circle { radius: 7 });
          }
          fn rect() I32 {
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
        assert(!doc.querySelector('ir-alt'), `non-I32 tag alt should be lowered before codegen (${tagType})`);
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
        | Circle { radius: I32 }
        | Rect { width: I32, height: I32 }
        | Triangle { base: I32, height: I32, skew: I32 }
      export lib {
        fn classify(shape: Shape) I32 {
          alt shape {
            Circle => 7,
            ~> fallback(shape),
          };
        }
        fn fallback(shape: Shape) I32 {
          alt shape {
            Rect => 12,
            Triangle => 9,
            ~> 0,
          };
        }
        fn circle() I32 { classify(Circle { radius: 7 }); }
        fn rect() I32 { classify(Rect { width: 3, height: 4 }); }
        fn triangle() I32 { classify(Triangle { base: 5, height: 4, skew: 1 }); }
      }
    ` });
    assertEq(instance.exports.circle(), 7);
    assertEq(instance.exports.rect(), 12);
    assertEq(instance.exports.triangle(), 9);
  });
}
