# Larger source-analyzer benchmark

This benchmark is intentionally application-shaped rather than a repeated
microkernel. The idiomatic utu implementation is over 6 KiB of source and computes
fourteen reachable metrics over a 256 KiB source-like ASCII document:

- forward and strided hashes
- line, word, number, string, comment, operator, and token-pattern counts
- longest word and parsed-number sum
- bracket balance/penalty
- a 128-bin WasmGC-array histogram
- character-transition score

The values are assembled through a nominal `Report` struct and folded into one
validated result. JavaScript performs UTF-16 code-unit operations directly.
Rust receives UTF-8 bytes through linear memory; encoding and copying are part
of every timed sample. ASCII input makes byte and UTF-16 code-unit values
identical.

## Production payload

| implementation | raw | gzip |
|---|---:|---:|
| utu | **1,614 B** | **835 B** |
| Rust | 4,065 B | 1,736 B |
| minified JavaScript | 2,553 B | 901 B |

The utu module contains five post-optimization functions and only two host
string imports (`length` and `charCodeAt`). Its section payloads are 69 bytes of
types, 53 bytes of imports, 6 bytes of function declarations, 7 bytes of
exports, and roughly 1.45 KiB of code. There are no dead benchmark functions.

This is the first suite case large enough for Wasm's fixed section/import costs
to amortize clearly. utu is 37% smaller raw than minified JavaScript and 7%
smaller over gzip; it is 60% smaller raw and 52% smaller compressed than Rust.

## Warm runtime

A representative Bun/JSC run was:

| implementation | median |
|---|---:|
| Rust | **4.0 ms** |
| JavaScript | 6.4 ms |
| utu | 27.6 ms |

The result exposes a sharp host-string boundary. The analyzer performs several
million single-code-unit reads. JavaScript can optimize `charCodeAt` inside its
own loops, while utu invokes a JS String Builtin from Wasm for each read. This
is unlike midpoint insertion, where each expensive immutable-string operation
dominates the crossing and utu tracks JavaScript.

Idiomatic range loops evaluate their end bound once, preserving the important
length caching without manual loop boilerplate. Remaining time is dominated by
fine-grained `text[i]`/`charCodeAt` operations, not redundant loop control.

## Compiler-pipeline finding

The larger control-flow graph revealed that one combined Binaryen run with
optimize level 3 and shrink level 2 is not equivalent to a dedicated `-Oz`
stage. Production emission now runs max optimization/max shrink first and then
a shrink-focused optimize-level-2/shrink-level-2 stage. This preserves the
speed optimization pass while reaching the smaller distribution shape.

The benchmark therefore supports both sides of utu's proposed niche: genuinely
compact larger artifacts, but no automatic performance advantage when code
performs millions of fine-grained host operations.
