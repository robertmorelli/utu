# Fast compiler, then self-hosted compiler

Two plans, in order. Plan A makes the JavaScript compiler fast by replacing
its IR. Plan B ports that compiler to utu. Plan A comes first because it
fixes today's pain (a 1,800-line program takes 9 s to build, a 96k-line one
150 s and 10 GB), it designs the IR that Plan B ports, and the JavaScript
compiler is what builds the first utu compiler.

## Why the IR goes

The IR is a linkedom XML DOM. Passes find nodes with 366 `querySelector`
calls, keep facts in `dataset` attributes (strings, converted through a
camel-case regex on every access), and fingerprint with `outerHTML`. Every
profile points at it:

| program | time | where |
|---|---:|---|
| `examples/foundry` (3.9k lines), before | 4 min | 172 of 188 s in `getElementById`, a full-document walk |
| 24k generated lines | 26 s, 5 GB | `querySelectorAll`, `getAttributeNode`, GC; nothing above 15% |
| `examples/jpl` (1.8k lines) | 9 s | scope walks by selector, then DOM traffic everywhere |

The DOM gives us nothing a compiler needs: selectors are linear scans,
attributes are strings, nodes are heavyweight objects. What we use it for:

- **Navigation**: children by tag (`:scope > ir-arg-list`, `:scope > ir-block`)
  and all nodes of a kind (`ir-ident`, `*`).
- **Side tables**: `dataset.typeName`, `originId`, spans (`start`, `row`,
  `col`, `originFile`), rewrite provenance (`synthetic`, `rewritePass`,
  `rewriteOf`), `displayName`.
- **Mutation**: replace, insert, clone, and source expansion
  (`expressionFromSource` parses generated utu and splices it in).
- **`@ir` bodies**: the standard library spells intrinsics as XML
  (`@ir/\ <ir-i32-add>…</ir-i32-add> \/`).
- **Debugging**: IR dumps and graph views.

All of that fits a flat, typed node store.

## Plan A: a typed node store, in JavaScript

### The store

The target data model, for the utu port and the end state in JS (see Status
for why JS gets there through accessors rather than columns first):

- Nodes are integer ids. Columns in typed arrays: `kind` (an enum),
  `parent`, `firstChild`, `nextSibling`, `start`, `end`, `file`.
- Strings are interned once (`names`): identifiers, attribute values, file
  paths. Columns hold string ids.
- Kind-specific fields live in a few shared columns (`a`, `b`, `c`) whose
  meaning depends on the kind, as in Zig's AST, plus a side array for
  variable-length data.
- Types are interned ids, not strings. `.{I32, F64}`, `fun(I32) Bool`, and
  `Array[I32]` are rows in a type table, so comparing types is comparing ints.
- Analysis facts (type, binding, call target, origin, rewrite provenance)
  are columns, or maps keyed by node id, not attributes.
- Per-kind lists (`byKind[kind] → ids`) replace `querySelectorAll('ir-x')`
  and are kept current on insert and remove.

### Status

Measured warm, in process, at `-O0` (the machine was also running other
work, so these are upper bounds):

| program | before | now |
|---|---:|---:|
| `examples/jpl` (1.8k lines) | 9 s | 0.55 s |
| `examples/foundry` app | 10 s | 1.9 s |
| 24k generated lines | 26 s, 5 GB | 3.4 s, 2 GB |
| `bun run test` (everything) | 10+ min | 41 s |
| `bun run test:fast` | — | 23 s |

Done, each change checked against the invariants below:

1. **linkedom replaced** by `ir-document.js`: the DOM subset the passes use,
   with attributes in shared shapes (the most-read ones as fields),
   selectors compiled to predicates, and a lazy per-document element index
   (document order, subtree ranges, per-tag lists) for repeated scans.
2. **utu's own parser** (`syntax/parser.js`) builds tree-sitter's exact
   concrete syntax tree for every valid program; tree-sitter now parses
   only sources with syntax errors. This is Plan B's first piece, in JS.
3. **The type graph** keeps per-node facts in arrays by each element's
   dense index, and its rules and expectation edges are records read by a
   switch rather than closures.
4. **Tooling**: `-O0` builds; parallel tests; per-pass timings
   (`UTU_TIMINGS=1`).

What we learned that changes the plan:

