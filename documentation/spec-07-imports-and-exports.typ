= 7. Imports and Exports

== 7.1 Host Imports

```utu
shimport "es" console_log(str) void;
shimport "es" fetch(str) Response # null;
shimport "es" fetch(str) Response # ApiError;
shimport "es" document: externref;
shimport "node:path" basename(str) str;
```

String builtins such as `str.length` and `str.concat` are auto-provided from
`"wasm:js-string"` and do not require any user-written declaration syntax.

`shimport` takes an explicit host module string. The `"es"` module resolves
against host-provided bindings first and then the ambient JS host object, while
`"node:*"` modules auto-resolve in Node and Bun runtimes.

== 7.2 Wasm Exports

```utu
export fun main() void {
    "hello world" -o console_log;
}
```
