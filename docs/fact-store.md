# The type and fact store

How the compiler should keep what it knows about a program, so that it
analyzes once, lowerings produce typed code instead of triggering
re-analysis, and the same design ports to utu as mems and `Vec`s.

## Today

Facts live in five places, in five shapes:

| fact | where | shape |
|---|---|---|
| a node's type | type-graph slot `actual`, then `data-type-name` | string, re-parsed by `unwrapNullable`, `callableParts`, `tupleParts`, … (~100 call sites) |
| what a node is expected to be | slot `expected` (edge objects), then `data-expect*` | closures-turned-records, read on demand |
| what a name or call refers to | scope `resolutions` (by id string), slot `function`/`field`/`protocolCall`, `data-binding-*`, `data-fn-id` | Maps keyed by `"n123"`, attributes |
| types by name | `typeIndex` entries | objects holding IR nodes |
| diagnostics, provenance, spans | diagnostics graph, `data-error*`, `data-rewrite-*`, `data-start`… | Maps, attributes |

Three things follow from this, and they are why large builds spend ~40% of
their time re-solving:

1. **Lowerings read types from attributes** (`lower-backend-control` reads
   `data-type-name` 22 times, `lower-closures` 13, `lower-operators` 8), so
   every phase must *project* the graph onto the IR before the next one runs.
2. **Lowerings edit the tree and produce untyped nodes**, so the whole type
   graph is rebuilt and re-solved after closure/operator lowering and again
   after alt/promote lowering.
