# Compiler performance report

## Kept

- Keep `memory.grow` helpers out of `-O fast` and `fastUnsafe` inlining, so push/resize call sites inline their common path while growth stays in one function. Across 12 BG ports and 14 buildable examples: fast Wasm 75,226 → 74,259 bytes, gzip -9 23,721 → 23,394; fastUnsafe 70,100 → 69,305, gzip 23,046 → 22,739. Combined gain: 1,762 raw / 634 gzip bytes. Compiler `dist/utu.wasm` 521,651 → 521,671 bytes (+20); `closures.utu` build 0.06 → 0.07 s real (one run each). Runtime is mixed: regexredux fast 114.9 → 111.3/113.5 ms and fastUnsafe 108.1 → 105.3/104.6 ms in two post-change runs; revcomp fast 110.8 → 112.5/113.2 ms, fasta fast 106.8 → 112.2/109.4 ms. Load varied from 6 to 10; no broad speed gain is claimed.

## Tried and rejected

- Stop copying every multi-use loop-bearing callee: fast suite shrank 75,226 → 53,316 bytes (gzip 23,721 → 20,839), but binarytrees fast slowed 238.6 → 274.2 ms and fastUnsafe 236.6 → 262.4 ms. Spectralnorm also showed no gain. Reverted.
- Split reduction accumulators: current optimizer does not unroll loops, so there is no existing unrolled reduction to split. No code change.

## Verification

`bun run build` produced identical stage 2 and 3 (521,671 bytes). All required checks passed: 1,544 compiler regression builds; 1,022 differential builds in each of default, size, and speed modes; stage0 verify. Re-recorded optimized Wasm fingerprints, then checked 258/258 builds identical.
