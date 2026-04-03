export const moduleProtocolSuccessCases = [
    {
        name: 'module-protocols-expand-through-instantiated-namespaces',
        expectedReturn: 14,
        source: `mod boxy[T] {
    proto Measure[Self] {
        measure(Self) T,
    };

    tag struct Box: Measure {
        value: T,
    }

    fun Measure.measure(self: Box) T {
        self.value;
    }

    fun via_method(box: Box) T {
        box.measure();
    }

    fun via_explicit(box: Box) T {
        Measure.measure(box);
    }
}

construct ints = boxy[i32];

fun main() i32 {
    let box: ints.Box = ints.Box { value: 7 };
    ints.via_method(box) + ints.via_explicit(box);
}`,
    },
    {
        name: 'module-local-protocol-getters-and-setters-work-through-method-sugar',
        expectedReturn: 25,
        source: `mod boxy[T] {
    proto CounterOps[Self] {
        get value: T,
        set value: T,
    };

    tag struct Box: CounterOps {
        mut value: T,
    }

    fun bump(box: Box, amount: T) T {
        box.value += amount;
        box.value;
    }

    fun read(box: Box) T {
        CounterOps.value(box);
    }
}

construct ints = boxy[i32];

fun main() i32 {
    let box: ints.Box = ints.Box { value: 9 };
    ints.bump(box, 4) + ints.read(box) - 1;
}`,
    },
    {
        name: 'module-local-protocols-work-through-open-constructs',
        expectedReturn: 17,
        source: `mod boxy[T] {
    proto Measure[Self] {
        measure(Self) T,
    };

    tag struct Box: Measure {
        value: T,
    }

    fun Measure.measure(self: Box) T {
        self.value;
    }
}

construct boxy[i32];

fun main() i32 {
    let box: Box = Box { value: 17 };
    box.measure();
}`,
    },
    {
        name: 'module-local-protocol-explicit-calls-disambiguate-shared-member-names',
        expectedReturn: 16,
        source: `mod boxy[T] {
    proto Area[Self] {
        measure(Self) T,
    };

    proto Perimeter[Self] {
        measure(Self) T,
    };

    tag struct Box: Area, Perimeter {
        width: T,
        height: T,
    }

    fun Area.measure(self: Box) T {
        self.width * self.height;
    }

    fun Perimeter.measure(self: Box) T {
        (self.width + self.height) * 2;
    }

    fun total(box: Box) T {
        Area.measure(box) + Perimeter.measure(box);
    }
}

construct ints = boxy[i32];

fun main() i32 {
    let box: ints.Box = ints.Box { width: 2, height: 3 };
    ints.total(box);
}`,
    },
];
