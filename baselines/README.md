# Baselines

What the stage 0 compiler (the JavaScript one, tagged `stage0`) does, kept
so every later compiler, the self-hosted one included, is checked against it.

| file | what | checked by |
|---|---|---|
| `wasm-fingerprints.json` | sha-256 of the wasm of every program in `examples/`, `benchmarks/`, and `corpus/`, at `-O0`, `-Oz`, `-O3` (or its diagnostics) | `scripts/wasm-fingerprints.mjs --optimized --corpus` |
| `run-differential*.json` | what each of those programs does when run: every zero-argument export and test, its result, trap, and output; one file per optimization level | `scripts/run-differential.mjs --optimize=none\|size\|speed` |
| `behavior-fingerprints.json` | hashes of the diagnostics, formatted output, editor range entries, every editor query at every node, and the graphs, for every `.utu` file and the negative corpus | `scripts/behavior-fingerprints.mjs` |
| `definitions.json.gz` | stage 0's go-to-definition at every node of every program's own files (from the behavior fingerprints' full outputs) | `scripts/selfhost-resolve-differential.mjs` |
| `corpus/` | 465 programs gathered for the syntax differential, which the checks above also cover | `scripts/syntax-differential.mjs` |

Paths in messages are relative to the repository (`<root>`). The behavior
fingerprints' full outputs are not kept here (they are 90 MB); `--record`
writes them to `.tmp/behavior/recorded` for `scripts/behavior-diff.mjs`.

Re-record a baseline only for a deliberate change, and say what changed in
the commit.
