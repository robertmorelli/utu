# Typed JSON

`@json` reads and writes JSON as native utu values. The compiler generates a
parser and printer for each type. They run in wasm and read the string's code
units directly: there is no `JSON.parse`, no intermediate JavaScript objects,
and no boundary call per field. Validation happens in the same pass, so bad
input is reported with its position instead of surfacing later as a wrong
value.

```utu
struct Item:
    | name: Str
    | count: I32
    | tags: Array[Str]
    | note: ?Str

struct Save:
    | version: I32
    | items: Array[Item]

fn load(text: Str) Save {
    promote @json/\ decode Save text \/ {
        |save| => save,
        ~> Save { version: 1, items: [] },
    };
}

fn store(save: Save) Str {
    @json/\ encode Save save \/;
}
```

| Form | Result |
| --- | --- |
| `decode T text` | `?T`: the value, or `null` if the text does not match `T` |
| `error T text` | `Str`: `""` if it matches, else the problem, e.g. `missing field "count" at line 3, column 9` |
| `encode T value` | `Str`: compact JSON |
| `match text { … }` | the value of the matching arm (below) |

`T` is a struct, an enum, or an `Array`.

## Types

| utu | JSON |
| --- | --- |
| `I32`, `U32`, `I64` | integers, read exactly and range-checked (`I64` keeps precision past 2^53) |
| `F32`, `F64` | numbers |
| `Bool`, `Str` | `true`/`false`, strings (all escapes, including surrogate pairs) |
| `?T` (reference types) | `null` or a missing field |
| `Array[T]` | arrays |
| local structs | objects; unknown fields are skipped, field order is free |
| enums with no fields, `enum(U8)` ones included | strings: `"Red"` |
| other enums | objects whose first field is `"kind"`: `{"kind": "Circle", "r": 2}` |

Types may be recursive through `?T` or `Array[T]`. Non-optional fields must be
present. Encoding writes fields in declaration order, and `?T` fields that are
`null` are written as `null`. F64 values print as JavaScript does (`1e+300`,
`0.1`); non-finite numbers print as `null`.

## Structural patterns

When only part of a document matters, such as a few fields of a large
third-party response, `match` describes just that part:

```utu
@json/\ match response {
    { status: "ok", user: { name: |name| Str, age: |age| I32 = 18 }, plan: { tier: |tier| ?Str } } => {
        greet(name, age, tier orelse "free");
    },
    { status: "error", message: |message| Str } => show(message),
    ~> |error| show("unexpected response: " + error),
}\/;
```

- `|name| T` captures a typed value. Any `@json` type works, so
  `items: |items| Array[Item]` decodes that whole subtree.
- `?T` captures may be missing or `null`. `= default` fills a missing field.
  Everything else in a pattern is required.
- Literals (`"ok"`, `3`, `true`, `null`) must match exactly, which tells
  response shapes apart. Quote keys that are not identifiers:
  `"content-type": |kind| Str`.
- Fields a pattern does not mention are skipped without being decoded.
- Arms are tried in order and the first match runs. The `~>` arm is required.
  It can bind the error of the arm that matched the most before failing,
  including the path where it failed: `user.age: expected an integer at line 1,
  column 42`.

## Performance

On a 4 MB save file of 40,000 entities (Apple Silicon; V8 = Node 25.8, JSC =
Bun 1.4.2):

| | V8 | JSC |
| --- | --- | --- |
| `decode` to native structs | 23 ms (171 MB/s) | 45 ms |
| `JSON.parse` to JS objects, for reference | 16 ms | 8.5 ms |
| `encode` | 18 ms | 24 ms |
| `JSON.stringify`, for reference | 5.6 ms | 4.4 ms |

`JSON.parse` and `JSON.stringify` are native code working on JavaScript
objects. A utu program that used them would still have to copy every field
into its own structs across the boundary, one call per field. The generated
code adds about 4 KB to a module for the shared reader and writer, plus a few
hundred bytes per type.
