# Documentation

## Language

- [Specification](language/spec.md) — syntax, semantics, and module system
- [Types](language/types.md) — nominal type names vs. WasmGC representations
- [Arrays](language/arrays.md) — native arrays, typed arrays, and literal inference
- [Generics](language/generics.md) — parameterized modules and functions
- [Errors](language/errors.md) — `fatal`, `Result`, `try`, and `errdefer`
- [Iterators](language/iterators.md) — syntax-level fused array pipelines
- [Typed JSON](language/json.md) — `@json` native decode, encode, and match
- [Queries](language/queries.md) — segment trees and spatial indexes
- [TypeScript ABI](language/typescript-abi.md) — `.d.ts` bindings and JS/npm interop
- [Wutu](language/wutu.md) — typed web DSL combining markup and CSS

## Tooling

- [Language server](tooling/language-server.md) — `utu lsp` setup and capabilities
- [Semantic grep](tooling/grep.md) — `utu grep` compiler-backed code search
- [Profiling](tooling/profiling.md) — `utu --profile` sampling and flame graphs

## Compiler

- [Design principles](compiler/principles.md) — architectural constraints
- [Self-hosting](compiler/self-hosting.md) — stage 0 bootstrap and reproducibility
- [Closure lowering](compiler/closure-lowering.md) — `cl` vs. `fun` callable ABI
- [Minification](compiler/minification.md) — keeping `@es` glue small over the wire
- [Testing](compiler/testing.md) — test suites, differentials, and baselines
