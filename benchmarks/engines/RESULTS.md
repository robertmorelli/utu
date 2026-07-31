# utu across JavaScript runtimes

Generated 2026-07-29T16:01:20.088Z on arm64 macOS. 5 warmups and 20 samples per workload. Compilation and instantiation are excluded; all results were validated. Every runtime used the same compiled utu modules.

| workload | Bun | Node | Deno | V8 d8 | SpiderMonkey | JavaScriptCore |
|---|---:|---:|---:|---:|---:|---:|
| scalar recurrence | 1.559 ms | 1.559 ms | 1.573 ms | 1.579 ms | 1.557 ms | 1.570 ms |
| middle insert: tiny chunks | 37.156 ms | 31.675 ms | 31.585 ms | 31.338 ms | 57.660 ms | 33.010 ms |
| middle insert: medium chunks | 9.287 ms | 7.941 ms | 7.829 ms | 7.870 ms | 15.095 ms | 8.210 ms |
| middle insert: large chunks | 0.242 ms | 0.259 ms | 0.240 ms | 0.274 ms | 0.384 ms | 0.260 ms |
| source analyzer | 24.077 ms | 7.580 ms | 9.385 ms | 9.704 ms | 20.358 ms | 21.580 ms |
| prime sieve | 0.236 ms | 0.220 ms | 0.230 ms | 0.222 ms | 0.190 ms | 0.260 ms |
| DeltaBlue chain | 93.737 ms | 25.681 ms | 26.068 ms | 15.130 ms | 41.864 ms | 78.650 ms |
| DeltaBlue projection | 161.705 ms | 86.369 ms | 87.752 ms | 65.829 ms | 122.302 ms | 151.310 ms |

## Relative to Bun

| workload | Bun | Node | Deno | V8 d8 | SpiderMonkey | JavaScriptCore |
|---|---:|---:|---:|---:|---:|---:|
| scalar recurrence | 1.00× | 1.00× | 1.01× | 1.01× | 1.00× | 1.01× |
| middle insert: tiny chunks | 1.00× | 0.85× | 0.85× | 0.84× | 1.55× | 0.89× |
| middle insert: medium chunks | 1.00× | 0.86× | 0.84× | 0.85× | 1.63× | 0.88× |
| middle insert: large chunks | 1.00× | 1.07× | 0.99× | 1.14× | 1.59× | 1.08× |
| source analyzer | 1.00× | 0.31× | 0.39× | 0.40× | 0.85× | 0.90× |
| prime sieve | 1.00× | 0.93× | 0.97× | 0.94× | 0.81× | 1.10× |
| DeltaBlue chain | 1.00× | 0.27× | 0.28× | 0.16× | 0.45× | 0.84× |
| DeltaBlue projection | 1.00× | 0.53× | 0.54× | 0.41× | 0.76× | 0.94× |

## Runtime versions

- **Bun:** Bun 1.3.14 / JSC
- **Node:** v25.8.1 / V8 14.1.146.11-node.21
- **Deno:** Deno 2.9.4 (stable, release, aarch64-apple-darwin) / v8 15.0.245.2-rusty
- **V8 d8:** V8 version 15.3.12
- **SpiderMonkey:** JavaScript-C154.0
- **JavaScriptCore:** WebKit r318158

Module SHA-256: `scalar:5ee2d1b2f86ae38a2a21a042302dc228375988fe95462bb8a46bf68db495f18b`, `strings:8fb0b548cbc0bb1b987d3e6647f36a45deb33e77faf1da68aec1b3ff07582547`, `analyzer:c26fe7a43e91b6b0a0484bb4f4d54baa16a99d2a0cd27d1af8b88cb6700092b4`, `sieve:42b7d223d6eada501223213aed55962490c7132ed0e2316872106dd0a32db78f`, `deltablue:24e23e58e39d118f43941864829b5291f893a5605578b1ffb280f217bfdd2e61`. Lower ratios are faster. This report measures utu only. See [../suite/RESULTS.md](../suite/RESULTS.md) for the separate Bun-only cross-language comparison.
