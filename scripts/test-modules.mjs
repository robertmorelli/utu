import { readFile } from 'node:fs/promises';
import { compile, validateWat } from '../index.js';
import binaryen from 'binaryen';
import { loadNodeModuleFromSource } from '../loadNodeModuleFromSource.mjs';
import { firstLine, runNamedCases } from './test-helpers.mjs';

const successCases = [
    {
        name: 'plain-module-qualified-type-and-associated-call',
        expectedReturn: 7,
        source: `mod vec2d {
    struct Vec {
        x: i32,
        y: i32,
    }

    fun Vec.new(x: i32, y: i32) Vec {
        Vec { x: x, y: y };
    }

    fun Vec.sum(self: Vec) i32 {
        self.x + self.y;
    }
}

export fun main() i32 {
    let v: vec2d.Vec = vec2d.Vec.new(2, 5);
    vec2d.Vec.sum(v);
}`,
    },
    {
        name: 'parameterized-module-alias-inline-and-pipe-share-one-instantiation',
        expectedReturn: 24,
        source: `mod boxy[T] {
    struct Box {
        value: T,
    }

    fun Box.new(value: T) Box {
        Box { value: value };
    }

    fun Box.get(self: Box) T {
        self.value;
    }
}

construct box_i32 = boxy[i32];

fun double_inline(value: boxy[i32].Box) i32 {
    boxy[i32].Box.get(value) * 2;
}

construct boxy[i32];

export fun main() i32 {
    let alias_box: box_i32.Box = box_i32.Box.new(7);
    let inline_box: boxy[i32].Box = alias_box;
    let opened_box: Box = Box.new(3);
    let from_pipe: i32 = box_i32.Box.get(inline_box);
    double_inline(alias_box) + from_pipe + Box.get(opened_box);
}`,
    },
    {
        name: 'open-construct-exposes-types-and-associated-functions',
        expectedReturn: 9,
        source: `mod boxy[T] {
    struct Box {
        value: T,
    }

    fun Box.new(value: T) Box {
        Box { value: value };
    }

    fun Box.get(self: Box) T {
        self.value;
    }
}

construct boxy[i32];

fun read_box(value: Box) i32 {
    Box.get(value);
}

export fun main() i32 {
    let box: Box = Box.new(9);
    read_box(box);
}`,
    },
    {
        name: 'parameterized-module-free-functions-resolve-through-construct-aliases',
        expectedReturn: 5,
        source: `mod calc[T] {
    fun id(value: T) T {
        value;
    }

    fun twice(value: T) T {
        id(value);
    }
}

construct calc_i32 = calc[i32];

export fun main() i32 {
    calc_i32.id(calc_i32.twice(5));
}`,
    },
    {
        name: 'same-name-module-types-promote-to-top-level-paths',
        expectedReturn: 14,
        source: `mod Pair[L, R] {
    struct Pair {
        left: L,
        right: R,
    }

    struct NotPair {
        one: L,
    }

    fun Pair.new(left: L, right: R) Pair {
        Pair { left: left, right: right };
    }

    fun Pair.left(self: Pair) L {
        self.left;
    }

    fun Pair.right(self: Pair) R {
        self.right;
    }

    fun NotPair.only(self: NotPair) L {
        self.one;
    }
}

construct pair_i32 = Pair[i32, i32];

export fun main() i32 {
    let pair: Pair[i32, i32] = Pair[i32, i32].new(5, 6);
    let other: pair_i32.NotPair = pair_i32.NotPair { one: 3 };
    Pair[i32, i32].left(pair) + Pair[i32, i32].right(pair) + pair_i32.NotPair.only(other);
}`,
    },
    {
        name: 'method-promotion-covers-top-level-constructs-and-promoted-types',
        expectedReturn: 22,
        source: `struct Vec {
    left: i32,
    right: i32,
}

fun Vec.new(left: i32, right: i32) Vec {
    Vec { left: left, right: right };
}

fun Vec.total(self: Vec) i32 {
    self.left + self.right;
}

mod boxy[T] {
    struct Box {
        value: T,
    }

    fun Box.new(value: T) Box {
        Box { value: value };
    }

    fun Box.get(self: Box) T {
        self.value;
    }
}

mod Pair[L, R] {
    struct Pair {
        left: L,
        right: R,
    }

    fun Pair.new(left: L, right: R) Pair {
        Pair { left: left, right: right };
    }

    fun Pair.left(self: Pair) L {
        self.left;
    }

    fun Pair.right(self: Pair) R {
        self.right;
    }
}

construct ints = boxy[i32];

fun maybe_pair(flag: bool) ?Pair[i32, i32] {
    if flag { Pair[i32, i32].new(2, 9); } else { null; };
}

export fun main() i32 {
    let vec: Vec = Vec.new(3, 4);
    let box: ints.Box = ints.Box.new(7);
    vec.total() + box.get() + Pair[i32, i32].new(5, 6).right() + (maybe_pair(true) \\ Pair[i32, i32].new(0, 0)).left();
}`,
    },
    {
        name: 'method-promotion-works-on-free-function-returns',
        expectedReturn: 11,
        source: `mod boxy[T] {
    struct Box {
        value: T,
    }

    fun Box.new(value: T) Box {
        Box { value: value };
    }

    fun Box.get(self: Box) T {
        self.value;
    }
}

construct ints = boxy[i32];

fun make_box(value: i32) ints.Box {
    ints.Box.new(value);
}

export fun main() i32 {
    make_box(11).get();
}`,
    },
    {
        name: 'module-escapes-preserve-leading-underscore-names',
        expectedReturn: 3,
        source: `mod Console[T] {
    escape |(a) => a| _log(T) T;

    fun log(t: T) T {
        _log(t);
    }
}

export fun main() i32 {
    Console[i32].log(3);
}`,
    },
    {
        name: 'protocol-method-sugar-dispatches-through-tagged-structs',
        expectedReturn: 22,
        source: `proto Measure[T] {
    measure(T) i32,
};

tag struct Box {
    width: i32,
    height: i32,
}

tag struct Square {
    side: i32,
}

fun Measure.measure(self: Box) i32 {
    self.width * self.height;
}

fun Measure.measure(self: Square) i32 {
    self.side * self.side;
}

export fun main() i32 {
    let box: Box = Box { width: 2, height: 3 };
    let square: Square = Square { side: 4 };
    box.measure() + square.measure();
}`,
    },
    {
        name: 'explicit-protocol-calls-disambiguate-shared-member-names',
        expectedReturn: 26,
        source: `proto Area[T] {
    measure(T) i32,
};

proto Perimeter[T] {
    measure(T) i32,
};

tag struct Box {
    width: i32,
    height: i32,
}

fun Area.measure(self: Box) i32 {
    self.width * self.height;
}

fun Perimeter.measure(self: Box) i32 {
    (self.width + self.height) * 2;
}

export fun main() i32 {
    let box: Box = Box { width: 3, height: 4 };
    Area.measure(box) + Perimeter.measure(box);
}`,
    },
    {
        name: 'protocol-methods-work-inside-typed-promote-captures',
        expectedReturn: 10,
        source: `proto Measure[T] {
    measure(T) i32,
};

tag struct Box {
    width: i32,
    height: i32,
}

fun maybe_box(flag: bool) ?Box {
    if flag { Box { width: 2, height: 5 }; } else { ref.null Box; };
}

fun Measure.measure(self: Box) i32 {
    self.width * self.height;
}

export fun main() i32 {
    promote maybe_box(true) |box: Box| {
        box.measure();
    } else {
        0;
    };
}`,
    },
    {
        name: 'getter-only-protocols-synthesize-field-backed-dispatch',
        expectedReturn: 12,
        source: `proto Area[T] {
    get area: i32,
};

tag struct Rect {
    area: i32,
}

export fun main() i32 {
    let rect: Rect = Rect { area: 12 };
    Area.area(rect);
}`,
    },
    {
        name: 'getter-protocol-members-synthesize-for-explicit-implementers',
        expectedReturn: 22,
        source: `proto CounterOps[T] {
    get value: i32,
    bump(T) i32,
};

tag struct Counter {
    value: i32,
}

fun CounterOps.bump(self: Counter) i32 {
    self.value + 8;
}

export fun main() i32 {
    let counter: Counter = Counter { value: 7 };
    CounterOps.value(counter) + counter.bump();
}`,
    },
];

