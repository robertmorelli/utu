= Complete Example Walkthrough

The spec closes with a compact program that exercises most of the language
surface. It is reproduced here as the migration target for the Typst docs.

```utu
// --- types ---

struct Todo {
    text: str,
    mut done: bool,
}

type Filter =
    | All
    | Active
    | Completed;

// --- functions ---

fun new_todo(text: str) Todo {
    Todo { text: text, done: false };
}

fun toggle(todo: Todo) void {
    todo.done = not todo.done;
}

fun matches(todo: Todo, filter: Filter) bool {
    alt filter {
        _: All => true,
        _: Active => not todo.done,
        _: Completed => todo.done,
    };
}

fun count(todos: array[Todo], filter: Filter) i32 {
    let n: i32 = 0;
    for (0..array.len(todos)) |i| {
        if matches(todos[i], filter) {
            n = n + 1;
        };
    };
    n;
}

export fun main() void {
    let todos: array[Todo] = array[Todo].new_fixed(
        new_todo("learn utu"),
        new_todo("build compiler"),
        new_todo("ship it"),
    );

    toggle(todos[0]);

    let active: i32 = count(todos, Active {});
    let label: str # null = if active > 0 { "active"; } else { null; };
    let text: str = label \ "idle";

    text -o str.concat(_, " todos");
}
```

== What This Example Demonstrates

- `Todo` shows a struct with one immutable field and one mutable field.
- `Filter` shows a sum type with several variants.
- `new_todo` shows direct struct construction and implicit returns.
- `toggle` shows mutable field assignment and the `not` operator.
- `matches` shows pattern matching over a sum type.
- `count` shows typed `let` bindings, array indexing, `array.len`, a counted
  `for` loop, and an expression return at the end of the function.
- `main` shows `array.new_fixed`, export syntax, function calls on array
  elements, nullable fallback with `\`, and a simple pipeline through
  `str.concat`.

== Why The Example Matters

Taken together, the example shows the central theme of the spec:

- data types are expressed in WasmGC-native forms
- control flow stays structured and explicit
- builtins stay minimal and explicit
- nullability stays explicit in the type surface
- the compiler mostly lowers source constructs into nearly identical Wasm
  constructs

That combination is what makes Utu distinct: it aims to feel like a small,
high-level language while still looking almost transparent when viewed through
its Wasm lowering.
