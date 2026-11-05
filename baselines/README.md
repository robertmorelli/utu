# Baselines

What the self-hosted compiler does, kept so every change to it is checked
against what it did before. Until the handoff commit ("baselines: recorded
by the self-hosted compiler"), these were stage -1's (the JavaScript
compiler, deleted after it; tagged `stage-1-final`), and the self-hosted
compiler was held to them: every program behaved, diagnosed, and resolved
as stage -1's did, or differed on purpose with the reason written down.

| file | what | checked by |
|---|---|---|
| `wasm-fingerprints.json` | sha-256 of the wasm of every program in `examples/`, `benchmarks/`, and `corpus/`, at `-O0`, `-Oz`, `-O3` (or its diagnostics) | `scripts/wasm-fingerprints.mjs --optimized --corpus` |
| `run-differential.json` | what each of those programs does when run: every zero-argument export and test, its result, trap, and output (at every optimization level, the same) | `scripts/selfhost-run-differential.mjs [--optimize=none\|size\|speed]` |
| `diagnostics.json.gz` | the diagnostics' kinds and spans of every program and the negative corpus, for its exports and its tests | `scripts/selfhost-diagnostics-differential.mjs` |
| `editor-query-fingerprints.json.gz` | hashes of the definition, references, hover, X-Ray facts and call hierarchy at every name, and the inlay hints, of every program | `scripts/editor-query-fingerprints.mjs` |
| `sizes.json` | the size of the `-Oz` build of every program of the run differential that builds: none may grow past a few bytes | `scripts/selfhost-size-differential.mjs` |
| `stage0-sizes.json` | the same, as stage -1 built them: a fixed ceiling, never re-recorded | `scripts/selfhost-size-differential.mjs` |
| `corpus/` | 465 programs gathered from test runs, which the checks above also cover, as does the syntax check against tree-sitter-utu | `scripts/selfhost-parser-differential.mjs`, `scripts/selfhost-lexer-differential.mjs` |

Each checker records its baseline with `--record`. Paths in messages are
relative to the repository (`<root>`).

Re-record a baseline only for a deliberate change, and say what changed in
the commit.
