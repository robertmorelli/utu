#import "@preview/cetz:0.3.4"

#set document(title: "utu — Type Dependency and Expectation Graph", author: "Robert Morelli")
#set page(paper: "us-letter", margin: (x: 1.6cm, y: 1.8cm), numbering: "1")
#set text(font: ("Helvetica Neue", "Helvetica", "Arial"), size: 10pt)
#set par(justify: true, leading: 0.62em)
#show heading: set block(above: 1.35em, below: 0.7em)
#show raw: set text(font: ("Menlo", "Monaco", "Courier New"), size: 8.5pt)

#let c-type    = rgb("#1d4ed8")
#let c-type-bg = rgb("#dbeafe")
#let c-exp     = rgb("#b45309")
#let c-exp-bg  = rgb("#fef3c7")
#let c-err     = rgb("#b91c1c")
#let c-err-bg  = rgb("#fee2e2")
#let c-mute    = rgb("#6b7280")

// ── graph primitives ────────────────────────────────────────────────────────
// Nodes are cetz `content` wrapping a styled box, so they size to their text
// instead of overflowing a fixed-width rect.  Successive nodes are positioned
// relative to the previous node's east anchor, which keeps gaps exact no
// matter how wide the labels turn out to be.

#let gfig(body, cap: none) = figure(
  align(center, cetz.canvas(length: 1cm, body)),
  caption: cap,
)

#let node(p, body, n, fill: c-type-bg, stroke: c-type, anchor: "center") = cetz.draw.content(
  p,
  box(
    inset: (x: 6pt, y: 4.5pt), radius: 2.5pt,
    fill: fill, stroke: 0.9pt + stroke,
    text(size: 8pt, fill: stroke.darken(12%), body),
  ),
  name: n,
  anchor: anchor,
)

#let enode(p, body, n, anchor: "center") = node(p, body, n, fill: c-exp-bg, stroke: c-exp, anchor: anchor)
#let xnode(p, body, n, anchor: "center") = node(p, body, n, fill: c-err-bg, stroke: c-err, anchor: anchor)

#let arrow(a, b, lbl: none, col: c-type) = {
  cetz.draw.line(a, b, mark: (end: ">", scale: 0.5), stroke: 0.9pt + col)
  if lbl != none {
    cetz.draw.content(
      (a, 50%, b),
      text(size: 7pt, fill: col, style: "italic", lbl),
      anchor: "south",
      padding: 0.07,
    )
  }
}

#let chip(col, bg, label) = box(baseline: 20%)[
  #box(width: 0.75em, height: 0.75em, radius: 1pt, fill: bg, stroke: 0.7pt + col)
  #h(0.25em) #text(size: 8.5pt, label)
]

// ── title ───────────────────────────────────────────────────────────────────

#align(center)[
  #text(size: 19pt, weight: 700)[Type Dependency and Expectation Graph]
  #v(-0.35em)
  #text(size: 11pt, fill: c-mute)[how utu finds every type error in one pass, and explains each one]
]

#v(0.5em)

#block(
  width: 100%, inset: 10pt, radius: 3pt,
  fill: luma(247), stroke: (left: 2.5pt + c-type),
)[
  Every AST node gets two vertices, its *type* and its *type expectation*, and
  most nodes use only one — many use neither. A single directed edge set
  connects them: edges originate at type vertices, carry a transform function,
  and point in the direction of blame, so the head's type is a consequence of
  the tail's. An edge landing on a *type* vertex propagates a type forward; an
  edge landing on an *expectation* vertex records what its context requires.
  Edges bind; they never fail. Checking runs
  in two phases: flood types along every edge to a fixpoint, comparing nothing;
  then walk every node once and check its type against its expectation. Because
  no comparison happens until the flood settles, one pass finds every error in
  the program instead of the first failure hiding the rest — and because both
  endpoints are reified, explaining a failure is just walking in-edges back
  from each vertex to its seed.
]

#v(0.4em)
#align(center)[
  #chip(c-type, c-type-bg, [type vertex])
  #h(1.4em) #chip(c-exp, c-exp-bg, [expectation vertex])
  #h(1.4em) #chip(c-err, c-err-bg, [mismatch])
]

= Two vertices per node

The typechecker never asks "what is the type of this expression?" in isolation.
It asks two separate questions and stores both answers:

