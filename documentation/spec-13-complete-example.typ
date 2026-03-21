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
    | Completed

// --- imports ---

import extern "es" console_log(str)
import extern "es" fetch(str) str # null

// --- functions ---

fn new_todo(text: str) Todo {
    Todo { text: text, done: false }
}

fn toggle(todo: Todo) {
    todo.done = not todo.done
}

fn matches(todo: Todo, filter: Filter) bool {
    match filter {
        _: All => true,
        _: Active => not todo.done,
        _: Completed => todo.done,
    }
}

fn count(todos: array[Todo], filter: Filter) i32 {
    let n: i32 = 0
    for (0..array.len(todos)) |i| {
        if matches(todos[i], filter) {
            n = n + 1
        }
    }
    n
}

export fn main() {
    let todos: array[Todo] = array[Todo].new_fixed(
        new_todo("learn utu"),
        new_todo("build compiler"),
        new_todo("ship it"),
    )

    toggle(todos[0])

    let active: i32 = count(todos, Active {})

    // Error handling with \ (else)
    let resp: str = fetch("/api/sync") \ "offline"
    resp -o console_log

    // Force unwrap — trap if null
    let data: str = fetch("/api/data") \ unreachable

    // Piped string concat
    "hello"
    -o str.concat(_, " world")
    -o console_log
}
```
