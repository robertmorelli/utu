export const successCases = [
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
    let box: Box = Box { value: 7 };
    box.read();
}`,
    },
    {
        name: 'captureless-for-loops-declare-and-use-the-implicit-index-local',
        expectedReturn: 3,
        source: `fun main() i32 {
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

fun main() i32 {
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
        source: `fun main() i32 {
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

fun main() i32 {
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
        source: `fun main() i32 {
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
        source: `fun main() i64 {
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

fun main() i32 {
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

fun main() i32 {
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
        source: `fun main() i32 {
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

fun main() f32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
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

fun main() i32 {
    let a: Shape = Box { width: 2, height: 3 };
    let b: Shape = Square { side: 3 };
    Measure.measure(a) + b.measure();
}`,
    },
];