#gfig(
  {
    node((0, 0), [`type(n)` — what it #emph[is]], "t", anchor: "west")
    enode((rel: (3.4, 0), to: "t.east"), [`expect(n)` — what context #emph[requires]], "e", anchor: "west")
    cetz.draw.line("t.east", "e.west", stroke: (paint: c-mute, thickness: 0.9pt, dash: "dashed"))
    cetz.draw.content(("t.east", 50%, "e.west"), text(size: 7.5pt, fill: c-mute)[must be compatible], anchor: "south", padding: 0.09)
  },
  cap: [The single invariant. Everything else exists to make this check total and explainable.],
)

Most nodes populate exactly one vertex. Many populate neither — an `if`
keyword, a delimiter, a block that is never used as a value. *An unpopulated
vertex is the normal case, not an error state.* A node with no type is not a
node with a wrong type, and that distinction is what keeps a single unresolved
name from poisoning everything downstream of it.

= Edges

There is one directed edge set. Edges always *originate* at a type vertex; they
*terminate* at either kind. Direction is blame direction — following an edge
backwards answers "why does this node have this type?" Every edge carries a
transform #emph[τ] applied as the type crosses it.

An edge is a *binding*, not an assertion: it says where the value in the head
vertex came from. Edges cannot fail. Types flow out of annotations and into
everything downstream, intermediate values included, and that flow is all an
edge represents. The only thing that fails is the phase-2 comparison at a node,
and that comparison is not an edge.

*No edge connects a node's own type to its own expectation.* That pairing is
precisely what the typechecker checks, and drawing it would confuse binding
with checking. An expression's type is never derived from its own context — with
one deliberate exception, literals, below.

== Propagation: type → type

Moves a known type forward through a structural relationship.

#gfig(
  {
    node((0, 0), [`type(a)`], "a", anchor: "west")
    node((rel: (2.6, 0), to: "a.east"), [`type(a[i])`], "ai", anchor: "west")
    arrow("a.east", "ai.west", lbl: [elem-of])

    node((0, -1.5), [`type(a)`], "a2", anchor: "west")
    node((rel: (2.6, 0), to: "a2.east"), [`type(a.b)`], "ab", anchor: "west")
    arrow("a2.east", "ab.west", lbl: [field-of])

    node((0, -3.0), [`type(a)`], "a3", anchor: "west")
    node((rel: (2.6, 0), to: "a3.east"), [`type(a + b)`], "sum", anchor: "west")
    arrow("a3.east", "sum.west", lbl: [return-of])
  },
  cap: [Propagation edges. The transform is what makes `a[i]` narrower than `a`.],
)

== Binding an expectation: type → expectation

Populates *another* node's expectation from a declared type. Still a binding —
it records what the context requires; the requirement is tested later.

#gfig(
  {
    node((0, 0), [`type(T)` from `let x: T`], "t", anchor: "west")
    enode((rel: (2.0, 0), to: "t.east"), [`expect(e)`], "e", anchor: "west")
    arrow("t.east", "e.west", lbl: [id], col: c-exp)

    node((0, -1.5), [`type(param decl)`], "p", anchor: "west")
    enode((rel: (2.0, 0), to: "p.east"), [`expect(argument)`], "arg", anchor: "west")
    arrow("p.east", "arg.west", lbl: [id], col: c-exp)

    node((0, -3.0), [`type(return annotation)`], "r", anchor: "west")
    enode((rel: (2.0, 0), to: "r.east"), [`expect(body tail)`], "bt", anchor: "west")
    arrow("r.east", "bt.west", lbl: [id], col: c-exp)
  },
  cap: [Expectation bindings. Declared types are the seeds; everything downstream is checked against them.],
)

== Expectation vertices are sinks

No edge originates at an expectation vertex. Expectations do not flow onward
and never feed a type vertex — *there is no backward pass.*

== The one exception: literals

Literals are the single place where context legitimately *determines* a type
rather than constraining it. `let x: I64 = 0` must not fail — the literal has
no inherent width, and `std/LiteralDefaults.utu` supplies a type only for when
nothing better is known. So the declared context binds the literal's type
directly: an edge into #raw("type(literal)"), not #raw("expect(literal)").

Which types a literal may adopt is declared by the stdlib and matched *by name*:

#block(inset: (left: 8pt))[
  #raw(`<ir-default kind="int" type-name="I32" adopts="I32 U32 I64 U64 M32 M64"/>`.text, lang: "xml")
]

`Bool` is a wasm i32 exactly like `I32` is, and is deliberately absent, so
`takes_bool(1)` stays an error. Keying adoption on representation instead of
name would silently accept it — the same class of bug `TYPES.md` exists to
prevent.

= Worked example: `c: t3 = a[b]`

Given `a: t1[t2]`, the graph for `c: t3 = a[b]` is two independent chains that
meet at one node:

#gfig(
  {
    node((0, 0), [`type(a: t1[t2])`], "decl", anchor: "west")
    node((rel: (2.2, 0), to: "decl.east"), [`type(a)`], "a", anchor: "west")
    xnode((rel: (2.4, 0), to: "a.east"), [`type(a[b])` = `t2`], "ab", anchor: "west")
    arrow("decl.east", "a.west", lbl: [id])
    arrow("a.east", "ab.west", lbl: [elem-of])

    node((0, 2.1), [`type(c: t3)`], "c", anchor: "west")
    enode((rel: (0, 2.1), to: "ab.west"), [`expect(a[b])` = `t3`], "eab", anchor: "west")
    arrow("c.east", "eab.west", lbl: [id], col: c-exp)

    cetz.draw.line("ab.north", "eab.south", stroke: (paint: c-err, thickness: 1.2pt, dash: "dashed"))
    cetz.draw.content(("ab.north", 50%, "eab.south"), text(size: 7.5pt, fill: c-err, weight: 600)[compare], anchor: "west", padding: 0.12)
  },
  cap: [Neither chain is computed at the moment of failure; both already exist.],
)

