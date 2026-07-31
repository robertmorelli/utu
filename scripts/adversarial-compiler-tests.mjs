import { emitBinary } from '../src/index.js';
import { compileAndInstantiate, withTempUtu } from './test-harness.mjs';

export function registerAdversarialCompilerTests({ test, assert, assertEq, assertNoErrors, makeCompiler }) {
  test('adversarial: contextual nulls and default-only matches execute correctly', async ({ ROOT }) => {
    const { instance } = await compileAndInstantiate({ ROOT, makeCompiler, assertNoErrors,
      name: 'adversarial_contexts.utu', source: `
        struct Cell:
          | value : I32
        export lib {
          fn nested(a: Bool, b: Bool) ?Cell {
            if a { if b { null; } else { Cell { value: 7 }; }; } else { null; };
          }
          fn read(a: Bool, b: Bool) I32 {
            promote nested(a, b) { |cell| => cell.value, ~> 3, };
          }
          fn all_null(flag: Bool) ?Cell {
            if flag { null; } else { null; };
          }
          fn default_only(value: I32) I32 {
            match value { ~> 11, };
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
      export lib {
        fn make() Array[?Cell] { Array[?Cell].new_default(2); }
      }
    `, async file => {
      const { doc, artifacts } = await compiler.analyzeFile(file);
      assert(!artifacts.diagnostics.length, JSON.stringify(artifacts.diagnostics));
      assertNoErrors(doc);
      emitBinary(doc);
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
          item.value;
        }
        export lib {
          fn run() I32 {
            let cell: Cell = Cell { value: 1 };
            update(cell);
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
          fn &.new(left: A, right: B) & { &{ left: left, right: right }; }
        }
        export lib { fn bad() Pair[I32] { Pair[I32].new(1, 2); } }
      `],
      ['non-defaultable-type', `
        struct Cell: | value : I32
        export lib { fn bad() Array[Cell] { Array[Cell].new_default(1); } }
      `],
      ['invalid-nullable-type', `export lib { fn bad() ?I32 { null; } }`],
      ['invalid-nullable-type', `export lib { fn bad() void { null; } }`],
      ['unknown-field', `struct Cell: | value : I32\nexport lib { fn bad() Cell { Cell { value: 1, extra: 2 }; } }`],
      ['duplicate-field', `struct Cell: | value : I32 | value : F32\nexport lib { fn ok() I32 { 1; } }`],
      ['duplicate-declaration', `tag enum Choice: | A | A\nexport lib { fn ok() I32 { 1; } }`],
      ['duplicate-declaration', `export lib { fn bad(x: I32, x: I32) I32 { x; } }`],
      ['duplicate-declaration', `fn x() I32 { 1; } fn x() I32 { 2; } export lib { fn bad() I32 { x(); } }`],
      ['duplicate-declaration', `export lib { fn bad(x: I32) I32 { match x { 1 => 2, 1 => 3, ~> 4, }; } }`],
      ['unknown-method', `proto P: | value() I32\ntag struct Cell[P]: | value : I32\nexport lib { fn bad(p: P) I32 { p.value(); } }`],
      ['type-mismatch', `proto P: | value() I32\ntag struct Cell[P]: | value : I32\nfn P[Cell].value |self| (extra: I32) I32 { extra; }\nexport lib { fn bad(p: P) I32 { p.value(); } }`],
      ['integer-literal-out-of-range', `export lib { fn bad() I32 { 2147483648; } }`],
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
