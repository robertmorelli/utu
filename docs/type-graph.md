# utu Type Graph — types, expectations, and blame

The typechecker is a directed graph, not a tree walk. Every type error in a
program is found in one pass, and every error carries the full chain of
reasoning that produced it, because both halves of a type judgement are stored
as data rather than re-derived at the moment of failure.

The invariant:

> A node's **type** must be compatible with its **expectation**.
> Everything else is bookkeeping to make that check total and explainable.

## Vertices

Every AST node gets **two** vertices:

| vertex | meaning |
|--------|---------|
| `type(n)` | what this node *is* |
| `expect(n)` | what this node's context *requires* it to be |

Most nodes populate exactly one. Many populate neither — an `if` keyword, a
delimiter, a block that is never a value. Unused vertices are not an error
condition; they are the normal case, and a node with no `type` is not a node
with a *wrong* type.

## Edges bind; they do not check

There is **one** directed edge set. Edges always originate at a `type` vertex.
They terminate at either kind.

An edge is a **binding**: it says where the value in the head vertex comes
from. It is not an assertion, and it cannot fail. Types flow out of
annotations and into everything downstream — including every intermediate
value — and that flow is all an edge represents. The only thing that can fail
is the phase-2 comparison at a node, and that comparison is *not* an edge.

Direction is **blame direction**: the head's type is a *consequence* of the
tail's type. Following an edge backwards answers "why does this node have this
type?"

Every edge carries a **transform** `τ: Type → Type`, applied as the type
crosses it.