If `t2` and `t3` are incompatible, blame is a backwards walk from each vertex to
its seed:

#block(inset: (left: 8pt), stroke: (left: 2pt + c-mute), width: 100%)[
  #set text(size: 9.5pt)
  `a[b]` is `t2` because `a` was declared `t1[t2]` at line X; \
  it must be `t3` because `c` was declared `t3` at line Y.
]

Both halves, mechanically, *without any diagnostic site having authored
either.* This is the property ad-hoc checking structurally cannot have: a
checker that computes the expectation at the point of failure has already
discarded where that expectation came from.

= Worked example: `a.b = c`

Assignment chains both edge kinds — three propagation steps and one expectation:

#gfig(
  {
    node((0, 0), [`type(a decl)`], "d", anchor: "west")
    node((rel: (1.9, 0), to: "d.east"), [`type(a)`], "a", anchor: "west")
    node((rel: (2.2, 0), to: "a.east"), [`type(a.b)`], "ab", anchor: "west")
    enode((rel: (1.9, 0), to: "ab.east"), [`expect(c)`], "ec", anchor: "west")
    arrow("d.east", "a.west", lbl: [id])
    arrow("a.east", "ab.west", lbl: [field-of])
    arrow("ab.east", "ec.west", lbl: [id], col: c-exp)
  },
  cap: [Dot access links type to type; `=` links type to expectation.],
)

The expectation lands on exactly the node where an error would be reported, and the
propagation chain leading into it is the explanation.

= Confluence

When two sources would reach one vertex, they are *chained in source order*
rather than joined. The first occurrence becomes the authority; every later one
has its expectation bound from it.

#gfig(
  {
    node((0, 0.85), [`type(x)` — then-branch], "x", anchor: "west")
    enode((0, -0.85), [`expect(y)` — else-branch], "y", anchor: "west")
    node((rel: (2.6, 0), to: "x.east"), [`type(if …)`], "if", anchor: "west")
    arrow("x.east", "if.west", lbl: [id])
    cetz.draw.line("x.south", "y.north", mark: (end: ">", scale: 0.5), stroke: 0.9pt + c-exp)
    cetz.draw.content(("x.south", 50%, "y.north"), text(size: 7pt, fill: c-exp, style: "italic")[source order], anchor: "west", padding: 0.12)
  },
  cap: [`if c { x } else { y }`. The first branch types the expression; the second is checked against it.],
)

This is deliberate. A lattice join would need a least-upper-bound over a nominal
type system that does not have one, and would erase which branch came first —
losing exactly the blame direction that makes the error explainable.

= Checking is two phases

#gfig(
  {
    node((0, 0), [
      #text(size: 9pt, weight: 600)[Phase 1 — flood] \
      #text(size: 7.5pt)[propagate to fixpoint, compare nothing]
    ], "p1", anchor: "west")
    enode((rel: (1.7, 0), to: "p1.east"), [
      #text(size: 9pt, weight: 600)[Phase 2 — compare] \
      #text(size: 7.5pt)[one walk, check every node]
    ], "p2", anchor: "west")
    arrow("p1.east", "p2.west", col: c-mute)
  },
  cap: [Nothing is checked until propagation has settled.],
)

Deferring all comparison until the flood settles is what makes whole-program
error reporting possible: nothing aborts early, so no failure hides the errors
behind it.

It is also what makes the editor experience fault-tolerant. A node that is
untypeable produces *no comparison* rather than a wrong one, so a single
unresolved name does not cascade into its enclosing block, its function, and
every caller. Its expectation is still populated from context, so hover still
reports `expected I32` even when the value is broken.

== The graph is built during the flood, not before it

`a + b` carries a `return-of` transform — but *which* overload, and therefore
which #emph[τ], is not known until `type(a)` settles. Edge creation interleaves
with propagation. The implementation is a worklist, not a static graph followed
by a traversal.

= Coercion sites fall out for free

The nodes where `type(n)` and `expect(n)` are incompatible-but-coercible are
exactly the insertion points for an implicit conversion — already enumerated by
phase 2, already addressable. utu keeps the set deliberately small:

#block(inset: (left: 8pt))[
  #set text(size: 9.5pt)
  - `T` → `?T` — nullable widening
  - variant → enum
  - `fun(…) R` → `cl(…) R` — closure decay
]

*Coercion never selects an overload.* Resolve the overload from the receiver's
actual type first, then coerce arguments to the resolved signature. utu has
overloaded operators but not overload #emph[sets] — exactly one candidate per
(type, operation) — and this rule is what keeps operator resolution a map lookup
rather than a ranked search over conversion sequences.

= Relationship to the nominal/representation split

Propagation is over `type-name` only. The `repr-of` transform is the single edge
kind that crosses into `type-repr`, and it appears only on edges consumed by
codegen. A transform that reads `type-repr` on a checking edge violates the
invariant in `TYPES.md` and does not land.
