# Compiler size report

## Kept

- Omit the redundant explicit 65,536-page maximum from defined memory32 limits. Across 12 `benchmarks/bg` utu ports and 16 buildable top-level examples: `-O small` wasm 38,928 → 38,868 bytes, gzip -9 20,837 → 20,824; `-O smallUnsafe` wasm 36,892 → 36,832, gzip 20,313 → 20,296. Ten programs changed in each mode. `dist/utu.wasm` 521,651 → 521,583 bytes. `examples/closures.utu` build time 0.08 → 0.07 s wall (timing noise). This changes only a memory declaration; no runtime speed gain is claimed.

## Rejected

- Guard single-use loop-containing function moves into loops: stage 2 equaled stage 3, but the current spectralnorm port already avoids the reported slow path (857-byte `small` wasm, about 88 ms); the guard added 594 compiler bytes with no demonstrated benefit.
- Erase `local.set x (local.get x)` after inlining: stage 2 equaled stage 3, but every one of the 28 buildable programs had identical wasm in both size modes; compiler grew 77 bytes.

## Verification

`bun run build` produced identical stage 2 and stage 3. `timeout 1500` compiler regressions passed (1,544 builds); all three selfhost differential modes passed (1,022 builds each); `stage0 --verify` passed. Optimized wasm fingerprints were recorded after those checks.