- A columnar attribute store is the wrong first move in JS: IR nodes carry
  ~17 attributes and are cloned constantly (`expressionFromSource`, module
  instantiation), so per-attribute columns make every clone scan every
  column. Columns belong in the utu port, where facts are typed fields.
- Binaryen's optimizer barely matters for speed (jpl: within noise to +10%),
  so `-O0` is the development default; `-O3` stays for shipping.
- The two semantic rebuilds after lowering (operators and closures; alt and
  promote) are now the largest cost, ~40% of a large build. Each rebuilds
  the type graph from scratch because lowerings edit the tree.

### The invariants

Every change keeps all of these identical:

- `scripts/wasm-fingerprints.mjs [--optimized]`: the wasm of every program
  under `examples/` and `benchmarks/` at `-O0`, `-Oz`, and `-O3`.
- `scripts/behavior-fingerprints.mjs`: for every `.utu` file and the
  negative corpus, the diagnostics (raw and formatted), the editor's range
  entries, every editor query (explain, definition, references, call
  hierarchy, inlay hints) at every node, and the binding, expectation, and
  provenance graphs, with node ids replaced by stable names.
- `scripts/syntax-differential.mjs [--fuzz=N] [--keywords]`: utu's parser
  against tree-sitter on every source and on mutants.
- The suite, in both debug modes.

### Next

1. **Passes onto node accessors.** Replace selector strings and `dataset`
   reads in passes with accessors by node kind (`callArgs(call)`,
   `fnBody(fn)`, …) and attribute fields. This is what the port needs (each
   accessor becomes a column read in utu) and it removes most of the
   remaining DOM-layer cost. Hottest first: the type graph, bindings, call
   and control-flow graphs, the backend plan, then the lowerings.
2. **Lowerings produce typed nodes.** Once facts are read through
   accessors, a lowering can record the facts of what it creates (types,
   bindings, call targets) instead of the compiler re-solving the whole
   program; debug builds cross-check against a full rebuild.
3. **Facts out of attributes.** Analyses read graph facts, not projected
   `data-*` attributes; the projection remains only for the editor views.

## Plan B: the compiler in utu

The Plan A store maps one to one onto utu: hot columns become mems, and the
rest become `Vec`s.

### Layout

Measured on the JPL compiler: mems for the large append-only tables (source
bytes, tokens, node columns, output); GC `Vec`s for everything indexed but
small (symbols, types, scopes, patterns). That layout matched an all-mem one
on V8 and was within 9% on JSC, using 15 memories instead of 45. JSC allows
at most 100 memories per module; this keeps far below it. Packing node
columns into one mem cost 25% (an extra push and divide per node); keep one
mem per hot column.

### Order

1. **Lexer and parser** (utu-native, replacing tree-sitter for compiling;
   tree-sitter stays for the editor). Differential test: the store dump for
   every `.utu` in `std/`, `examples/`, and the tests matches Plan A's.
2. **Modules, imports, instantiation, name resolution.**
3. **The type graph.** The largest piece; diagnostics must match Plan A's on
   the negative corpus.
4. **Lowerings**: generators, iterators, mems, integer enums, distinct types,
   tuples, closures, operators, alt and promote.
5. **Codegen** straight to wasm bytes, including the WasmGC type section.
   Binaryen stays as a host-side optimizer that reads those bytes. The
   invariant is the same: byte-identical wasm against Plan A on every
   program, before optimization.
6. **Bootstrap.** Plan A builds the utu compiler (stage 1), stage 1 builds
   stage 2, stage 2 builds stage 3, and stages 2 and 3 must be identical.
   The bundle ships stage 2; the JavaScript compiler stays as stage 0.

### Stays in JavaScript

- The TypeScript `.d.ts` linker, which uses TypeScript's own compiler; utu
  reads the JSON ABI it produces.
- Binaryen's optimizer.
- The CLI, the VS Code extension, file and process I/O (through `copy_in`
  and `view`).
- DSL expanders (`@json`, Wutu, CSS, `@stored`) at first. They turn text into
  utu source, so the boundary is text either way.

### What the port needs from the language

- `Vec[T]` in the standard library (written for examples/jpl).
- Collected, not thrown, diagnostics: the compiler must report every error.
- A freeze on everything else while the port runs, so the language does not
  move under both compilers at once.

## Measuring

`node examples/jpl/run.mjs` caches compiled wasm, so benchmark loops cost
the compile once. Plan A should add the same cache to every benchmark and
test that compiles the same program repeatedly.
