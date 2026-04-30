# utu Types — name vs. representation

The compiler represents every concrete type with two separate concepts:

- **type-name** — the utu static type identity. Used by the typechecker.
- **type-repr** — the backend / runtime representation. Used by codegen.

The invariant:

> Typechecking is nominal over type-name.
> Codegen is representational over type-repr.

Two utu types may share a `type-repr` and still be distinct utu types
because their `type-name` differs. This is already how scalars work, and
it generalizes to every type.

## Examples

| utu type-name | type-repr            |
|---------------|----------------------|
| `i32`         | wasm `i32`           |
| `u32`         | wasm `i32`           |
| `m32`         | wasm `i32`           |
| `i64`         | wasm `i64`           |
| `f32`         | wasm `f32`           |
| `f64`         | wasm `f64`           |
| `bool`        | wasm `i32`           |
| `str`         | wasm `stringref`     |
| `externref`   | wasm `externref`     |
| `i31`         | wasm `i31`           |
| `Point`       | wasm-gc struct Point |
| `Shape`       | wasm-gc enum Shape   |

`i32`, `u32`, and `m32` are distinct utu types with distinct stdlib /
operator surfaces, but they share a wasm representation. The same
pattern applies to any future type that names an `externref`-backed
host value: the names are distinct, the representation is shared.

## Consequences

**The typechecker compares by `type-name`.** Code like

```utu
let a: u32 = some_i32_value;
```

is rejected even though both sides have the same `type-repr`. Same
holds for any pair of distinct nominal types that happen to share a
representation.

**Codegen ignores `type-name` for storage and ABI decisions.** It
resolves the utu type through the registry to its `type-repr` and uses
that. A wasm parameter, return type, struct field, or array element is
chosen by representation, not by name.

**The split is uniform.** Every type — scalar, GC-heap, host-ref, or
parameterized module instance — records both `type-name` and `type-repr`
in the registry. There is no special case for scalars, no separate path
for host references, no dual mechanism. One registry, two axes.

## What this enables (without committing to it yet)

A future `.d.ts` ingester can emit many distinct utu type-names that
share an `externref` representation:

- `Document`, `Element`, `Node`, `Response`, … — distinct nominal
  types, all `externref` underneath.
- The typechecker prevents accidental cross-assignment between them.
- Codegen treats them uniformly as `externref` parameters / fields.

The ingester is downstream and not yet committed. The split is
upstream and worth landing on its own merits — it cleans up the
existing scalar plumbing and prepares the ground for any future
nominal-over-shared-repr work.

## Where this is enforced

- **Registry** (`link-type-decls.js` and adjacent passes) — records both
  axes for every type declaration.
- **Typechecker** (resolve-bindings, infer-types, resolve-methods,
  validate-analysis, type-rules) — compares by `type-name`.
- **Codegen** (codegen/types.js, codegen/heap-types.js, intrinsics, expr,
  fn) — resolves through the registry to `type-repr`. The only legitimate
  place that hardcodes name-to-repr knowledge is the five-family wasm
  scalar namespace table in codegen/types.js, which is unavoidable.

If a change violates the invariant — typechecker peeking at `type-repr`
or codegen branching on `type-name` — it does not land.
