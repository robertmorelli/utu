# DSL to std report

## Change

Moved the generic `@stored` localStorage load/error bridge and store registration bridge from generated compiler output to `std:Wutu` functions. The functions are defined in `scripts/sync-wutu-runtime.mjs`, which generates `std/Wutu.utu`; the build also refreshed `src/selfhost/platform-sources.generated.js`. `@stored` still emits type-specific validation, JSON/native conversion and in-place field updates. User syntax and diagnostics are unchanged. No Wutu render or reconciliation path changed.

## Size and time

| Measure | Before | After | Difference |
| --- | ---: | ---: | ---: |
| `dist/utu.wasm` | 510,153 bytes | 509,807 bytes | −346 bytes |
| Blamed `selfhost/stored.utu` | 5,613 bytes | 5,267 bytes | −346 bytes |
| Blamed `selfhost/wutu.utu` | 16,996 bytes | 16,996 bytes | 0 |
| Blamed `selfhost/wutu_parse.utu` | 32,304 bytes | 32,304 bytes | 0 |
| `selfhost/stored.utu` source | 266 lines | 263 lines | −3 lines |
| One `closures.utu` `compileFile` run | 15.46 ms | 14.92 ms | −0.54 ms |

The build times are single local runs, so their difference is only a sanity check. Size blame came from `node scripts/blame-compiler.mjs --no-br --top=1` before and after.

## Left in the compiler

`@stored` type and schema checks, recursive conversion, and field copies require the declared Utu struct and preserve existing static diagnostics and object identity. Wutu parsing, CSS validation and stenciling, typed splice generation, and keyed/static reuse planning remain compile time work. Moving these to runtime would ship a parser or add render work, and could lose compile-time errors. The plan lists the trade-offs in more detail.

## Verification

- `bun run build`: stage 2 and stage 3 identical, 509,807 bytes.
- `timeout 1800 node scripts/test-compiler-regressions.mjs`: 1,459 builds passed.
- `timeout 1800 node scripts/test-wutu-stencils.mjs`: passed.
- `timeout 1800 node scripts/test-wutu-runtime.mjs`: Chromium and WebKit passed.
- `timeout 1800 node scripts/run-tests.mjs --only=wutu`: 63 passed.
- `timeout 1800 npm run test:wutu-smooth`: passed.
- `timeout 1800 npm run test:wutu-rounds`: passed; first-round measurement remained 0 nodes, 0 writes, 200 cards.
- `timeout 1800 node scripts/test-error-messages.mjs`: 852 programs unchanged; no re-recording.
- `timeout 1800 node scripts/selfhost-bootstrap.mjs --stage-1`: passed; stage 0 and stage −1 build the same compiler.
- `git diff --check`: passed.
