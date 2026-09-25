# Equivalent programs: UTU vs. JavaScript per engine

DeltaBlue and the benchmark suite, each written once in UTU and once in
JavaScript, run in the same shell process per engine with identical inputs and
iterations. Every result is checked against the JavaScript result before
timing. Median of 15 alternating samples after 5 warmups, darwin/arm64.

```sh
node scripts/compare-programs-engines.mjs
```

Engines: V8 15.3.12 (d8), SpiderMonkey C154.0 (js shell), JavaScriptCore
WebKit r318158 (jsc), all from local builds; raw numbers in
[results.json](results.json). The ratio is UTU time ÷ JavaScript time, so
below 1 means UTU is faster.

| Program | V8 (d8) JS / UTU | SpiderMonkey JS / UTU | JavaScriptCore JS / UTU |
|---|---:|---:|---:|
| scalar recurrence | 1.55 / 1.55 ms (1.00×) | 1.61 / 1.61 ms (1.00×) | 1.84 / 1.58 ms (0.86×) |
| strings: tiny chunks | 30.50 / 30.89 ms (1.01×) | 50.33 / 53.22 ms (1.06×) | 34.22 / 34.08 ms (1.00×) |
| strings: medium chunks | 7.69 / 7.76 ms (1.01×) | 12.74 / 13.09 ms (1.03×) | 7.96 / 8.12 ms (1.02×) |
| strings: large chunks | 0.26 / 0.27 ms (1.05×) | 0.38 / 0.41 ms (1.08×) | 0.26 / 0.26 ms (1.00×) |
| source analyzer | 10.10 / 9.57 ms (0.95×) | 7.76 / 20.17 ms (2.60×) | 4.72 / 18.26 ms (3.87×) |
| prime sieve | 0.20 / 0.22 ms (1.09×) | 0.23 / 0.20 ms (0.88×) | 0.16 / 0.26 ms (1.63×) |
| DeltaBlue chain | 80.68 / 14.88 ms (0.18×) | 182.10 / 45.17 ms (0.25×) | 52.08 / 79.02 ms (1.52×) |
| DeltaBlue projection | 166.98 / 65.84 ms (0.39×) | 307.37 / 122.85 ms (0.40×) | 98.82 / 151.36 ms (1.53×) |


On V8 and SpiderMonkey, object-heavy code (DeltaBlue's constraint graph of
small WasmGC structs) is 2.5–5.6× faster in UTU than in JavaScript; scalar and
string code is at parity. JavaScriptCore's WasmGC is currently the weak engine:
UTU is 1.5–3.9× slower there on everything but scalar and string work. The
source analyzer's gap on SpiderMonkey and JavaScriptCore is also an engine
difference: it is at parity on V8.

These programs keep their data in UTU. For code that works on JavaScript
objects and the DOM, see [the Pantry comparison](../pantry/README.md).
