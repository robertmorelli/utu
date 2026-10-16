# wutu — design notes

A web DSL for utu. Three ideas, in dependency order: a syntax that melds markup
and CSS, a performance target that puts a non-JS framework in the smallest tier,
and a foreign-function story that makes anything reachable.

Status markers throughout: **[decided]**, **[open]**, **[estimated]** — the
estimates are the ones to go measure before quoting anywhere.

---

## 1. The DSL

### Thesis

**The meld deletes the join.**

Every mainstream styling approach makes you write markup and then write a
*selector to find that markup again*. CSS Modules mangles the key,
styled-components generates it at runtime, Vue and Svelte scope it with a
compiler but still put it in a separate `<style>` block. The selector is a join
key, and joins are where drift lives.

The landscape splits two ways and neither is satisfying:

- **Keep CSS, staple it on** — everyone. Real CSS, permanent join.
- **Integrate it, abandon CSS** — Flutter. No join, but no cascade, no media
  queries, no `:hover` for free, and famously verbose nesting.

Nobody has integrated it *while keeping it CSS*. That is the gap.

The practical goal that falls out: **moving something from code-land to CSS-land
should be a local edit of a few lines**, not a file switch plus inventing a class
name plus a specificity gamble. People reach for JS state instead of `:hover`
mostly because JS is where they already are. Make the CSS version locally
cheaper and they will write real CSS.

### Shape **[decided]**

CSS/SCSS-shaped nesting where selectors *are* elements. Emmet-inspired heads,
brace-nested bodies. Looks as close to CSS as possible.

