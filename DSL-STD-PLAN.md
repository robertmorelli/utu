# DSL to std plan

## Baseline

`bun run build` produces identical stage 2 and stage 3 modules of 510,153 bytes. `node scripts/blame-compiler.mjs --no-br` attributes 5,613 bytes to `selfhost/stored.utu`, 16,996 to `selfhost/wutu.utu`, and 32,304 to `selfhost/wutu_parse.utu` (54,913 bytes total). Blame is attribution, not the amount removable: shared helpers, data and inlining can change when code moves. A `compileFile` build of `examples/closures.utu` took 15.46 ms in one local run.

## Boundaries

`stored.utu` parses the DSL body and modifiers, checks local struct schemas for supported acyclic fields, validates the default splice, emits recursive schema validation and native/JS conversion, and emits storage load, version check, error handling, registration and in-place field copies. Parsing, schema walking, typed conversion and field copies depend on compile-time types. Storage load, registration, version/error handling and JSON parsing are generic and can live in `std:Wutu`.

`wutu_parse.utu` parses templates and CSS into flat node and item tables, checks syntax and known CSS properties, and records source ranges. `wutu.utu` turns this into typed Utu and a static DOM program. It scopes/stencils CSS, plans stable nodes and keyed reuse, handles aliases and reactive islands, and emits runtime calls. These steps need the template and compiler's source/type context at compile time to preserve syntax, diagnostics and render speed. The reconciler and DOM/storage runtime already live in `std/Wutu.utu`, generated from `src/runtime/wutu.js`.

## Move now

Move the generic `@stored` storage load, version/error check, and registration bridge into `std:Wutu` functions. Keep generated validators, conversion and in-place updates so the same schema checks and references survive. This changes setup only; Wutu render paths and generated template code stay intact. Generated code still calls `wutu.storage_init()`.

## Defer

Moving `@stored` schema handling to generic `@json` would need reflection or a new typed decoder, likely changing accepted data, errors or runtime cost. Moving Wutu parsing or CSS stenciling into the library would defer syntax/property errors until runtime and ship the parser with apps. Moving keyed reuse planning or template static analysis to runtime would add work during renders and alter benchmark behavior. Replacing `@wutu`/`@stored` syntax with library calls would be user-visible. These are outside the behavior-preserving move.

## Verification

Compare stage 2/3, wasm size and `closures.utu` build time before/after. Run all requested regressions and Wutu benchmarks, and inspect any changes before committing.
