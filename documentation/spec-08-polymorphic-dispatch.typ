= 8. Polymorphic Dispatch

Current compiler support uses `br_on_cast` for type-based dispatch. There is
no vtable built into the language; dispatch stays explicit.

```utu
// Type-based dispatch (br_on_cast chain)
fun describe(s: Shape) str {
    alt s {
        c: Circle => "circle",
        r: Rect => "rect",
        t: Triangle => "triangle",
    };
}

```

== Future Work

First-class function references and `call_ref`-based dispatch remain planned
rather than implemented end to end today.
