# Explainability

Utu should treat diagnostics, profiling, size attribution, and lowering
inspection as one system.

The common substrate is source provenance plus rewrite lineage:

- source identity
  - `originId`
  - `originFile`
  - `start`
  - `end`
- rewrite lineage
  - `rewriteOf`
  - `rewritePass`
  - `rewriteKind`
- semantic resolution
  - `bindingId`
  - `bindingOriginId`
  - `declId`
  - `declOriginId`
  - `fnId`
  - `fnOriginId`
- inferred meaning
  - `type`
  - `typeSource`

## Unified artifact model

The compiler should be able to produce one explainability bundle:

```js
{
  diagnostics: [],
  lowerings: [],
  sizes: [],
  profiles: [],
}
```

### diagnostics

Correctness findings and compiler-reported errors.

```js
{
  kind,
  severity,
  code,
  message,
  primary,
  related: [],
  notes: [],
  fixes: [],
}
```

### lowerings

Records of important rewrites and emitted structures.

```js
{
  kind,
  node,
  emittedName,
  emittedKind,
  details,
}
```

Examples:

- pipe lowered to call
- module instantiated
- self type hoisted
- DSL helper emitted
- operator lowered to static call

### sizes

Per-function / per-type / per-artifact size facts.

```js
{
  kind,
  bytes,
  node,
  emittedName,
  section,
}
```

Examples:

- wasm function body bytes
- type section bytes for a struct
- DSL-emitted file bytes
- stdlib import contribution

### profiles

Bench-produced runtime cost facts keyed to source origin.

```js
{
  kind,
  node,
  samples,
  selfTime,
  totalTime,
  calls,
}
```

Examples:

- per-function bench timing
- inclusive/exclusive time
- stack-derived hot path

## Staged rollout

1. Shared artifact helpers and shape
2. Compiler returns structured diagnostics alongside IR
3. Codegen records emitted symbol ↔ source origin linkage
4. Bench records runtime profile facts keyed by emitted/source ids
5. UI/LSP/debugger consume one explainability bundle

## Design rule

Every interesting compiler action should be explainable in terms of:

- where it came from in source
- what pass transformed it
- what symbol/type/function it resolved to
- what emitted artifact it contributed to
- what runtime/size cost it caused

If those five questions can be answered, diagnostics, profiling, and size
inspection all stay coherent.
