# JS array ABI benchmark

Measured in V8 version 15.3.12 on darwin/arm64.

15 rotating-order samples after 10 warmup rounds. Same JS arrays and sums; setup/compilation excluded. Median and p10/p90 nanoseconds per element. Batch makes one crossing per entire sum.

| Length | JS loop ns/element | UTU numeric indexing | UTU generic indexing | UTU callback | Whole-operation call |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 32 | 0.76 | 14.14× | 62.60× | 49.61× | 1.82× |
| 4096 | 0.93 | 8.83× | 50.64× | 37.43× | 1.00× |
| 65536 | 0.94 | 8.81× | 50.13× | 37.19× | 1.00× |

Ratios are elapsed time relative to the JS loop; larger is slower. Inputs are
ordinary dense integer-valued JS number arrays. All variants check identical
results. This is a sum-loop microbenchmark, not a general application score.
Numeric indexing makes one JS access per element; generic indexing also makes a
checked conversion. The batch case calls a JS sum implementation once per array.
It does not eliminate or automatically fuse UTU-to-JS calls.

Run `bun run bench:js-arrays`; set `D8_BIN` to select the d8 executable. Build
work is performed by Node, while timing runs exclusively in d8.

The original measurements are retained under `results/`: [d8](results/js-arrays-d8.json),
[Node](results/js-arrays-node.json), [Bun](results/js-arrays-bun.json), and
[Chromium](results/js-arrays-chromium.json). These are the initial measurements
reported during the ABI experiment, before removal of redundant wrappers;
new runs write to `dist/benchmarks` without overwriting this archive.

## Deep declaration bindings

[Full d8 results](results/js-arrays-d8-deep.json) retain every sample summary.
The typed paths now use `values.length`, `values[i]`, and `values.reduce(...)`;
only the generic comparison retains the old opaque-value conversion.

| Length | JS loop ns/element | UTU typed indexing | UTU generic indexing | UTU callback | Batched JS call |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 32 | 0.62 | 14.03× | 61.82× | 55.41× | 1.80× |
| 4096 | 0.73 | 8.92× | 50.67× | 42.57× | 1.01× |
| 65536 | 0.73 | 9.05× | 51.06× | 42.25× | 1.00× |

This is a separate run, not a controlled claim of improvement over the original
archive. Boundary crossings remain the dominant cost. All earlier engine results
remain available above.
