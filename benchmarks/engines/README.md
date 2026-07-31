# WasmGC engine comparison

This benchmark runs the same compiled utu DeltaBlue WasmGC module under several
engines. It is intentionally separate from the Bun-only cross-language suite:
there is no JavaScript or Rust timing in this report.

```sh
bun run bench:engines
```

`ENGINE_SAMPLES`, `ENGINE_WARMUPS`, and `ENGINE_ITERATIONS` control the run.
The runner compiles utu once, verifies zero failures in every engine, excludes
compilation and instantiation, writes the module to
`.tmp/wasmgc-engine-benchmark/`, and updates [RESULTS.md](RESULTS.md).
Missing optional runtimes are reported and skipped.

The current local matrix is:

- Bun 1.3.14
- Node 25.8.1
- Deno 2.9.4
- V8 `d8` 15.3.12 and SpiderMonkey 154 from [jsvu](https://github.com/GoogleChromeLabs/jsvu)
- JavaScriptCore WebKit r318158 from the WebKit build archive
- Wasmtime 47.0.2 through its Python binding

Shell engines use `deltablue-shell.js`; Node-style runtimes use
`deltablue-runtime.mjs`; Wasmtime uses `deltablue-wasmtime.py`. These harnesses
perform the same warmup, invocation, validation, and median calculation.

The optional runtimes used for this snapshot were installed locally under
`~/.jsvu` and `.tmp/`; those downloaded binaries are not repository artifacts.
Cross-language results remain in [../suite/RESULTS.md](../suite/RESULTS.md) and
are measured only on Bun, so engine and language effects are not mixed.
