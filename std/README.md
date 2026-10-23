Standard library `.utu` files are embedded under `std:<basename>` at build time.
Basenames must be unique.

`std:Browser` is not a `.utu` file. It is the browser and standard JavaScript
declaration graph, linked from TypeScript's `lib.dom` and `lib.es*` and embedded
compressed in the compiler. It is decoded on first import. Programs use its
types, properties, and methods directly; only the operations a program uses emit
boundary code.

`std:JS` is the ECMAScript subset of the same graph (`Array`, `Map`, `JSON`,
`Math`, `Promise`, …) and `std:Web` the web APIs every modern runtime shares
(`fetch`, `URL`, streams, `crypto`, timers, …). `std:Worker` is a web worker's
global scope, linked from `lib.webworker`. See the table in
[the declaration guide](../docs/typescript-abi.md).

Numbers convert explicitly with one instruction each: `i.to_f64()`,
`f.to_i32()`, `n.to_i64()`, `x.to_f32()`, and so on. Float-to-integer
conversions saturate, and NaN becomes 0, like Rust's `as`. Integer literals
adopt a float type from context (`let x: F64 = 1`).

Regenerate the browser declarations with `bun run bindings:browser`, then build
with `bun run build`. See [the declaration guide](../docs/typescript-abi.md).

To intern spans of a byte mem without copying them, use the mem's own
`intern(start, stop)` (see the spec); `std:Interner` is for keys from anywhere.

`std:IntMap` maps `I32` keys to `I32` values (`set`, `get(key, missing)`, `has`,
`len`). `std:Interner` gives byte strings dense ids in first-seen order: call
`begin()`, `byte(b)` for each byte (from a mem, an array, or a string), then
`finish()`; the same bytes always get the same id. `size`, `byte_at`, and `ascii`
read a key back.

## Everyday modules

Each function ships only when a program uses it; most are one call to the
host's own (JavaScript's string methods, `Math`).

- `Str` (prelude): `index_of(part, from)`, `last_index_of`, `contains`, `starts_with`,
  `ends_with`, `trim` (and `_start`, `_end`), `to_upper`, `to_lower`,
  `repeat`, `replace` (every occurrence), `pad_start`, `pad_end`, `split`
  (to `Array[Str]`), `sep.join(parts)`, `parse_i32(fallback)`, `parse_f64()`
  (NaN when it is not a number).
- `F64` (prelude): `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`,
  `exp`, `ln`, `log2`, `log10`, `pow`, `cbrt`, `hypot`, `is_nan`,
  `is_finite`; `F64.pi()`, `F64.e()`, `F64.inf()`, `F64.nan()`.
- `Result` (prelude) — `Result[T, E]`, a value or an expected error:
  `ok`, `err`, `is_ok`, `is_err`, `value` and `error` (fatal on the other),
  `value_or`. `try r` passes an error on; `errdefer` runs on one. See
  [errors](../docs/errors.md).
- `std:StrMap` — `StrMap[V]`, Str keys to any values: `set`, `get(key,
  missing)`, `has`, `remove`, `len`, `keys`. Open addressing, no tombstones.
- `std:Random` — `Random.new(seed)` (or `Random.from_host()`), xoshiro128**
  in utu: `bits`, `int(low, high)` (unbiased), `float`, `chance(p)`. The
  same seed gives the same numbers on every host.
- `std:Stream` (prelude) — `Stream[T]`, a JS async iterable read with
  `await for (s) |v| { … }`: `from_js`, `of`, `generate`, `take`, `skip`,
  `filter`, `map`, `chain`. A stream is read once.
- `std:Ord` — `Ord`, the protocol `a.cmp(b)` (negative, zero, positive),
  for the numbers and Str, and `Order[T[Ord]]`: `max`, `min`, `clamp`,
  `sort` (stable), `is_sorted`, `search`, `max_of`, `min_of`. See
  [generics](../docs/generics.md).
- `std:Console` — `using console from std:Console;` then `console.log(text)`,
  `warn`, `error`.
- `std:Time` — `using time from std:Time;` then `time.now()` (milliseconds,
  for measuring) and `time.epoch_ms()`.

Their doc comments are Typst: `node tools/utudoc/utudoc.mjs std -o std.pdf`.