const failureCases = [
    {
        name: 'protocol-impl-requires-tagged-structs',
        message: 'must be declared with "tag struct"',
        source: `proto Measure[T] {
    measure(T) i32,
};

struct Box {
    width: i32,
}

fun Measure.measure(self: Box) i32 {
    self.width;
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'protocol-decls-restrict-type-params-to-the-self-position',
        message: 'may only use "T" as the first parameter',
        source: `proto Clone[T] {
    clone(T) T,
};

tag struct Box {
    width: i32,
}

fun Clone.clone(self: Box) i32 {
    self.width;
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'protocol-decls-require-exactly-one-type-parameter',
        message: 'must declare exactly one type parameter',
        source: `proto Measure[T, U] {
    measure(T) i32,
};

tag struct Box {
    width: i32,
}

fun Measure.measure(self: Box) i32 {
    self.width;
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'protocol-impl-return-types-must-match',
        message: 'does not match the protocol return type',
        source: `proto Measure[T] {
    measure(T) i32,
};

tag struct Box {
    width: i32,
}

fun Measure.measure(self: Box) bool {
    true;
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'protocol-impl-params-must-match',
        message: 'does not match parameter 2',
        source: `proto Measure[T] {
    measure(T, i32) i32,
};

tag struct Box {
    width: i32,
}

fun Measure.measure(self: Box, scale: bool) i32 {
    if scale { self.width; } else { 0; };
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'duplicate-protocol-impls-are-rejected',
        message: 'Duplicate protocol implementation',
        source: `proto Measure[T] {
    measure(T) i32,
};

tag struct Box {
    width: i32,
}

fun Measure.measure(self: Box) i32 {
    self.width;
}

fun Measure.measure(self: Box) i32 {
    self.width + 1;
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'protocol-getters-cannot-be-implemented-manually',
        message: 'must not be implemented with "fun"',
        source: `proto Value[T] {
    get value: i32,
};

tag struct Box {
    value: i32,
}

fun Value.value(self: Box) i32 {
    self.value;
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'protocol-getters-require-matching-fields-on-implementers',
        message: 'must declare field "value"',
        source: `proto ValueOps[T] {
    get value: i32,
    score(T) i32,
};

tag struct Box {
    width: i32,
}

fun ValueOps.score(self: Box) i32 {
    self.width;
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'protocol-implementers-must-cover-all-members',
        message: 'does not fully implement protocol "Measure"; missing "perimeter"',
        source: `proto Measure[T] {
    area(T) i32,
    perimeter(T) i32,
};

tag struct Box {
    width: i32,
}

fun Measure.area(self: Box) i32 {
    self.width;
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'protocol-method-sugar-rejects-ambiguous-members',
        message: 'Ambiguous protocol method ".measure()"',
        source: `proto Area[T] {
    measure(T) i32,
};

proto Perimeter[T] {
    measure(T) i32,
};

tag struct Box {
    width: i32,
    height: i32,
}

fun Area.measure(self: Box) i32 {
    self.width * self.height;
}

fun Perimeter.measure(self: Box) i32 {
    (self.width + self.height) * 2;
}

export fun main() i32 {
    let box: Box = Box { width: 3, height: 4 };
    box.measure();
}`,
    },
    {
        name: 'explicit-protocol-calls-reject-missing-impls',
        message: 'does not implement protocol "Measure" method "measure"',
        source: `proto Measure[T] {
    measure(T) i32,
};

tag struct Box {
    width: i32,
}

tag struct Square {
    side: i32,
}

fun Measure.measure(self: Box) i32 {
    self.width;
}

export fun main() i32 {
    let square: Square = Square { side: 4 };
    Measure.measure(square);
}`,
    },
    {
        name: 'tagged-structs-cannot-shadow-the-hidden-tag-field',
        message: 'cannot declare a field named "__tag"',
        source: `tag struct Box {
    __tag: i32,
    width: i32,
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'typed-promote-captures-still-need-a-compatible-type',
        message: "local.set's value type must be correct",
        source: `struct Box {
    value: i32,
}

fun maybe_box(flag: bool) ?Box {
    if flag { Box { value: 41 }; } else { ref.null Box; };
}

export fun main() i32 {
    promote maybe_box(true) |n: i32| {
        n;
    } else {
        0;
    };
}`,
    },
    {
        name: 'open-construct-rejects-type-collisions',
        message: 'would collide on type "Box"',
        source: `struct Box {
    value: i32,
}

mod boxy[T] {
    struct Box {
        value: T,
    }
}

construct boxy[i32];

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'open-construct-rejects-value-collisions',
        message: 'would collide on value "answer"',
        source: `let answer: i32 = 41;

mod boxy[T] {
    fun answer() T {
        fatal;
    }
}

construct boxy[i32];

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'construct-rejects-wrong-type-arity',
        message: 'expects 1 type argument(s), received 2',
        source: `mod boxy[T] {
    struct Box {
        value: T,
    }
}

construct bad = boxy[i32, i64];

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'module-bodies-reject-export-declarations',
        message: 'export declarations are not supported inside modules in v1',
        source: `mod bad {
    export fun nope() i32 {
        0;
    }
}

export fun main() i32 {
    0;
}`,
    },
];

const binaryenValidationCases = [
    {
        name: 'binaryen-return-type-validation',
        message: 'function body type must match',
        wat: `(module (func $bad (result i32) (ref.null extern)))`,
    },
    {
        name: 'binaryen-call-arg-validation',
        message: 'call param types must match',
        wat: `(module (func $add (param i32 i32) (result i32) (i32.const 0)) (func $bad (result i32) (call $add (ref.null extern) (i32.const 1))))`,
    },
    {
        name: 'binaryen-global-init-validation',
        message: 'global init must be constant',
        wat: `(module (func $one (result i32) (i32.const 1)) (global $bad i32 (call $one)))`,
    },
    {
        name: 'binaryen-nullability-validation',
        message: 'function body type must match',
        wat: `(module (type $Box (struct (field i32))) (func $bad (result (ref $Box)) (ref.null $Box)))`,
    },
];

const binaryenCompileFailureCases = [
    {
        name: 'binaryen-compile-return-type-validation',
        path: 'scripts/fixtures/compile_bad_return_type.utu',
        message: 'function body type must match',
    },
    {
        name: 'binaryen-compile-call-arg-validation',
        path: 'scripts/fixtures/compile_bad_call_args.utu',
        message: 'call param types must match',
    },
    {
        name: 'binaryen-compile-nullability-validation',
        path: 'scripts/fixtures/compile_nullability_mismatch.utu',
        message: 'function body type must match',
    },
    {
        name: 'binaryen-compile-global-init-validation',
        path: 'scripts/fixtures/compile_illegal_global_init.utu',
        message: 'global init must be constant',
    },
];

const cases = [
    ...successCases.map((testCase) => [testCase.name, async () => {
        const actual = await compileAndRun(testCase.source);
        if (actual !== testCase.expectedReturn)
            throw new Error(`Expected return ${testCase.expectedReturn}, got ${actual}`);
    }]),
    ['method-sugar-does-not-add-struct-fields', async () => {
        const source = `struct Vec {
    x: i32,
    y: i32,
}

fun Vec.new(x: i32, y: i32) Vec {
    Vec { x: x, y: y };
}

fun Vec.sum(self: Vec) i32 {
    self.x + self.y;
}

export fun main() i32 {
    let v: Vec = Vec.new(3, 4);
    v.sum();
}`;
        const { wat } = await compile(source, { mode: 'program', wat: true });
        const structBody = wat.match(/\(type \$Vec \(struct([\s\S]*?)\)\s*\)/)?.[1] ?? '';
        const fieldCount = (structBody.match(/\(field /g) ?? []).length;
        if (fieldCount !== 2)
            throw new Error(`Vec struct has ${fieldCount} WAT field(s), expected exactly 2. Method sugar must not add implicit fields to the struct.`);
    }],
    ['tagged-structs-add-hidden-tags-and-emit-call-indirect-dispatch', async () => {
        const source = `proto Measure[T] {
    measure(T) i32,
};

tag struct Box {
    width: i32,
    height: i32,
}

tag struct Square {
    side: i32,
}

fun Measure.measure(self: Box) i32 {
    self.width * self.height;
}

fun Measure.measure(self: Square) i32 {
    self.side * self.side;
}

export fun main() i32 {
    let box: Box = Box { width: 2, height: 3 };
    box.measure();
}`;
        const { wat } = await compile(source, { mode: 'program', wat: true });
        if (!wat.includes('(field $__tag i32)'))
            throw new Error('Expected tagged structs to lower a hidden $__tag field');
        if (!wat.includes('(table $__utu_proto_table_measure_measure 2 funcref)'))
            throw new Error('Expected a dedicated protocol dispatch table for Measure.measure');
        if (!wat.includes('(elem $__utu_proto_elem_measure_measure (table $__utu_proto_table_measure_measure)'))
            throw new Error('Expected Measure.measure elements to be attached to its own table');
        if (!wat.includes('call_indirect $__utu_proto_table_measure_measure'))
            throw new Error('Expected protocol dispatch to use call_indirect');
    }],
    ['unresolved-field-call-throws-instead-of-emitting-call-ref', async () => {
        try {
            await compile(`export fun main() i32 { let x: i32 = 0; x.ghost(); }`, { mode: 'program' });
        } catch (error) {
            if (String(error?.message ?? error).includes('ghost')) return;
            throw new Error(`Expected error mentioning 'ghost', got: ${error?.message}`);
        }
        throw new Error('Expected compile to fail for unresolved method call');
    }],
    ['binaryen-strips-unused-instantiated-functions', async () => {
        const single = await inspectOptimizedModule(makeBinaryenDceSource(1));
        const many = await inspectOptimizedModule(makeBinaryenDceSource(50));
        if (many.functionCount !== single.functionCount)
            throw new Error(`Expected 50 instantiations to keep ${single.functionCount} optimized function(s), got ${many.functionCount}`);
    }],
    ...binaryenValidationCases.map((testCase) => [testCase.name, async () => {
        const result = await validateWat(testCase.wat);
        if (!result) throw new Error('Expected WAT validation to fail');
        if (result.message.includes('WebAssembly.Module'))
            throw new Error(`Expected Binaryen diagnostic, got: ${JSON.stringify(firstLine(result.message))}`);
        if (!result.message.includes(testCase.message))
            throw new Error(`Expected message to include ${JSON.stringify(testCase.message)}, got ${JSON.stringify(firstLine(result.message))}`);
        if (!result.binaryenOutput.join('\n').includes(testCase.message))
            throw new Error(`Expected binaryen output to include ${JSON.stringify(testCase.message)}, got ${JSON.stringify(result.binaryenOutput)}`);
    }]),
    ...binaryenCompileFailureCases.map((testCase) => [testCase.name, async () => {
        const source = await readFile(new URL(`../${testCase.path}`, import.meta.url), 'utf8');
        try {
            await compile(source, { mode: 'program' });
        } catch (error) {
            const message = String(error?.message ?? error);
            if (message.includes('WebAssembly.Module'))
                throw new Error(`Expected Binaryen diagnostic, got: ${JSON.stringify(firstLine(message))}`);
            if (message.includes(testCase.message)) return;
            throw new Error(`Expected ${JSON.stringify(testCase.message)}, got ${JSON.stringify(firstLine(message))}`);
        }
        throw new Error('Expected compile to fail');
    }]),
    ...failureCases.map((testCase) => [testCase.name, async () => {
        try {
            await compile(testCase.source, { mode: 'program' });
        } catch (error) {
            const message = String(error?.message ?? error);
            if (message.includes(testCase.message)) return;
            throw new Error(`Expected ${JSON.stringify(testCase.message)}, got ${JSON.stringify(firstLine(message))}`);
        }
        throw new Error('Expected compile to fail');
    }]),
];

if (await runNamedCases(cases))
    process.exit(1);

async function compileAndRun(source) {
    const { shim } = await compile(source, { mode: 'program' });
    const compiledModule = await loadNodeModuleFromSource(shim, { prefix: 'utu-modules-' });
    try {
        const exports = await compiledModule.module.instantiate();
        if (typeof exports.main !== 'function')
            throw new Error('Missing export "main"');
        return exports.main();
    } finally {
        await compiledModule.cleanup?.();
    }
}

async function inspectOptimizedModule(source) {
    const { wasm } = await compile(source, { mode: 'program' });
    const mod = binaryen.readBinary(wasm);
    try {
        return { functionCount: mod.getNumFunctions() };
    } finally {
        mod.dispose();
    }
}

function makeBinaryenDceSource(count) {
    const types = Array.from({ length: count }, (_, index) => `struct T${index} {\n    value: i32,\n}`).join('\n\n');
    const constructs = Array.from({ length: count }, (_, index) => `construct foo_${index} = foo[T${index}];`).join('\n');
    return `shimport "es" input: i32;

mod foo[T] {
    fun bar(value: T) T {
        value;
    }
}

${types}

${constructs}

export fun main() i32 {
    foo_0.bar(T0 { value: input }).value;
}`;
}
