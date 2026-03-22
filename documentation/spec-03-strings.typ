= 3. Strings

Strings are opaque `externref` values backed by the host's native string
representation via the *JS String Builtins* proposal. The compiler auto-imports
all string builtins under the `"wasm:js-string"` namespace, so no manual
import declarations are needed. The engine recognizes these imports and can
inline them; they are not full JS interop calls.

The `str` type is an alias for `externref` when used with string builtins.

*Auto-imported builtins (always available):*

- `str.length(s)`: `(str) i32`
- `str.char_code_at(s, i)`: `(str, i32) i32`
- `str.concat(a, b)`: `(str, str) str`
- `str.substring(s, start, end)`: `(str, i32, i32) str`
- `str.equals(a, b)`: `(str, str) bool`
- `str.from_char_code_array(arr, start, end)`: `(array[i16], i32, i32) str`
- `str.into_char_code_array(s, arr, start)`: `(str, array[i16], i32) i32`
- `str.from_char_code(code)`: `(i32) str`

== 3.1 String Literals

Single-line strings use double quotes. Multi-line strings use `\\` at the
start of each line in Zig style:

```utu
let greeting: str = "hello world";

let multiline: str =
    \\this is a multi-line
    \\string literal in utu
    \\each line starts with \\;
```

Multi-line strings are concatenated at compile time with newlines between each
`\\` line.

== 3.2 String Processing

For most application code, the auto-imported builtins are sufficient and
faster since they use the engine's optimized string representation. For heavy
text processing such as parsing or regex, convert to a GC `array[i16]` for
direct indexing:

```utu
let msg: str = "hello" -o str.concat(_, ", ") -o str.concat(_, "world");

// Heavy processing: convert to array
let arr: array[i16] = array[i16].new(str.length(msg), 0);
str.into_char_code_array(msg, arr, 0);
// ... direct array[i16] access ...
let result: str = str.from_char_code_array(arr, 0, array.len(arr));
```
