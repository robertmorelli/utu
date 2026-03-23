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
    let from_pipe: i32 = inline_box -o boxy[i32].Box.get(_);
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
