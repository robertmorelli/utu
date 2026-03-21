= 7. Imports and Exports

== 7.1 JS Imports

```utu
// Simple import (void return — no return type)
import extern "es" console_log(str)

// Nullable return import
import extern "es" fetch(str) Response # null

// Direct two-result import signature
import extern "es" fetch(str) Response # ApiError

// Import a value
import extern "es" document: externref
```

Note: String builtins such as `str.length` and `str.concat` are auto-imported
from `"wasm:js-string"` and do not require import declarations.

The Wasm import surface stays direct, but the generated JS wrapper currently
catches throws from nullable-compatible imports and substitutes null
placeholders. Structured typed error translation for `T # E` imports is still
planned.

== 7.2 Wasm Exports

```utu
export fn main() {
    "hello world" -o console_log
}
```
