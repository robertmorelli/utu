# Errors: fatal, Result, try, and errdefer

Utu has two kinds of failure, and a different tool for each.

| Failure | Tool | What happens |
| --- | --- | --- |
| A bug: a broken invariant, an index out of range, a state that cannot be | `fatal`, `assert`, bounds checks | The program traps. Nothing catches a trap. |
| Something a caller should expect: bad input, a missing key, a refused request | `Result[T, E]` | The function returns the error as a value; the caller decides. |
| A JavaScript exception from the host | `try { … } catch \|e\| { … }` | The handler runs with what was thrown. |

Fix a bug; don't return it. Return an error when a correct program can still
see it happen.

## Result

`Result[T, E]` (in the prelude) is a value of type `T`, or an error of type `E`.

```utu
fn parse_digit(c: I32) Result[I32, Str] {
    if c < 48 or c > 57 { return Result[I32, Str].err("not a digit"); };
    Result[I32, Str].ok(c - 48);
}
```

| Call | Gives |
| --- | --- |
| `Result[T, E].ok(v)` / `.err(e)` | a success / a failure |
| `r.is_ok()` / `r.is_err()` | which one it is |
| `r.value()` | the value; `fatal` on an error |
| `r.error()` | the error; `fatal` on a value |
| `r.value_or(d)` | the value, or `d` on an error |

It is an ordinary struct of std (std/Result.utu): a flag, the value, and the
error. The one not given holds Wasm's default, zero or null, and is never read.
Its fields start with `_`, which makes them std's own, so a program cannot
read them or build a Result except with `ok` and `err`. Any `T` and `E` work,
scalars included.

## try

`try r` is r's value when r is ok. Otherwise the function returns r's error
right there.

```utu
fn sum_digits(codes: Array[I32]) Result[I32, Str] {
    let total = 0;
    for (codes) |c| { total += try parse_digit(c); };
    Result[I32, Str].ok(total);
}
```

- `r` must be a `Result[T, E]`, and the function must return a
  `Result[U, E]` with the same `E`. The error is returned as it is, never
  converted. `T` and `U` may differ.
- `try` binds like `await` and `not`: `try f() + 1` is `(try f()) + 1`, and
  `try a.b()` is `try (a.b())`.
- `try { … } catch …` is still the host form. `try` with a block and no
  `catch` is a Result `try` on the block's value.
- A closure that declares a Result type may use `try`; it returns from the
  closure. A generator may not: it has no Result to return.
- `try` cannot appear in a `defer` or `errdefer`, which must not leave
  their block.

## errdefer

`errdefer e;` is a `defer` that runs only when the function returns an error:

```utu
fn load(path: Str) Result[Config, Str] {
    let handle = open(path);
    defer close(handle);                  // every return
    errdefer log("load failed: " + path); // error returns only
    let text = try read(handle);
    parse(text);
}
```

An error return is a `try` that returns an error, or a `return` (or the
function's last value) whose Result is an error, which is checked where it
returns. On such a return the pending `errdefer`s and `defer`s run together,
newest first, as Zig runs them. Any other exit of the block (its end, a `break`
or `continue`, a return of a value) drops the block's `errdefer`s unrun.
A JavaScript exception thrown through a block runs its `defer`s, newest
first, before a `catch` sees it, but no `errdefer`: it is not an error return.

A `defer` that throws does not stop the older ones: they still run, newest
first, at any exit and while unwinding, and none runs twice. Then the
exception goes on; when several were thrown, the newest, as JavaScript's
`finally` does. With `defer a(); defer b();` and `b()` throwing at the
block's end, `a()` runs, then `b()`'s exception leaves the block.

`errdefer` is legal only in a function, or a closure, that returns a Result.

## Diagnostics

| Mistake | Message |
| --- | --- |
| `try 5` | `try needs a Result, not I32` |
| `try` of `Result[I32, I32]` in a function returning `Result[I32, Str]` | `try passes on I32; the function's errors are Str` |
| `try` or `errdefer` in a function returning `I32` | `try in a function returning I32, not a Result` |
| `try` or `errdefer` in a generator | `try in a generator` |
| `try` inside a `defer` | `try in defer` |
| `r._value` | `Result has no field _value` |

See [examples/results.utu](../examples/results.utu) for a program that uses
all three.
