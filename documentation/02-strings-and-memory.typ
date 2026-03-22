= Strings And Memory

== Strings

Strings are host-backed `externref` values exposed through the JS String
Builtins proposal. In user-facing terms, `str` behaves like a first-class
string type. In implementation terms, it is an alias for `externref` in the
string builtin surface.

The compiler auto-imports the string builtins from `"wasm:js-string"`. That
means string operations do not need explicit import declarations, and the spec
expects engines to optimize these builtins as native string operations rather
than full JS interop calls.

The always-available builtins are:

- `str.length(s) -> i32`
- `str.char_code_at(s, i) -> i32`
- `str.concat(a, b) -> str`
- `str.substring(s, start, end) -> str`
- `str.equals(a, b) -> bool`
- `str.from_char_code_array(arr, start, end) -> str`
- `str.into_char_code_array(s, arr, start) -> i32`
- `str.from_char_code(code) -> str`

== String Literals

Single-line string literals use double quotes:

```utu
let greeting: str = "hello world";
```

Multi-line strings use Zig-style `\\` prefixes on each line:

```utu
let multiline: str =
    \\this is a multi-line
    \\string literal in utu
    \\each line starts with \\;
```

The compiler concatenates those lines at compile time and inserts newline
characters between them.

== String Processing Strategy

The spec recommends two tiers of string work:

- use the builtins directly for ordinary application code, because the engine
  keeps strings in its optimized native representation
- convert into `array[i16]` for heavy text processing where indexed access is
  more important than host string specialization

```utu
let msg: str = "hello" -o str.concat(_, ", ") -o str.concat(_, "world");

let arr: array[i16] = array[i16].new(str.length(msg), 0);
str.into_char_code_array(msg, arr, 0);
// ... direct array[i16] access ...
let result: str = str.from_char_code_array(arr, 0, array.len(arr));
```

This keeps common string operations lightweight without preventing low-level
text algorithms when needed.

== GC-Only Memory Model

Utu uses WasmGC for all heap allocation. There is no linear memory allocator,
no bundled runtime, and no user-visible `malloc`/`free` model.

Values therefore fall into two groups:

- scalars that live on the Wasm value stack
- GC-managed heap objects such as structs, arrays, and `i31ref`

The consequences called out in the spec are:

- memory management is delegated to the engine's generational and compacting GC
- classic manual-lifetime bugs such as use-after-free and double-free disappear
- bundles stay small because the output contains compiled logic rather than a
  separate runtime system
- engines can still apply escape analysis and scalar replacement, so small
  objects may never materialize as heap allocations

== Struct Allocation

Constructing a struct lowers directly to `struct.new`:

```utu
let pos: Vec2 = Vec2 { x: 1.0, y: 2.0 };
```

```wasm
(struct.new $Vec2 (f32.const 1.0) (f32.const 2.0))
```

== Array Allocation And Access

Arrays are first-class GC objects with mutable elements. The spec exposes the
core allocation patterns directly:

```utu
let buf: array[i32] = array[i32].new(1024, 0);
let data: array[f32] = array[f32].new_fixed(1.0, 2.0, 3.0);

let val: f32 = data[0];
data[0] = 42;
let len: i32 = array.len(data);
```

The corresponding Wasm operations are:

- `array.new` for fixed-size allocation with an initializer
- `array.new_fixed` for literal element lists
- `array.get` for reads
- `array.set` for writes
- `array.len` for length queries

The design is intentionally explicit: Utu does not hide WasmGC arrays behind a
separate collection framework.
