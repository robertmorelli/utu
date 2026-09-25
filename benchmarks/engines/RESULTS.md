# utu across JavaScript runtimes

Generated 2026-09-25T00:38:41.961Z on arm64 macOS. 5 warmups and 20 samples per workload. Compilation and instantiation are excluded; all results were validated. Every runtime used the same compiled utu modules.

| workload | Bun | Node | Deno | V8 d8 | SpiderMonkey | JavaScriptCore |
|---|---:|---:|---:|---:|---:|---:|
| scalar recurrence | 1.553 ms | 1.557 ms | 1.665 ms | 1.555 ms | 1.557 ms | 1.560 ms |
| middle insert: tiny chunks | 36.930 ms | 31.543 ms | 31.408 ms | 30.951 ms | 58.982 ms | 33.380 ms |
| middle insert: medium chunks | 9.200 ms | 7.922 ms | 7.810 ms | 7.785 ms | 14.212 ms | 8.260 ms |
| middle insert: large chunks | 0.235 ms | 0.259 ms | 0.238 ms | 0.260 ms | 0.414 ms | 0.240 ms |
| source analyzer | 23.822 ms | 7.531 ms | 9.292 ms | 9.589 ms | 20.312 ms | 21.750 ms |
| prime sieve | 0.237 ms | 0.224 ms | 0.224 ms | 0.227 ms | 0.192 ms | 0.260 ms |
| DeltaBlue chain | 93.232 ms | 25.662 ms | 25.601 ms | 14.826 ms | 41.957 ms | 79.320 ms |
| DeltaBlue projection | 160.151 ms | 85.836 ms | 85.940 ms | 65.983 ms | 122.212 ms | 149.990 ms |

## Relative to Bun

| workload | Bun | Node | Deno | V8 d8 | SpiderMonkey | JavaScriptCore |
|---|---:|---:|---:|---:|---:|---:|
| scalar recurrence | 1.00× | 1.00× | 1.07× | 1.00× | 1.00× | 1.00× |
| middle insert: tiny chunks | 1.00× | 0.85× | 0.85× | 0.84× | 1.60× | 0.90× |
| middle insert: medium chunks | 1.00× | 0.86× | 0.85× | 0.85× | 1.54× | 0.90× |
| middle insert: large chunks | 1.00× | 1.10× | 1.02× | 1.11× | 1.76× | 1.02× |
| source analyzer | 1.00× | 0.32× | 0.39× | 0.40× | 0.85× | 0.91× |
| prime sieve | 1.00× | 0.95× | 0.95× | 0.96× | 0.81× | 1.10× |
| DeltaBlue chain | 1.00× | 0.28× | 0.27× | 0.16× | 0.45× | 0.85× |
| DeltaBlue projection | 1.00× | 0.54× | 0.54× | 0.41× | 0.76× | 0.94× |

## Runtime versions

- **Bun:** Bun 1.3.14 / JSC
- **Node:** v25.8.1 / V8 14.1.146.11-node.21
- **Deno:** Deno 2.9.4 (stable, release, aarch64-apple-darwin) / v8 15.0.245.2-rusty
- **V8 d8:** V8 version 15.3.12
- **SpiderMonkey:** JavaScript-C154.0
- **JavaScriptCore:** WebKit r318158

Module SHA-256: `scalar:5ee2d1b2f86ae38a2a21a042302dc228375988fe95462bb8a46bf68db495f18b`, `strings:8fb0b548cbc0bb1b987d3e6647f36a45deb33e77faf1da68aec1b3ff07582547`, `analyzer:c26fe7a43e91b6b0a0484bb4f4d54baa16a99d2a0cd27d1af8b88cb6700092b4`, `sieve:42b7d223d6eada501223213aed55962490c7132ed0e2316872106dd0a32db78f`, `deltablue:63ad635a793b09df07968e3557786b06c18cae6f36451c07e7591dfdedd4f8da`. Lower ratios are faster. This report measures utu only. See [../suite/RESULTS.md](../suite/RESULTS.md) for the separate Bun-only cross-language comparison.
