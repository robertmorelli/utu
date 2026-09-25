# Pantry: UTU vs. JavaScript

The [Pantry dashboard](../../examples/browser-pantry/main.utu) and a plain
JavaScript twin written statement for statement
([`js/main.js`](../../examples/browser-pantry/js/main.js)), with the same HTML,
CSS and data. The comparison script checks that both render identical DOM.

```sh
node scripts/compare-pantry.mjs      # bytes + Chromium timings   (ROUNDS=12)
node scripts/compare-pantry-d8.mjs   # data work in d8, no DOM    (D8_BIN=…)
```

Results from darwin/arm64: [browser](results/browser.json), [d8](results/d8.json).

## Bytes shipped (app code only)

| Build | raw | gzip | brotli |
|---|---:|---:|---:|
| JavaScript (esbuild, minified) | 3,871 | **1,756** | 1,506 |
| UTU -Oz (Wasm + generated JS) | 12,362 | 4,867 | 4,121 |
| UTU -O3 | 14,693 | 5,198 | 4,340 |

UTU -Oz breaks down as 3,063 B gzip of Wasm, 932 B of generated host-call glue
and 927 B of the generic loader and runtime. In the Wasm, the import section
(3,299 B raw) is larger than the code (2,318 B): 68 generated import names and
one import per string constant, named by the string itself.

## Chromium (median of 12 rotated rounds)

| | load to first render | 300 re-renders | add 300 items |
|---|---:|---:|---:|
| JavaScript | 41.2 ms | 85.8 ms | 1,255 ms |
| UTU -O3 | 42.5 ms (+3%) | 96.7 ms (+13%) | 1,302 ms (+4%) |
| UTU -Oz | 43.9 ms (+7%) | 101.3 ms (+18%) | 1,354 ms (+8%) |

The work is dominated by the DOM; UTU's extra cost is the Wasm↔JS crossings
for every property, call and callback.

## d8 (V8 15.3, median per call, 25 rotated samples after warmup)

| Kernel | JavaScript | UTU -O3 | UTU -Oz |
|---|---:|---:|---:|
| filter/sort/total 8 JS objects | 0.18 µs | 9.7× | 12.2× |
| filter/sort/total 1,000 JS objects | 47.8 µs | 5.1× | 6.5× |
| same work on 2,000 native structs | 618 µs | **0.75×** | **0.75×** |

On JavaScript objects every property read, comparison callback and filter
callback crosses the boundary, so UTU is 5–12× slower. On its own WasmGC
structs and arrays the same shape of work is 25% faster than the JIT.
`-Oz`'s shared `o[k]` accessors cost about 25% more than `-O3`'s specialized
ones on crossing-heavy code.
