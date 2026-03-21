= 7. Imports and Exports

== 7.1 JS Imports

```utu
// Simple import (void return — no return type)
import extern "es" console_log(str)

// Import with error handling (# null: catch-all)
import extern "es" fetch(str) Response # null

// Import with typed error (# T: cast or rethrow)
import extern "es" fetch(str) Response # ApiError

// Import a value
import extern "es" document: externref
```

Note: String builtins such as `str.length` and `str.concat` are auto-imported
from `"wasm:js-string"` and do not require import declarations.

== 7.2 Wasm Exports

```utu
export fn main() {
    "hello world" -o console_log
}
```
