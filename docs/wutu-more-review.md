# Utu and Wutu: building three more sites

This pass builds Dispatch, Supper, and Split from readable Utu/Wutu source. It
uses the existing compiler and runtime; the changes are applications, build/test
scripts, and documentation. No new client dependency was added.

## What the sites do

| Site | Working behavior | Source |
| --- | --- | --- |
| Dispatch | Add, search, move, reopen, and delete project cards across three columns; preserve state and restore keyboard focus after moving | [main.utu](../examples/wutu-more/dispatch/main.utu) |
| Supper | Scale recipe ingredients from 1 to 12 servings, tick a shopping list, reset it, and follow four cooking steps | [main.utu](../examples/wutu-more/supper/main.utu) |
| Split | Record expenses for three people, calculate equal shares in integer cents, and suggest transfers that exactly settle the balances | [main.utu](../examples/wutu-more/split/main.utu) |

Each includes a source viewer containing the exact source, prerendered content,
local persistence, and responsive layouts. These are local browser tools.
Dispatch has no collaboration or drag-and-drop; Supper contains one recipe;
Split uses three fixed participants and USD and does not send payments.

## Rough edges encountered

### 1. Refreshes do too much work — Wutu

A single edit to Dispatch's draft field with 200 existing cards visited **1,242
DOM elements**, in both Chromium and WebKit. That edit does not change the
existing cards. Reconciliation preserves many existing nodes, but the renderer
still evaluates the whole connected view and creates its closures again.

Next improvement: independent component update scopes and cached derived values,
with a way to retain the explicit whole-view path for tiny applications. Large
lists also need a virtualization strategy. These counts describe rendering work,
not a timing benchmark.

### 2. Keys do not carry identity between parents — Wutu

Moving a Dispatch card to another column creates a new card node. Before the
application workaround, focus fell back to `BODY`. The shipped example schedules
focus restoration with `Browser.requestAnimationFrame` and a DOM ID. Tests now
check that the move button is focused after the update, while confirming that
the old card node was disconnected.

Next improvement: a post-render/focus lifecycle primitive, followed by explicit
cross-container identity if it can remain compact. The current sibling-key
reconciliation alone does not solve a board's cross-column moves.

### 3. Persistence is eager and coarse — Wutu

The same one-character draft edit performed one storage write containing
**13,260 characters**: the whole board's saved envelope. The runtime encodes each
registered stored object on every refresh. It has no dirty-field tracking,
write deduplication, debounce, or cross-tab conflict handling.

Next improvement: distinguish durable model state from UI drafts, debounce or
batch writes, and allow explicit save boundaries. Expose migration and conflict
hooks. A struct-shaped codec is useful, but it is not a persistence policy.

### 4. Shape validation does not express application rules — Utu/Wutu

An `I32` cooking-step index can still be 999; a valid string can name an unknown
payer. Supper now repairs out-of-range restored steps/servings. Dispatch rejects
unknown stages. Split filters invalid payers/amounts and caps the expense count.
The stored codec alone cannot express these rules.

Next improvement: reusable validation/refinement and migration functions. The
current codec also restricts schemas to acyclic local structs and a small set of
field types; richer shared domain models need further work.

### 5. Numeric inputs and display still need glue — Utu/Wutu

Split represents money with integer cents and handles cent rounding and remainder
allocation explicitly. Display still calls `.to_f64().toFixed(2)`, and counters
need `.to_f64().toString()`. Supper's quantities are decimal strings rather than
friendly fractions or unit-aware values.

A numeric binding stores an F64, while an editor naturally has empty, invalid,
and valid text states. Split uses zero as an empty-entry sentinel and native
form validation to reject it. That is workable, but a parsed-field abstraction
with validation errors would be more natural. Small formatting/money/unit
helpers should remain optional and removable by the compiler.

### 6. Some composition syntax remains awkward — Utu/Wutu

A Wutu literal cannot contain another Wutu literal: the first closing DSL
delimiter terminates the outer one. Split's settlement rows therefore became a
separate `transfer` component function. That extraction is reasonable, but the
language should make nested composition and its diagnostics less surprising.

Control-flow slots still use `$[...]`; ordinary values use `= expression;`;
attributes have another form. Array insertion uses `chain([item]) collect(T)`
and removal uses `filter ... collect(T)`. These work, but common UI operations
need more concise standard helpers and better collection type inference.

### 7. Styling and tooling still require manual discipline — Wutu

The three applications repeat their reset, basic controls, and layout utilities
inside `@document`. Theme values differ, but the shared structure is boilerplate.
A first-class reusable style module would help without requiring a client style
engine. Mobile visual inspection was still necessary: Supper needed smaller
instruction typography and explicit text-size adjustment.

The formatter handles Wutu islands, preserves commented bodies conservatively,
and leaves surrounding Utu untouched. It cannot yet provide one consistent
formatting experience for a whole application. Completions are useful vocabulary
suggestions rather than full CSS validation or deeply contextual template edits.

### 8. The complete application story still has gaps

These sites exercise synchronous, local browser interactions. They do not prove
network loading/cancellation, authentication, routing, navigation focus,
optimistic updates, or server rendering with asynchronous data. External
callbacks still need explicit `wutu.refresh()`. The preview reloads the entire
page, and prerendering uses a build-time browser with synchronous initialization.
Those are documented boundaries, not features tested by this batch.

## Verification and reproduction

```sh
node scripts/build-wutu-more.mjs
node scripts/test-wutu-more.mjs
node scripts/test-wutu-more.mjs --webkit
python3 -m http.server 4177 --bind 127.0.0.1 --directory dist/wutu-more
```

The browser suite checks interactions, reload persistence, raw text rendering,
keyboard focus restoration, mobile width, no-JavaScript content, source-viewer
parity, and a 15 KB gzip budget including HTML, CSS, JS, and Wasm. Settlement
checks include zero, equal, odd-cent, uneven, and large totals; an independent
calculation verifies that the suggested transfers leave every balance at zero.
Supper's restored domain bounds are tested separately from codec type checks.

Generated size reports, screenshots, and rendering/storage observations live in
`dist/wutu-more`. Source viewers and screenshots are not part of site payloads.
No remote assets, image downloads, tracking, or fonts are required.

My next priorities are smaller update scopes and persistence boundaries, then
post-render focus/lifecycle support. Those remove measurable costs and app glue
before adding more syntax.
