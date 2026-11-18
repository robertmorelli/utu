import { compileAndInstantiate, withTempUtu } from './test-harness.mjs';

export function registerAdversarialCompilerTests({ test, assert, assertEq, assertNoErrors, makeCompiler }) {
  test('adversarial: contextual nulls and default-only matches execute correctly', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors,
      name: 'adversarial_contexts.utu', source: `
        struct Cell:
          | value : I32
        lib {
          fn nested(a: Bool, b: Bool) ?Cell {
            return if a { if b { null; } else { Cell { value: 7 }; }; } else { null; };
          }
          fn read(a: Bool, b: Bool) I32 {
            return promote nested(a, b) { |cell| => cell.value, ~> 3, };
          }
          fn all_null(flag: Bool) ?Cell {
            return if flag { null; } else { null; };
          }
          fn default_only(value: I32) I32 {
            return match value { ~> 11, };
          }
        }
      ` });
    assertEq(instance.exports.read(true, false), 7);
    assertEq(instance.exports.read(true, true), 3);
    assertEq(instance.exports.read(false, false), 3);
    assertEq(instance.exports.all_null(true), null);
    assertEq(instance.exports.default_only(99), 11);
  });

  test('adversarial: nullable generic arguments remain defaultable', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    await withTempUtu(ROOT, 'adversarial_nullable_generic.utu', `
      struct Cell:
        | value : I32
      lib {
        fn make() Array[?Cell] { return Array[?Cell].new_default(2); }
      }
    `, async file => {
      const result = await compiler.compileFile(file);
      assert(!result.diagnostics.length, JSON.stringify(result.diagnostics));
      assertNoErrors(result);
    });
  });

  test('adversarial: protocol getters and setters dynamically dispatch', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors,
      name: 'adversarial_protocol_fields.utu', source: `
        proto Value:
          | get set value : I32
        tag struct Cell[Value]:
          | value : I32
        fn update(item: Value) I32 {
          item.value = 9;
          return item.value;
        }
        lib {
          fn run() I32 {
            let cell: Cell = Cell { value: 1 };
            return update(cell);
          }
        }
      ` });
    assertEq(instance.exports.run(), 9);
  });

  test('adversarial: malformed programs diagnose instead of crashing', async ({ ROOT }) => {
    const cases = [
      ['invalid-module-arity', `
        mod Pair[A, B] {
          struct &: | left : A | right : B
          fn &.new(left: A, right: B) & { return &{ left: left, right: right }; }
        }
        lib { fn bad() Pair[I32] { return Pair[I32].new(1, 2); } }
      `],
      ['non-defaultable-type', `
        struct Cell: | value : I32
        lib { fn bad() Array[Cell] { return Array[Cell].new_default(1); } }
      `],
      ['invalid-nullable-type', `lib { fn bad() ?I32 { return null; } }`],
      ['invalid-nullable-type', `lib { fn bad() Void { null; } }`],
      ['unknown-field', `struct Cell: | value : I32
lib { fn bad() Cell { return Cell { value: 1, extra: 2 }; } }`],
      ['duplicate-field', `struct Cell: | value : I32 | value : F32
lib { fn ok() I32 { return 1; } }`],
      ['duplicate-declaration', `tag enum Choice: | A | A
lib { fn ok() I32 { return 1; } }`],
      ['duplicate-declaration', `lib { fn bad(x: I32, x: I32) I32 { return x; } }`],
      ['duplicate-declaration', `fn x() I32 { return 1; } fn x() I32 { return 2; } lib { fn bad() I32 { return x(); } }`],
      ['duplicate-declaration', `lib { fn bad(x: I32) I32 { return match x { 1 => 2, 1 => 3, ~> 4, }; } }`],
      ['unknown-method', `proto P: | value() I32
tag struct Cell[P]: | value : I32
lib { fn bad(p: P) I32 { return p.value(); } }`],
      ['type-mismatch', `proto P: | value() I32
tag struct Cell[P]: | value : I32
fn P[Cell].value |self| (extra: I32) I32 { return extra; }
lib { fn bad(p: P) I32 { return p.value(); } }`],
      ['integer-literal-out-of-range', `lib { fn bad() I32 { return 2147483648; } }`],
    ];

    for (const target of ['analysis', 'normal']) {
      const compiler = await makeCompiler({ ROOT, target });
      for (let index = 0; index < cases.length; index++) {
        const [kind, source] = cases[index];
        await withTempUtu(ROOT, `adversarial_invalid_${target}_${index}.utu`, source, async file => {
          const { artifacts } = await compiler.analyzeFile(file);
          assert(artifacts.diagnostics.some(diagnostic => diagnostic.kind === kind),
            `${target} case ${index}: expected ${kind}, got ${JSON.stringify(artifacts.diagnostics)}`);
        });
      }
    }
  });
}
