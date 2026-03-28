export const failureCases = [
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

