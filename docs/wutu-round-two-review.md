# Final review: ten more Wutu sites

The sequence was first-round build, friction fixes, second-round build, then this
review. Both batches are functional local browser tools with readable Utu source,
shared stylesheet modules, prerendered HTML, persistence and responsive layouts.
They do not connect to a backend.

| First batch | Exercise |
| --- | --- |
| Atlas | Filtering, saved places, nested Wutu → Utu → Wutu |
| Pantry | Stock counts and restocking |
| Meter | Nested loops, weekly toggles, progress |
| Ledger | Numeric drafts, validation, purchase insertion/removal |
| Studio | Isolated draft form, cross-column keyed movement |

| Second batch | Exercise |
| --- | --- |
| Venue | Seat selection and cost totals |
| Grove | Date input and plant-care intervals |
| Tempo | Timer effects, routing, teardown and remount |
| Pitch | Quote arithmetic, discounts and browser printing |
| Readroom | Notes routes, textarea persistence, reading status |

## What improved

- CSS stylesheet envelopes pass the complete payload through unchanged. The
  stencil preserves CSS characters and source offsets instead of implementing
  a CSS grammar subset. Shared sheets are deduplicated through hydration.
- Balanced envelopes and repeated expansion permit DSLs inside other DSLs.
- Named islands retain local drafts and limit rendering. In a 200-card Studio
  board, a draft edit enters **4 nodes and performs 0 storage writes**, on both
  tested engines. The earlier unpartitioned Dispatch implementation visited
  1,242 nodes. Existing applications must opt into islands to gain that benefit.
- Global loop keys preserve a card's DOM identity and keyboard focus across
  columns; duplicate global keys produce diagnostics.
- Typed persistence ships only when used; older DOM applications stay within
  their existing 14 KB complete-page budget.
- Manual save boundaries, debounce, deduplication, domain validators and incoming
  codecs reduce persistence glue. Conflicting unsaved edits block writes until
  explicit save/reload. Storage errors schedule a visible update.
- NumberField and optional List modules simplify form drafts and collection edits
  without adding loops to the core Array module's canonical output.
- Scoped timers, cleanup, post-render callbacks and hash routes remove repeated
  lifecycle glue. Preview restores ordinary controls and focus after rebuilding.
- Whole-source formatting preserves foreign payloads; all ten sources pass
  formatter idempotence and match their source-viewer contents.

## Friction still visible after the second batch

1. **Update dependencies are explicit.** Named islands use string identities and
   `invalidate` calls. A misspelled name silently does nothing. Factories retain
   initial captures; replacing a parent argument is not a props update. Typed
   component handles would make this harder to misuse.
2. **CSS editing trails CSS acceptance.** The raw stylesheet route accepts any
   CSS grammar, but the stencil is currently a command, not continuously forwarded
   CSS completion/diagnostics. Inline mixed Wutu CSS still uses its own parser.
   Universal browser rendering and “100% perfect” diagnostics are not established.
3. **Raw DSL delimiters are reserved.** Literal delimiter pairs inside foreign
   strings still affect envelope depth. Escaped/verbatim envelopes and deeper
   source mapping would make arbitrary language embedding more robust.
4. **Persistence is intentionally limited.** Schemas still require local acyclic
   structs and the supported scalar/array types. Imported/recursive/optional
   schemas, schema migrations, and field-level conflict merging need more work.
   Validation predicates exist, but structured field errors remain application code.
5. **Routes and async work need a larger application test.** Hash routes and
   scoped timers work; there is no built-in asynchronous loader/cancellation,
   authenticated navigation, optimistic transaction, or async SSR contract.
   Browser timer throttling also means Tempo is not a precision clock.
6. **Common value types remain thin.** Dates use a small host helper; money assumes
   integer USD cents; locale-aware money, fractions, units and robust date arithmetic
   need optional library modules. Array edits copy, so large editable datasets
   need different collection choices and virtualization.
7. **Preview restoration has limits.** Fields are restored by position, so a
   structural form edit can mismatch drafts. Password/file inputs and arbitrary
   Wasm state are intentionally not restored. This is reload, not live code replacement.

These are remaining gaps, not claims that the tested sites are broken. The APIs
are substantially smoother for small local applications; the next useful stress
test is a network-backed, multi-route application with shared domain schemas.

## Reproduce

```sh
bun run build
npm run test:wutu-rounds
python3 -m http.server 4178 --bind 127.0.0.1 --directory dist/wutu-round-one
python3 -m http.server 4179 --bind 127.0.0.1 --directory dist/wutu-round-two
```

The browser suites cover both Chromium and WebKit, functional interactions,
persistence, mobile overflow, no-JavaScript content, source parity and a 15 KB gzip
complete-page budget. Generated size reports and desktop/mobile screenshots are
in each output directory. Source viewers and screenshots are excluded from page
payload measurements. CSS tests verify byte preservation and offset preservation;
they do not claim a complete browser CSS conformance suite.