**No edge connects a node's own type to its own expectation.** That pairing is
exactly what the typechecker checks, and drawing it as an edge would confuse
binding with checking. An expression's type is never derived from its own
context — with one deliberate exception, [literals](#literals), where the
context genuinely determines the type rather than merely constraining it.

### type → type — propagation

Moves a known type forward. The type at the head is derived from the type at
the tail.

| site | edge | τ |
|------|------|---|
| `a` (use) | `type(decl of a) → type(a)` | identity |
| `a[i]` | `type(a) → type(a[i])` | `elem-of` |
| `a.b` | `type(a) → type(a.b)` | `field-of(b)` |
| `f(x)` | `type(f) → type(f(x))` | `return-of` |
| `a + b` | `type(a) → type(a + b)` | `return-of(T:add)` |

### type → expect — binding an expectation

Populates *another* node's expectation from a declared type. Still a binding:
it records what the context requires, and the requirement is tested later.

| site | edge | τ |
|------|------|---|
| `let x: T = e` | `type(T) → expect(e)` | identity |
| `x = e` | `type(x) → expect(e)` | identity |
| `a.b = e` | `type(a.b) → expect(e)` | identity |
| `f(e)` | `type(param decl) → expect(e)` | identity |
| `fn f() T { … }` | `type(T) → expect(body tail)` | identity |
| struct literal field | `type(field decl) → expect(init)` | identity |

Note that `a.b = e` chains both kinds:

```
type(decl of a) --id--> type(a) --field-of(b)--> type(a.b) --id--> expect(e)
```

Three propagation steps and one expectation binding. The expectation lands on
exactly the node where an error would be reported, and the propagation chain
leading into it is the explanation.

### Expectation vertices are sinks

No edge originates at an `expect` vertex. Expectations do not flow onward, and
they never feed a `type` vertex — there is no backward pass.

(A narrow exception may eventually be warranted — `a: T = foo()` arguably
implies `expect(foo) = fun() T`, an expectation-to-expectation edge through a
transform — but that is not part of the model today.)

### Literals {#literals}

The one place context legitimately *determines* a type instead of constraining
it. `let x: I64 = 0` must not fail: the literal has no inherent width, and
`std/LiteralDefaults.utu` supplies a type only for when nothing better is
known. So a declared context binds the literal's type directly — an edge into
`type(literal)`, not `expect(literal)`.

Which types a literal may adopt is **declared by the stdlib and matched by
name**:

```
<ir-default kind="int" type-name="I32" adopts="I32 U32 I64 U64 M32 M64"/>
```

`Bool` is a wasm i32 exactly like `I32` is, and is deliberately absent from
that list, so `takes_bool(1)` remains an error. Adoption keyed on
representation rather than name would silently accept it — the same class of
bug TYPES.md exists to prevent.

Everything else keeps the default and is compared normally.

## Confluence

When two sources would reach one vertex, they are **chained in source order**
rather than joined:

```
type(first) --id--> expect(second)
type(first) --id--> type(parent)
```

The first occurrence is the authority; it binds the expectation of every later
one, and the comparison happens where it always does. `if c { x } else { y }`
makes `type(x)` the type of the whole expression and expects `y` to match.

This is deliberate. A lattice join would need a least-upper-bound over a
nominal type system that does not have one, and would erase which branch was
"first" — losing the blame direction that makes the error explainable.

## Checking is two phases

**Phase 1 — flood.** Propagate types along every edge to a fixpoint, applying
each `τ`. Compare nothing.

**Phase 2 — compare.** Walk every node once. Where both vertices are
populated, check `compatible(type(n), expect(n))`.

Deferring all comparison until the flood settles is what makes whole-program
error reporting possible: nothing aborts early, so no failure hides the errors
behind it. A node that is untypeable produces *no comparison* rather than a
wrong one, so a single unresolved name does not cascade into its enclosing
block, function, and callers.

The edge set is **not fully known before the flood.** `a + b` carries
`return-of(T:add)`, but which overload — and therefore which `τ` — is not
determined until `type(a)` settles. Edge creation interleaves with
propagation: a worklist, not a static graph followed by a traversal.

## Blame

On a mismatch at node `n`, walk in-edges backwards from `type(n)` to its seed,
and separately from `expect(n)` to its seed. Two chains, both concrete.

For `c: t3 = a[b]` where `a: t1[t2]`:

```
type(a[b])   ←elem-of← type(a) ←id← type(a's declaration: t1[t2])
expect(a[b]) ←id←      type(c's declaration: t3)
```

which reports as: *`a[b]` is `t2` because `a` was declared `t1[t2]` at line X;
it must be `t3` because `c` was declared at line Y.*

Both halves, mechanically, without any diagnostic site having authored either.
This is the property ad-hoc checking cannot have: a checker that computes the
expectation at the moment of failure has already discarded where it came from.

## Coercions

The sites where `type(n)` and `expect(n)` are incompatible-but-coercible are
exactly the insertion points for an implicit conversion, already enumerated by
phase 2 and already addressable.

utu keeps this set deliberately tiny:

- `T` → `?T` (nullable widening)
- variant → enum
- `fun(…) R` → `cl(…) R` (closure decay)

**Coercion never selects an overload.** Resolve the overload from the
receiver's actual type first, then coerce arguments to the resolved signature.
utu has overloaded operators but not overload *sets* — `resolve-methods.js`
keys them `operator:I32.add` with exactly one candidate per (type, operation) —
and this rule is what keeps it that way.

## Relationship to the nominal/representation split

Propagation is over `type-name` only, per [TYPES.md](../TYPES.md). The
`repr-of` transform is the single edge kind that crosses into `type-repr`, and
it appears only on edges consumed by codegen. A transform that reads
`type-repr` on a checking edge violates the invariant in TYPES.md and does not
land.

## Where this is enforced

- **Graph construction** — the inference passes, which stamp `data-type-name`,
  `data-type-expect`, `data-expect-from`, and `data-expect-via` on IR nodes.
  The IR *is* the graph; there is no side structure.
- **Flood** — the worklist that replaces the fixed-iteration
  operator/method lowering loop in `compiler.js`.
- **Compare** — `validate-analysis.js`, which reads both vertices rather than
  re-deriving expectations per diagnostic.
- **Blame** — `diagnostics.js`, which follows `data-expect-from` instead of
  requiring each call site to author `relatedNodes` by hand.
