= 13. Complete Example

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

export fun main() str {
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
