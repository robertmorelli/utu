import { readFile } from 'node:fs/promises';
import { compile, validateWat } from '../packages/compiler/index.js';
import binaryen from 'binaryen';
import { loadNodeModuleFromSource } from '../packages/runtime/node.js';
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

tag struct Box: Measure {
    width: i32,
    height: i32,
}

tag struct Square: Measure {
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

tag struct Box: Area, Perimeter {
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
        name: 'protocol-methods-work-inside-promote-captures',
        expectedReturn: 10,
        source: `proto Measure[T] {
    measure(T) i32,
};

tag struct Box: Measure {
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
    promote maybe_box(true) |box| {
        box.measure();
    } else {
        0;
    };
}`,
    },
    {
        name: 'getter-only-protocols-dispatch-when-the-struct-explicitly-declares-them',
        expectedReturn: 12,
        source: `proto Area[T] {
    get area: i32,
};

tag struct Rect: Area {
    area: i32,
}

export fun main() i32 {
    let rect: Rect = Rect { area: 12 };
    Area.area(rect);
}`,
    },
    {
        name: 'getter-method-sugar-works-for-field-and-if-receivers',
        expectedReturn: 10,
        source: `struct Vec {
    left: i32,
    right: i32,
}

struct Holder {
    inner: Vec,
}

fun Vec.total(self: Vec) i32 {
    self.left + self.right;
}

export fun main() i32 {
    let holder: Holder = Holder { inner: Vec { left: 1, right: 2 } };
    holder.inner.total() + (if true { Vec { left: 3, right: 4 }; } else { Vec { left: 9, right: 9 }; }).total();
}`,
    },
    {
        name: 'struct-declarations-accept-trailing-semicolons',
        expectedReturn: 7,
        source: `tag struct Box {
    value: i32,
};

fun Box.read(self: Box) i32 {
    self.value;
}

export fun main() i32 {
    let box: Box = Box { value: 7 };
    box.read();
}`,
    },
    {
        name: 'captureless-for-loops-declare-and-use-the-implicit-index-local',
        expectedReturn: 3,
        source: `export fun main() i32 {
    let sum: i32 = 0;
    for (0..<3) {
        sum += 1;
    };
    sum;
}`,
    },
    {
        name: 'compound-assignments-work-for-locals-indices-and-protocol-fields',
        expectedReturn: 21,
        source: `proto CounterOps[T] {
    get value: i32,
    set value: i32,
};

tag struct Counter: CounterOps {
    mut value: i32,
};

export fun main() i32 {
    let total: i32 = 1;
    let xs: array[i32] = array[i32].new(2, 0);
    let counter: Counter = Counter { value: 5 };
    total += 4;
    total *= 2;
    xs[1] += 3;
    counter.value += xs[1];
    total + xs[1] + counter.value;
}`,
    },
    {
        name: 'compound-assignments-cover-bitwise-shift-and-boolean-operators',
        expectedReturn: 1,
        source: `export fun main() i32 {
    let bits: i32 = 3;
    let flag: bool = false;
    bits <<= 1;
    bits |= 1;
    bits &= 6;
    bits ^= 3;
    bits >>= 1;
    bits >>>= 1;
    flag or= true;
    flag and= bits == 1;
    if flag { bits; } else { 0; };
}`,
    },
    {
        name: 'boolean-and-works-with-protocol-getter-values-in-if-conditions',
        expectedReturn: 1,
        source: `proto ConstraintOps[T] {
    get is_input: bool,
    get is_satisfied: bool,
};

tag type Constraint: ConstraintOps =
    | StayConstraint {
        is_input: bool,
        is_satisfied: bool,
    };

export fun main() i32 {
    let constraint: Constraint = StayConstraint { is_input: true, is_satisfied: true };
    let sources: i32 = 0;
    if (constraint.is_input and true) {
        if constraint.is_satisfied {
            sources += 1;
        };
    };
    sources;
}`,
    },
    {
        name: 'inclusive-for-ranges-include-the-end-bound',
        expectedReturn: 6,
        source: `export fun main() i32 {
    let sum: i32 = 0;
    for (0...3) |i| {
        sum = sum + i;
    };
    sum;
}`,
    },
    {
        name: 'large-i64-literals-stay-exact-through-codegen',
        expectedReturn: 9223372036854775807n,
        source: `export fun main() i64 {
    9223372036854775807;
}`,
    },
    {
        name: 'getter-protocol-members-dispatch-for-explicit-implementers',
        expectedReturn: 22,
        source: `proto CounterOps[T] {
    get value: i32,
    bump(T) i32,
};

tag struct Counter: CounterOps {
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
    {
        name: 'protocol-types-work-in-arrays-params-and-struct-fields',
        expectedReturn: 45,
        source: `proto P[T] {
    get x: i32,
    get y: i32,
    perimeter(T) i32,
};

tag type Elipse: P =
    | Circle {
        x: i32,
        y: i32,
        r: i32,
    }
    | Oval {
        x: i32,
        y: i32,
        r: i32,
        r2: i32,
    };

tag struct Line: P {
    x: i32,
    y: i32,
    x2: i32,
    y2: i32,
};

struct Holder {
    items: array[P],
    current: P,
};

fun P.perimeter(self: Circle) i32 {
    self.r * 6;
}

fun P.perimeter(self: Oval) i32 {
    self.r + self.r2;
}

fun P.perimeter(self: Line) i32 {
    (self.x2 - self.x) + (self.y2 - self.y);
}

fun total(first: P, holder: Holder) i32 {
    first.perimeter() + holder.current.perimeter() + holder.items[2].perimeter();
}

export fun main() i32 {
    let my_ps: array[P] = array.new_default(3);
    my_ps[0] = Line { x: 0, y: 0, x2: 3, y2: 4 };
    my_ps[1] = Oval { x: 0, y: 0, r: 2, r2: 5 };
    my_ps[2] = Circle { x: 0, y: 0, r: 4 };
    let holder: Holder = Holder { items: my_ps, current: my_ps[1] };
    total(my_ps[0], holder) + my_ps[1].perimeter();
}`,
    },
    {
        name: 'array-len-method-sugar-desugars-to-the-builtin-array-len',
        expectedReturn: 3,
        source: `export fun main() i32 {
    let xs: array[i32] = array.new_default(3);
    xs.len();
}`,
    },
    {
        name: 'float-protocol-storage-example-with-trailing-struct-semicolons-compiles-and-runs',
        expectedReturn: 5,
        source: `proto P[T] {
    get x: f32,
    get y: f32,
    perimeter(T) f32,
};

tag type Elipse: P =
    | Circle {
        x: f32,
        y: f32,
        r: f32,
    }
    | Oval {
        x: f32,
        y: f32,
        r: f32,
        r2: f32,
    };

tag struct Line: P {
    x: f32,
    y: f32,
    x2: f32,
    y2: f32,
};

fun P.perimeter(self: Circle) f32 {
    2.0 * 3.14 * self.r;
}

fun P.perimeter(self: Oval) f32 {
    3.14 * (self.r + self.r2);
}

fun P.perimeter(self: Line) f32 {
    ((self.x2 - self.x)^2.0 + (self.y2 - self.y)^2.0)^0.5;
}

export fun main() f32 {
    let my_ps: array[P] = array.new_default(3);
    my_ps[0] = Line { x: 0.0, y: 0.0, x2: 3.0, y2: 4.0 };
    my_ps[1] = Oval { x: 0.0, y: 0.0, r: 0.0, r2: 0.0 };
    my_ps[2] = Circle { x: 0.0, y: 0.0, r: 0.0 };
    my_ps[0].perimeter() + my_ps[1].perimeter() + my_ps[2].perimeter();
}`,
    },
    {
        name: 'ref-equality-operators-use-reference-equality',
        expectedReturn: 3,
        source: `tag struct Box {
    value: i32,
}

export fun main() i32 {
    let a: Box = Box { value: 1 };
    let b: Box = a;
    let c: Box = Box { value: 1 };
    let total: i32 = 0;
    if a == b {
        total = total + 1;
    };
    if a != c {
        total = total + 2;
    };
    total;
}`,
    },
    {
        name: 'type-null-sugars-to-ref-null',
        expectedReturn: 1,
        source: `tag struct Box {
    value: i32,
}

export fun main() i32 {
    let maybe: ?Box = Box.null;
    if maybe == Box.null {
        1;
    } else {
        0;
    };
}`,
    },
    {
        name: 'nullable-array-elements-are-valid-and-defaultable',
        expectedReturn: 9,
        source: `tag struct Box {
    value: i32,
}

export fun main() i32 {
    let xs: array[?Box] = array[?Box].new_default(2);
    xs[0] = Box { value: 9 };
    promote xs[0] |value| {
        value.value;
    } else {
        0;
    };
}`,
    },
    {
        name: 'tagged-sum-protocol-getters-synthesize-for-variants',
        expectedReturn: 19,
        source: `proto ValueOps[T] {
    get value: i32,
    bump(T) i32,
};

tag type Counter: ValueOps =
    | EmptyCounter {
        value: i32,
    }
    | RealCounter {
        value: i32,
    };

fun ValueOps.bump(self: EmptyCounter) i32 {
    self.value;
}

fun ValueOps.bump(self: RealCounter) i32 {
    self.value + 5;
}

export fun main() i32 {
    let counter: Counter = RealCounter { value: 7 };
    ValueOps.value(counter) + counter.bump();
}`,
    },
    {
        name: 'protocol-setters-dispatch-for-explicit-implementers',
        expectedReturn: 9,
        source: `proto CounterOps[T] {
    get value: i32,
    set value: i32,
};

tag struct Counter: CounterOps {
    mut value: i32,
}

export fun main() i32 {
    let counter: Counter = Counter { value: 4 };
    counter.value = 9;
    counter.value;
}`,
    },
    {
        name: 'tagged-sum-protocol-setters-dispatch-through-parent-type',
        expectedReturn: 13,
        source: `proto CounterOps[T] {
    get value: i32,
    set value: i32,
};

tag type Counter: CounterOps =
    | EmptyCounter {
        mut value: i32,
    }
    | RealCounter {
        mut value: i32,
    };

export fun main() i32 {
    let counter: Counter = RealCounter { value: 5 };
    counter.value = 13;
    counter.value;
}`,
    },
    {
        name: 'tagged-sum-types-dispatch-protocols-through-the-parent-type',
        expectedReturn: 15,
        source: `proto Measure[T] {
    measure(T) i32,
};

tag type Shape: Measure =
    | Box { width: i32, height: i32 }
    | Square { side: i32 };

fun Measure.measure(self: Box) i32 {
    self.width * self.height;
}

fun Measure.measure(self: Square) i32 {
    self.side * self.side;
}

export fun main() i32 {
    let a: Shape = Box { width: 2, height: 3 };
    let b: Shape = Square { side: 3 };
    Measure.measure(a) + b.measure();
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
        name: 'tagged-struct-protocol-impls-must-be-declared-on-the-struct',
        message: 'cannot implement protocol "Measure" without declaring ": Measure"',
        source: `proto Measure[T] {
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
        name: 'plain-types-cannot-declare-protocol-conformance',
        message: 'must be declared with "tag type"',
        source: `proto Measure[T] {
    measure(T) i32,
};

type Shape: Measure =
    | Box { width: i32, height: i32 }
    | Square { side: i32 };

fun Measure.measure(self: Box) i32 {
    self.width * self.height;
}

fun Measure.measure(self: Square) i32 {
    self.side * self.side;
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

tag struct Box: Clone {
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
        name: 'tagged-sum-protocols-require-every-variant-to-implement',
        message: 'Variant "Square" does not fully implement protocol "Measure" required by type "Shape"; missing "measure"',
        source: `proto Measure[T] {
    measure(T) i32,
};

tag type Shape: Measure =
    | Box { width: i32, height: i32 }
    | Square { side: i32 };

fun Measure.measure(self: Box) i32 {
    self.width * self.height;
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'variants-cannot-implement-protocols-the-parent-type-did-not-declare',
        message: 'parent type "Shape" does not declare it',
        source: `proto Measure[T] {
    measure(T) i32,
};

tag type Shape =
    | Box { width: i32, height: i32 };

fun Measure.measure(self: Box) i32 {
    self.width * self.height;
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

tag struct Box: Measure {
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

tag struct Box: Measure {
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

tag struct Box: Measure {
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

tag struct Box: Measure {
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

tag struct Box: Value {
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

tag struct Box: ValueOps {
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
        name: 'protocol-setters-require-mutable-fields-on-implementers',
        message: 'declared "mut"',
        source: `proto ValueOps[T] {
    set value: i32,
};

tag struct Box: ValueOps {
    value: i32,
}

export fun main() i32 {
    let box: Box = Box { value: 1 };
    box.value = 2;
    0;
}`,
    },
    {
        name: 'protocol-setters-cannot-be-implemented-manually',
        message: 'must not be implemented with "fun"',
        source: `proto Value[T] {
    set value: i32,
};

tag struct Box: Value {
    mut value: i32,
}

fun Value.value(self: Box, next: i32) void {
    self.value = next;
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

tag struct Box: Measure {
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

tag struct Box: Area, Perimeter {
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
        name: 'explicit-protocol-calls-reject-undeclared-implementers',
        message: 'does not implement protocol "Measure" method "measure"',
        source: `proto Measure[T] {
    measure(T) i32,
};

tag struct Box: Measure {
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
        name: 'matching-fields-do-not-auto-enroll-tagged-structs-into-getter-protocols',
        message: 'does not implement protocol "Area" method "area"',
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
    {
        name: 'module-bodies-reject-test-declarations',
        message: 'test declarations are not supported inside modules in v1',
        source: `mod bad {
    test "inside" {
        assert true;
    }
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'module-bodies-reject-bench-declarations',
        message: 'bench declarations are not supported inside modules in v1',
        source: `mod bad {
    bench "inside" {
        setup {
            measure {
                0;
            }
        }
    }
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'module-bodies-reject-construct-declarations',
        message: 'construct declarations are not supported inside modules in v1',
        source: `mod boxy[T] {
    struct Box {
        value: T,
    }
}

mod bad {
    construct ints = boxy[i32];
}

export fun main() i32 {
    0;
}`,
    },
    {
        name: 'local-shadowing-is-a-hard-compile-error',
        message: 'Local shadowing is not allowed; duplicate binding "x"',
        source: `export fun main() i32 {
    let x: i32 = 1;
    {
        let x: i32 = 2;
        x;
    };
    x;
}`,
    },
    {
        name: 'for-loops-reject-multiple-range-sources',
        message: 'for loops support exactly one range source in v1',
        source: `export fun main() i32 {
    let sum: i32 = 0;
    for (0..<2, 10..<12) |i, j| {
        sum = sum + i + j;
    };
    sum;
}`,
    },
    {
        name: 'for-loops-reject-multiple-captures',
        message: 'for loops support at most one capture in v1',
        source: `export fun main() i32 {
    let sum: i32 = 0;
    for (0..<2) |i, j| {
        sum = sum + i + j;
    };
    sum;
}`,
    },
    {
        name: 'value-position-if-without-else-is-rejected',
        message: 'Value-position if expressions must include an else branch',
        source: `fun bad(flag: bool) i32 {
    if flag {
        1;
    };
}

export fun main() i32 {
    bad(true);
}`,
    },
    {
        name: 'value-position-promote-without-else-is-rejected',
        message: 'Value-position promote expressions must include an else branch',
        source: `struct Box {
    value: i32,
}

fun maybe_box(flag: bool) ?Box {
    if flag { Box { value: 41 }; } else { ref.null Box; };
}

fun bad(flag: bool) i32 {
    promote maybe_box(flag) |box| {
        box.value;
    };
}

export fun main() i32 {
    bad(true);
}`,
    },
    {
        name: 'struct-init-rejects-missing-fields',
        message: 'Missing field "right" in struct initializer for "Pair"',
        source: `struct Pair {
    left: i32,
    right: i32,
}

export fun main() i32 {
    let pair: Pair = Pair { left: 7 };
    pair.left;
}`,
    },
    {
        name: 'struct-init-rejects-duplicate-fields',
        message: 'Duplicate field "left" in struct initializer for "Pair"',
        source: `struct Pair {
    left: i32,
    right: i32,
}

export fun main() i32 {
    let pair: Pair = Pair { left: 7, left: 8, right: 9 };
    pair.left;
}`,
    },
    {
        name: 'first-class-function-reference-types-fail-early',
        message: 'First-class function reference types are not supported yet',
        source: `shimport "es" callback: fun(i32) i32;

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

tag struct Box: Measure {
    width: i32,
    height: i32,
}

tag struct Square: Measure {
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
        if (!wat.includes('(field $__tag'))
            throw new Error('Expected tagged structs to lower a hidden $__tag field');
        if (!wat.includes('(table $__utu_proto_table_measure_measure '))
            throw new Error('Expected a dedicated protocol dispatch table for Measure.measure');
        if (!wat.includes('(elem $__utu_proto_elem_measure_measure (table $__utu_proto_table_measure_measure)'))
            throw new Error('Expected Measure.measure elements to be attached to its own table');
        if (!wat.includes('call_indirect $__utu_proto_table_measure_measure'))
            throw new Error('Expected protocol dispatch to use call_indirect');
    }],
    ['tagged-sum-parent-protocol-helpers-lower-to-bare-table-dispatch', async () => {
        const source = `proto Measure[T] {
    measure(T) i32,
};

tag type Shape: Measure =
    | Box { width: i32, height: i32 }
    | Square { side: i32 };

fun Measure.measure(self: Box) i32 {
    self.width * self.height;
}

fun Measure.measure(self: Square) i32 {
    self.side * self.side;
}

export fun main() i32 {
    let shape: Shape = Box { width: 2, height: 3 };
    shape.measure();
}`;
        const { wat } = await compile(source, { mode: 'program', wat: true });
        if (wat.includes('ref.test'))
            throw new Error('Expected tagged-sum protocol helpers to avoid ref.test ladders entirely');
        if (!wat.includes('struct.get $Shape $__tag'))
            throw new Error('Expected tagged-sum protocol helpers to read the parent tag field directly');
        if (!wat.includes('call_indirect $__utu_proto_table_measure_measure'))
            throw new Error('Expected tagged-sum protocol helpers to dispatch via the method table');
    }],
    ['protocol-getter-sugar-always-goes-through-the-protocol-helper', async () => {
        const source = `proto Area[T] {
    get area: i32,
};

tag struct Rect: Area {
    area: i32,
}

        export fun main() i32 {
    let rect: Rect = Rect { area: 12 };
    rect.area;
}`;
        const { wat } = await compile(source, { mode: 'program', wat: true });
        const mainStart = wat.indexOf('(func $main');
        const mainEnd = wat.indexOf('\n  (export "main"', mainStart);
        const mainBody = mainStart >= 0 && mainEnd >= 0 ? wat.slice(mainStart, mainEnd) : '';
        if (!mainBody.includes('call $__utu_proto_dispatch_area_area_'))
            throw new Error('Expected concrete getter sugar to call the protocol dispatch helper');
        if (mainBody.includes('struct.get $Rect $area'))
            throw new Error('Expected concrete getter sugar to avoid direct struct.get bypasses');
    }],
    ['protocol-typed-arrays-lower-to-the-shared-tagged-storage-shape', async () => {
        const source = `proto P[T] {
    get x: i32,
    perimeter(T) i32,
};

tag struct Line: P {
    x: i32,
    y: i32,
};

fun P.perimeter(self: Line) i32 {
    self.x + self.y;
}

export fun main() i32 {
    let xs: array[P] = array[P].new_default(2);
    xs[0] = Line { x: 3, y: 4 };
    xs[0].perimeter();
}`;
        const { wat } = await compile(source, { mode: 'program', wat: true });
        if (!wat.includes('(type $P_array (array (mut (ref $__utu_tagged))))'))
            throw new Error('Expected array[P] to lower to an array over the shared tagged root');
        if (!wat.includes('(type $__utu_proto_default_p (sub $__utu_tagged (struct'))
            throw new Error('Expected protocol arrays to materialize an explicit default tagged value type');
        if (!wat.includes('struct.new $__utu_proto_default_p'))
            throw new Error('Expected array[P].new_default to fill from the explicit protocol default value');
        if (!wat.includes('call $__utu_proto_dispatch_p_perimeter_'))
            throw new Error('Expected protocol-typed array reads to dispatch through the protocol helper');
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
    ['no-opt-compiles-preserve-unoptimized-module-duplication', async () => {
        const optimized = await inspectOptimizedModule(makeBinaryenDceSource(50), { optimize: true });
        const raw = await inspectOptimizedModule(makeBinaryenDceSource(50), { optimize: false });
        if (raw.functionCount <= optimized.functionCount)
            throw new Error(`Expected --no-opt compilation to keep more functions than the optimized build, got raw=${raw.functionCount} optimized=${optimized.functionCount}`);
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
            if (!message.includes('Generated Wasm failed validation:'))
                throw new Error(`Expected compiler-facing validation prefix, got ${JSON.stringify(firstLine(message))}`);
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

async function inspectOptimizedModule(source, { optimize = true } = {}) {
    const { wasm } = await compile(source, { mode: 'program', optimize });
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