3. **Rule evaluation has side effects** (resolving a method call records the
   callee's function, overwrites its type, stamps `inferenceSource:
   'return-of'`, clears diagnostics). The facts a graph ends with depend on
   the order its rules ran, so a partial update cannot match a full rebuild.

## The design

One store per compilation, keyed by node index (`node.$`, already dense per
document). Three parts: a **type table**, **node facts** in columns, and
**relation lists** for the many-valued facts.

### 1. The type table

Every type is a `TypeId` (a small integer), hash-consed: building the same
type twice returns the same id, so equality is `===` on ints.

```
TypeId → row { kind, a, b, list }        kinds:
  0 void   1 never   2 null   3 unknown   4 nullable-placeholder   5 self (&)
  6 primitive   a = which (I32, I64, U32, U64, F32, F64, Bool, Str, Externref, …)
  7 named       a = declaration node index (struct, enum, variant, proto,
                    type-def, instantiated module type, foreign type)
  8 optional    a = inner TypeId                         (?T)
  9 fun        list = param TypeIds, b = result TypeId
 10 closure    list = param TypeIds, b = result TypeId
 11 tuple      list = part TypeIds
```

- `types.intern(row) → TypeId`, `types.parse(string) → TypeId` (once, at the
  boundary), `types.name(id) → string` (cached; exactly today's spelling, so
  diagnostics and editor text do not change).
- `unwrapNullable`, `callableParts`, `tupleParts` become field reads.
  `isAssignable(a, b)` and `unify(a, b)` are memoized on the id pair.
- The `typeIndex` entry for a named type becomes the row's declaration plus a
  **layout** record (fields as `[name, TypeId]`, tag type, representation),
  computed once by `linkTypeDecls`.

In utu: a `Vec` of rows plus an `IntMap` from the row's hash to its id; the
same interner as `std:Interner`.

### 2. Node facts

Single-valued facts are columns indexed by node index (`Int32Array` grown by
doubling; `-1` is absent):

| column | value |
|---|---|
| `type` | TypeId: the node's settled type |
| `typeSource` | small enum: literal, binding, return-of, operator, field-of, … (today's `inferenceSource`/`rule.source`) |
| `binding` | node index of the declaration an identifier names |
| `callee` | node index of the function a call, operator, or member resolves to |
| `callForm` | enum: method, static-method, operator, protocol, foreign, closure |
| `field` | field number within the owner's layout (owner is `type` of the receiver) |
| `contextType` | TypeId a literal, array literal, or implicit struct adopted from context (today: a `type-name` attribute written into the IR) |
| `file`, `start`, `end` | the span (row and column are derived from per-file line starts) |
| `origin` | node index this node was copied or rewritten from |
| `rewrite` | packed pass id and rewrite kind |

Rare facts (foreign operations, protocol declarations, foreign errors) live in
`IntMap<nodeIndex, record>`.

### 3. Relation lists

Many-valued facts are append-only lists, each with a per-node start index
(CSR), built in node order so iteration order is document order:

- **expectations**: `{ value, site kind, expected TypeId, source node, mode, label kind }`
  — what each value must be, and why (the editor's blame view).
- **uses**: declaration → identifiers (reverse of `binding`), for references.
- **calls**: function → call sites, caller → calls (the call graph).
- **coercions**: `{ node, from, to, kind }`.
- **diagnostics**: `{ node, kind, message, data }`, in report order.

### 4. Who writes what

```
parse          → spans, origin (node creation)
resolve        → binding, uses
solve (once)   → type, typeSource, callee, callForm, field, contextType,
                 expectations, coercions, diagnostics
lowerings      → write facts for the nodes they create (see below)
backend plan   → reads facts only
projection     → writes data-* attributes from facts, once, at the end,
                 for the editor's DOM views and debug dumps
```

Two rules make it work:

- **Resolution is a fact, not a side effect.** Today `callResult` resolves a
  method and, as it goes, rewrites the callee's slot. In the store, resolving
  a call writes `callee`/`callForm` for the call node only; the callee
  expression's type is its own rule's job. Solving becomes order-independent:
  every rule is a pure function of the columns it reads.
- **Contextual typing writes `contextType`, never the IR.** The literal `2`
  adopting `F32` records `contextType[lit] = F32`; codegen reads it. The
  solver's rewrite rounds stay, but they change facts, so re-solving touches
  only the rules that read them.

### 5. Lowering with facts: typed builders

A lowering creates nodes through a builder that writes their facts as it
goes:

```js
const b = facts.builder(site, 'lower-operators', 'operator-call');
const call = b.call(fnNode, [left, right], { type: resultType, form: 'operator' });
// writes: kind/children (IR), span+origin+rewrite (from site),
//         type[call] = resultType, callee[call] = fnNode, callForm[call] = operator
```

Moved nodes keep their facts (they are keyed by node, and the node is the
same). Cloned subtrees copy facts with the clone (the store maps old index to
new). So after any lowering the store is already complete, and **the rebuilds
disappear**: one resolve, one solve, then lowerings and codegen.

Each lowering states the facts it must produce; in debug builds, a checker
re-derives them from scratch (a full solve on the lowered program) and
compares, which is how we know the builders are right.

### 6. What the editor sees

The analysis target stops after the single solve. The editor's graphs,
explain, references, and diagnostics read the surface program's facts, not
the post-lowering ones. This is the one intended behavior change (see below).

## What changes that users can see

Measured against the behavior fingerprints, expect these and only these:

1. **Explain on operators and closures** shows the surface operation
   (`a + b` resolved to `I32:add`) instead of the lowered call node it
   becomes today, and inference sources no longer include the
   `return-of` stamps that call resolution put on callees.
2. **Diagnostics are checked on the surface program.** Wording stays the
   same for nearly all; operator type mismatches may point at the operand
   instead of a synthesized argument.
3. **Projected `data-*` attributes appear only after analysis**, so tools
   reading intermediate IR dumps see fewer attributes.

Wasm output does not change: codegen reads the same facts (from columns
instead of attributes), so the wasm fingerprints stay byte-identical through
every step.

## Migration

Each step is a commit with the suite and wasm fingerprints passing; behavior
fingerprints stay identical through step 4 and are re-recorded once, with a
reviewed list of differences, at step 5.

1. **Type table.** Intern types; keep strings at every boundary
   (`types.name`). Slots store TypeIds. Exact.
2. **Columns.** The type graph's slots, scope resolutions, and call targets
   become columns and relation lists; the existing `slots.get`,
   `resolutions.get`, `targets.get` APIs are views over them. Exact.
3. **Facts out of attributes.** Lowerings and codegen read columns instead
   of `data-type-name`, `data-binding-id`, `data-fn-id`; intermediate
   projections are removed. Exact (the final projection is unchanged).
4. **Contextual types as facts.** Literal/array/struct context goes to
   `contextType`; codegen reads it instead of the rewritten `type-name`
   attribute. Exact for wasm; behavior identical if the projection keeps
   writing `type-name` for the editor.
5. **Pure resolution and typed builders.** Resolution writes facts instead
   of mutating other slots; operator, closure, and alt/promote lowering
   build typed nodes; the two rebuilds are deleted; the analysis target
   stops after the solve. Behavior fingerprints re-recorded and reviewed.
6. **Projection last.** `projectGraphs` runs once, for the editor.

## Expected effect

- Large builds: the two rebuilds (~40%) and the intermediate projections
  (~10%) go away; type comparisons are int compares.
- Memory: slot objects (~150 B each), edge and rule objects, and type
  strings become a few `Int32Array` columns (~40 B per node).
- The port: every column is a mem or `Vec` in utu; the type table is the
  interner jpl already uses; the builders are ordinary functions.

## Open questions

- **Generic instantiation.** Modules are still instantiated by cloning
  before analysis, so each instance is solved separately. Instantiating by
  substitution (one solve per generic body, types substituted at lowering)
  would shrink the store further, but changes where per-instance errors are
  reported. Not part of this plan.
- **Foreign types.** `ForeignABI.type` names host types in first-use order
  (`Foreign0T3`) and creates declarations while the solver runs. In the
  store, foreign types should be interned up front from the declarations, so
  solving creates nothing; naming may need to stay first-use to keep wasm
  identical.
