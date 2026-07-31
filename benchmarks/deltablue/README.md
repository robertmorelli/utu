# DeltaBlue benchmark

This is the pre-rewrite DeltaBlue constraint-solver benchmark, migrated to the
current utu surface syntax. It compares WasmGC utu with a safe
`Rc<RefCell<_>>` Rust implementation, an unsafe arena/raw-pointer Rust
implementation, and JavaScript. All four execute the same 1,048-node chain and
projection workloads and return a failure count, which the runner requires to
match.

It is included in the consolidated repository benchmark run:

```sh
bun run bench:suite
```

Use `bun run bench:deltablue` to run only this benchmark.

`BENCH_ITERATIONS`, `BENCH_SAMPLES`, and `BENCH_WARMUPS` control the run.
Kernel timings exclude compilation and instantiation.

## Last pre-rewrite snapshot

The old harness measured whole commands with 20 solver iterations per command.
Its last report (2026-03-28) recorded:

| workload | utu Wasm | safe Rust Wasm | unsafe Rust Wasm |
|---|---:|---:|---:|
| chain | 132.532 ms | 228.671 ms | 80.728 ms |
| projection | 192.926 ms | 320.965 ms | 121.759 ms |

Those values include process startup and therefore are only useful as a broad
regression reference, not a direct comparison with this in-process runner.

## Current snapshot

Bun 1.3.14 on arm64 macOS; 3 warmups and 10 samples, each containing 20
solver iterations. All implementations returned zero failures.

| workload | utu Wasm | safe Rust Wasm | unsafe Rust Wasm | JavaScript |
|---|---:|---:|---:|---:|
| chain | 94.366 ms | 183.514 ms | **49.856 ms** | 77.216 ms |
| projection | 173.008 ms | 302.062 ms | **93.488 ms** | 132.481 ms |

| implementation | payload | gzip |
|---|---:|---:|
| utu Wasm | 5,107 B | 2,021 B |
| safe Rust Wasm | 47,601 B | 18,159 B |
| unsafe Rust Wasm | 34,527 B | 14,561 B |
| minified JavaScript | 6,868 B | 2,084 B |

Unlike the historical hyperfine report, these timings exclude process startup,
compilation, and instantiation. JavaScript payload size is the standalone ES
module after esbuild minification.

### Bun 1.3.14 follow-up

A controlled comparison ran Bun 1.3.11 and 1.3.14 against byte-identical utu
Wasm (`cffd55b0…`) and the same Rust/JavaScript sources. With 5 warmups and 20
samples it measured:

| workload and engine | utu Wasm | safe Rust Wasm | unsafe Rust Wasm | JavaScript |
|---|---:|---:|---:|---:|
| chain, Bun 1.3.11 | 86.161 ms | 184.718 ms | **50.353 ms** | 63.885 ms |
| chain, Bun 1.3.14 | 98.329 ms | 184.737 ms | **50.312 ms** | 65.697 ms |
| projection, Bun 1.3.11 | 142.901 ms | 292.318 ms | **89.998 ms** | 103.318 ms |
| projection, Bun 1.3.14 | 162.942 ms | 289.571 ms | **89.819 ms** | 114.434 ms |

A reverse-order repeat confirmed the direction of the change. Ordinary Wasm
Rust was effectively unchanged, while Bun 1.3.14 regressed both WasmGC utu and
JavaScript on this workload. The current consolidated table now records a
fresh, internally consistent Bun 1.3.14 run.

All implementations use the same fixed-capacity list model, explicit O(n)
front removal and constraint removal, planner strength updates, graph sizes,
and validation loops. In particular, JavaScript intentionally does not use
native `Array.shift` or `Array.splice`: those operations made the initial port
algorithmically non-analogous by replacing the explicit element-shifting loops
in utu and Rust. Correcting that discrepancy removed the implausible 8–12×
JavaScript lead.
