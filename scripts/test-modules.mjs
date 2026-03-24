import binaryen from 'binaryen';
import { compile } from '../index.js';
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

fun maybe_pair(flag: bool) Pair[i32, i32] # null {
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
];

const failureCases = [
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