```
div.card {
  // A comment: utu's own, first on a line or after a blank, so
  // url(http://…) is not one. `#` is always text: color: #fff; works.

  color: red;                    // CSS declaration
  href = "/get-started";         // HTML attribute: name = value
  title = tooltipText;           // attribute from an expression
  .value = draft;                // DOM property: .name = value
  width: = size + "px";          // CSS value computed at render

  :hover { color: blue; }        // element-local pseudo-class
  @media (width < 40rem) { … }   // nested at point of use

  @ & > * { margin: 0; }         // scoped rule block, full selector power
  @ { … }                        // shorthand: this subtree and down

  h2 { "Welcome"; }              // child element, text node
  p { = ctaText; }               // child from an expression (text, number, or node)
  if open { p { "open"; } }      // a condition is just an expression
  on click |e| { log(e); }       // an event, typed by the DOM (MouseEvent)
}
```

Emmet's linear-typing operators (`>`, `+`, `*`, `^`, `[attr]`) are gone — brace
nesting subsumes them, and `^` in particular only exists because classic Emmet
expands from one line of text.

### The four namespaces **[decided]**

The failure that killed the earlier `emtx` prototype was a single untyped
property namespace shared by attributes and CSS. That is unfixable by inference,
because the namespaces **overlap with different semantics**: `<canvas width=300>`
sets bitmap resolution, `canvas { width: 300px }` sets display size. Both valid,
different meanings, same name.

So disambiguation is syntactic:

| kind | form | notes |
|---|---|---|
| CSS declaration | `prop: value;` | bare — the common case, so unmarked |
| HTML attribute | `prop = "value";` | `=` where CSS has `:`; a bare `prop;` is a boolean attribute |
| DOM property | `.prop = value;` | a leading `.` (an element head always starts with its tag) |
| child element | `tag { … }` | nesting |
| text / expression | `"literal"` / `= expr` | an expression may be a Str, a number, a Bool, or a node |
| event handler | `on click \|e\| { … }` / `on click = handler;` | a typed `cl`, never a string |

Events got their own keyword rather than the string-valued attribute channel:
utu has real typed closures, and they survive.

**Types do the work inference cannot.** utu has a real type system and a binding
graph with blame derivation. Attributes get checked against an element schema,
so `padding="10px"` is a compile error pointing at the token — something an
untyped preprocessor emitting text could never catch. This is the first version
of the idea that can be *verified*, and that is the real argument for it.

### Three tiers of CSS **[decided]**

1. **Element-local — melds perfectly, and it's most of CSS.** All ordinary
   declarations, pseudo-classes, pseudo-elements, and — the sleeper win —
   `@media` / `@container` / `@supports` nested at point of use, so a responsive
   tweak lives three lines from what it affects.
2. **Relational — needs the `@ { }` escape hatch.** Sibling combinators,
   `:has()`, anything targeting undeclared descendants. These are genuinely
   *queries*, not instances. This is also what solves **slots**: styling children
   a component received but did not declare.
3. **Document-level — needs a top-level scope.** `@font-face`, `:root` custom
   properties, `@layer` ordering, resets, `@page`. Design this scope
   deliberately rather than discovering it.

### Style sharing **[decided]**

Handled at the **framework** level (components, custom properties), not with a
DSL mixin construct.

Rationale: the compiler already dedupes identical declaration sets into one
class, so source-level duplication costs **zero bytes**. What remains is purely a
maintenance concern, and that is a components question.

The gap to watch: cross-cutting styling that isn't a component — a `danger`
modifier on buttons, links, and badges alike. Without an answer people reach back
for a global stylesheet, which reintroduces the split.

### Emission strategy **[open — measure]**

Three options, sharing one front end:

- **Grouped** (one class per unique declaration set) — simple, scales badly.
  Duplicates shared declarations; CSS grows ~linearly with distinct
  combinations.
- **Atomic** (one class per property:value pair) — CSS size **plateaus**, since
  real apps use a bounded vocabulary of colors and spacing. Elements carry
  several classes.
- **Selector-list** (`.c0, .c3, .c7 { color: red }`) — one class per element,
  no declaration ever duplicated. Only possible because the whole element set is
  known at compile time.

Build atomic decomposition as the internal representation; selector-list
emission is then a second pass over the same data. **Measure the curve, not a
point** — plot CSS bytes against element count at small/medium/large. The
plateau is the whole question.

**Exact dead-style elimination is free.** Styles attach to declared elements and
the tree is statically known, so unreachable elements have provably unreachable
styles. No PurgeCSS heuristics, no safelist, no scanning source for
class-name-shaped strings. Same principle as the `@es` glue shake.

### Open questions

- Event handler syntax
- Create-vs-match rule must be **non-contextual** — if `.foo` sometimes creates
  and sometimes matches depending on position, that is a trap. Silently emitting
  a phantom div is a nasty bug class.
- Nesting depth: SCSS already has a "don't nest past 3–4" folk rule, and these
  trees carry both markup and styles. Wants a linter rule and an idiom for
  splitting into components early.
- Sigil choice — an unterminated `<` may fight tree-sitter and embedded-language
  tooling. Semantics survive a different character.

### How to drive the next design pass

Derive the syntax from the refactors that must be cheap, not the other way
round. Write before/after for: JS hover → `:hover`, resize listener → `@media`,
rAF loop → `@keyframes`, conditional class → state selector, inline style →
declaration. Each must be a local edit of a few lines. Any construct where the
refactor still costs a file move or a name invention is a hole in the thesis.

That exercise also produces the fifteen-second demo that sells the language.

---

## 2. Performance target

### Byte tier landscape

Gzipped, **runtime only**, approximate — these move with versions.

| tier | framework | gzipped |
|---|---|---|
| multi-MB | Blazor WASM | ~1–2 MB trimmed |
| wasm heavyweight | Yew, Dioxus | ~60–100 KB |
| wasm lightweight | Leptos, Sycamore | ~40–70 KB |
| JS mainstream | React + ReactDOM | ~45 KB |
| | Vue 3 runtime | ~22–34 KB |
| JS small | htmx | ~14 KB |
| | Solid | ~7 KB |
| | Preact | ~4 KB |
| compile-time | Svelte | ~2 KB |

**Target: the Svelte/Solid/Preact tier, as the only non-JS occupant.**

### Why that's reachable **[decided — the reasoning]**

The Rust wasm floor is set by things utu structurally does not have: `core::fmt`,
panic and unwinding machinery, and **an allocator** — Rust manages linear memory
itself, WasmGC hands allocation to the host collector. Add no monomorphization
blowup and stringref instead of shipped UTF-8 transcoding routines.

Evidence: DeltaBlue, a real constraint solver, is **1,836 bytes brotli**.

The other WasmGC languages (Kotlin/Wasm, Dart, MoonBit, OCaml) have the same
platform advantages but are *porting existing languages*, so they drag existing
stdlibs. That is why none of them are in this tier. **The moat is having designed
for the floor, not the platform** — and it erodes quietly with every stdlib
addition that isn't pay-for-what-you-use.

### Estimated hello world **[estimated]**

| component | gzipped | basis |
|---|---|---|
| instantiate boilerplate | ~130 B | measured |
| runtime shim (closures for events) | ~300–500 B | measured |
| DOM glue, ~60 bindings @ ~8 B marginal | ~500 B | measured |
| reactive runtime in wasm | ~2–5 KB | **guess** |
| **total** | **~3–6 KB** | |

Only ~1 KB of this is grounded. **The reactive runtime is most of the total and
is unmeasured.** If it lands at 15 KB the tier claim weakens to Preact/Lit —
still good, not the headline. Nail this number before publishing anything.

### Runtime architecture **[decided]**

**No virtual DOM.** Diffing in wasm plus a crossing per patch is the worst
possible configuration and is how wasm frameworks earn their reputation. Compile
to direct node references plus signal subscriptions; the compiler knows
statically which expressions depend on which state, so an update is "call this
setter on this node."

**Batch the boundary.** WasmGC lowers per-crossing cost but does not make
crossings free. Build the update set in wasm and flush it in as few calls as
possible — ideally one call passing a compact instruction buffer that JS
replays. This is much harder to retrofit than to design in.

### What WasmGC actually buys at the boundary

Versus every linear-memory framework (Yew, Leptos, Blazor):

- **No side table.** `wasm-bindgen` keeps a JS-side heap array and passes integer
  indices, with manual slot refcounting. `externref` holds the DOM node
  *directly*, and the wasm and JS heaps are the same collector, so cross-boundary
  cycles collect instead of leaking.
- **No string transcoding.** Probably the biggest one for UI work — `wasm-bindgen`
  encodes/decodes UTF-8↔UTF-16 on every string crossing, and a framework crosses
  with a string on every `textContent`, attribute, and class name. stringref
  passes host strings as themselves.
- **No closure lifetime management.** `wasm-bindgen`'s `Closure` needs a table
  entry and explicit `.forget()`. utu's `cl` is already a real JS function.

### Honest positioning

**Against plain JS on DOM throughput, wutu loses.** JS is the home team; the DOM
lives in JS-land and every crossing costs something. Do not benchmark against
Next.js on a marketing site — that loss would define the project.

The competition is the other wasm frameworks, where the advantages above are
real and measurable. And nobody picks Leptos because it beats vanilla JS at DOM
updates — they pick it for the language.

### What would break the claim

In rough order of likelihood:

1. Reactive runtime heavier than estimated.
2. **The compile-time framework scaling curve.** Svelte's runtime is ~2 KB but
   per-component output is larger than React's, which amortizes one runtime
   across everything — hence the recurring "Svelte doesn't scale in bytes"
   critique, with a crossover somewhere in the low hundreds of components. wutu
   inherits this shape exactly. **Measure bytes against component count at 1, 10,
   50, 200 against Solid and Svelte on the same app.** The hello-world number
   decides nothing.
3. Stdlib growth quietly raising the floor.

All three are measurable now and expensive to discover later.

---

## 3. `.d.ts` is the new `.h`

### The idea

`.h` is how C became the lingua franca of FFI. `.d.ts` + wasm is the browser-era
equivalent, and utu should treat it that way deliberately.

One binder, one pipeline, four sources:

| source | how it arrives |
|---|---|
| npm packages | `.d.ts` in `node_modules` |
| first-party TS | `.d.ts` from a local file |
| Rust | `wasm-pack build` → wasm + JS glue + `.d.ts` |
| C++, TinyGo, AssemblyScript, … | same shape |

**Support artifact shapes, not ecosystems.** Everything collapses to two:
JS + `.d.ts`, and wasm + JS glue + `.d.ts`. Both go through the same door.

### Why Rust-via-wasm-pack beats native Rust integration **[decided]**

Native integration would need GC↔linear-memory marshalling (a utu `Array[U32]`
is a GC object; a Rust `&[u8]` is a pointer into a different heap — no way to
pass one to the other without copying), rustc in the toolchain, and a second
codegen path.

Going through `wasm-pack` costs a JS hop (utu-wasm → JS → Rust-wasm) and buys
**zero new machinery**. For a bulk interface — one call, 10 ms of work — the hop
is noise. Correct trade.

The premise that motivated native integration is also shaky: utu is already good
at compute. `bench:tiny` shows **0.87× Rust time** and **0.26× Rust bytes**;
DeltaBlue shows utu at 132.5 ms against **safe Rust at 228.7 ms** (unsafe Rust
wins at 80.7 ms). So Rust integration is a **crate-reuse** story, not a
performance story — narrower, and later.

### Ship order **[decided]**

**First-party TS first.** It is the same machinery as the npm binder pointed at a
local path, and first-party TS uses a far narrower slice of the language than
`@types/node` — no conditional types, no declaration merging, no thousand-line
overload sets. Get the pipeline working against friendly input, then face npm
with the hard parts solved. It also fully covers the "browser shipped something
new" case, which is the more common escape-hatch need.

Scope it honestly: this is an ergonomic upgrade over `@es` (multi-line code, TS
tooling, type-checked signatures), not a new capability.

### Known warts

- **`.free()`.** `wasm-bindgen` exposes Rust objects as classes with explicit
  `free()`, because ownership does not survive the boundary. utu is GC'd with no
  destructors, so a Rust-backed handle leaks unless freed manually. This is the
  one place "Rust is just another npm package" stops being true. Decide early
  whether to wrap those handles against a `FinalizationRegistry` or document it
  loudly.
- **wasm-bindgen glue is chunky** — heap table, string codecs, pointer
  bookkeeping, call it 5–15 KB before any Rust code, plus Rust's own floor. A
  Rust dependency is a heavy dependency by wutu standards. Surface the cost at
  build time.
- **Two modules, two instantiations** — two compiles on the first-paint path.

### Rules

All of `IMPORTANT_MINIFICATION_INFO.md` now applies to every foreign source
simultaneously. The two that matter most:

1. **Always emit named imports** (`import { x } from 'pkg'`), never
   `(await import('pkg')).x` — measured at **116x** more bundled bytes for a
   tree-shakeable package.
2. **Always shake against the emitted wasm.** An ingested `.d.ts` declares
   thousands of bindings; without the filter, one used function drags the whole
   declared surface into every bundle.

### Consequence

The binder stops being "npm interop" and becomes **utu's entire foreign-function
story**. That makes the TS-subset document the spec for everything, and worth
real design time before the parser exists.
