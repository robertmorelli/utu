# Wutu after building five websites

**Update:** the seven follow-up areas now have implementations: reactive roots,
keyed reconciliation, concise expressions/events, scoped aliases, bindings and
typed storage, editor/preview tooling, and prerender/hydration. See
[the current Wutu guide](wutu.md). All five examples now use reactive roots and
keyed loops; Folio also demonstrates typed storage and two-way bindings. The
notes below record the earlier implementation and remaining application limits;
manual replacement and blank HTML-shell limitations no longer describe these builds.

These are working browser applications, built with Wutu templates and Utu state/iterator code. They demonstrate the current implementation rather than a claim that the framework is finished for every production use case.

## Friction encountered and fixed in this pass

- A recovered malformed `@wutu` expression could reach expansion with no body and crash on `startsWith`. Expansion now leaves that node to the syntax diagnostic, with regression coverage.
- Wrapped select labels included option text in their accessible names. Explicit `aria-label` values now give each select a predictable name.
- Scope's three summary cards overflowed a narrow screen. They now stack on small screens.
- Sum totals in Scope and Wayfarer now accumulate as F64 so multiple valid large entries do not overflow I32. Individual prices remain integer cents.
- Juniper quantity limits are visible as disabled controls; its plus control restores focus after replacing the basket.
- CSV and ICS originally used conventional escaped string literals. Utu strings are raw, so the implementations now explicitly construct quote and CRLF characters. Browser tests inspect the decoded export content.

## Remaining language and framework rough edges

1. **Updates are manual.** Mutating a struct does not update its rendered text. Each application has `refresh`, DOM lookup, and `replaceWith` code. A small explicit update primitive would remove much repeated code without requiring a virtual DOM.
2. **There is no keyed list reconciliation.** Updating a basket or list constructs and replaces its subtree. Most important controls restore focus explicitly, but DOM identity, selection, and transient element state are not generally retained. This becomes expensive for large collections.
3. **Aliases occupy the enclosing Utu scope.** Two unrelated `select as day` aliases in the same template clash. The itinerary uses `day_filter` and `day`. Template-local lexical scopes would be more natural.
4. **Strings are raw.** `\"` does not quote a quote, and `\r\n` does not make a line break. This is particularly awkward for CSV/calendar formats. A documented escaped-string form or character constructors would help.
5. **Formatting numbers is verbose.** I32 values often need `.to_f64().toString()`. Price display and index conversion need small helpers. Locale-aware money formatting is not built into the examples.
6. **JSON/native-array conversion is tedious.** Persistence explicitly walks a JS array, casts JS numeric fields, builds native structs, and converts them back into JS objects for serialization. Typed codecs and array bridges would improve this substantially.
7. **Appending while decoding repeatedly copies arrays.** `items chain([item]) collect(T)` is convenient but repeated in a load loop is quadratic. A builder or pre-sized array construction is preferable for large saved collections.
8. **Collection type inference is incomplete.** `collect(Book)` and `sort(Stop)` require an explicit type. These examples are small enough that it is tolerable, but repetitive.
9. **Sort is unstable.** *(Resolved: `sort` is now a stable merge sort.)* The itinerary sorts by day, so equal-day stops have no promised insertion order. A stable sort or a tie-breaker/comparator composition would improve scheduling interfaces.
10. **Separate aggregates mean separate traversals.** Counts, totals, filtered views, and conflict checks are each explicit pipelines. Signal's conflict detector is quadratic; it is reasonable for eight sessions but needs grouping for a larger programme.
11. **Streams have not been exercised here.** These apps use synchronous native-array pipelines. Push streams, cancellation, backpressure, subscriptions, and async operator semantics are not supplied by these examples.
12. **Markup diagnostics are coarse.** Utu interpolation diagnostics retain source ranges, but malformed markup often points to the whole DSL with a body offset. Missing braces in dense templates are unnecessarily hard to locate. The browser build helper also sometimes emits only a terse `parse-error`.
13. **Editor support trails the syntax.** There is no Wutu-specific formatter or comprehensive HTML/CSS completion/validation workflow. CSS values are mostly passed through. The HTML attribute vocabulary is maintained separately from browser declaration types.
14. **Styling needs more composition.** Each self-contained example repeats its document theme/reset and basic controls. Component CSS installs on first use and remains installed; it is not a global atomic-CSS extraction system. There is no style lifecycle or strict-CSP nonce integration in these examples.
15. **Rendering requires JavaScript and Wasm.** The HTML shell contains metadata and a noscript message, but not the rendered application. There is no SSR, prerender/hydration, loading skeleton, or graceful unsupported-Wasm fallback. Search indexing and initial content availability need work for public content sites.
16. **Browser compatibility needs an explicit contract.** These builds rely on modern WasmGC and JS-string builtins. Chromium and WebKit passed; that does not establish compatibility with older browsers, every Safari version, or Firefox.
17. **Build ergonomics are still a script.** There is no integrated development server, hot reload, route generator, or deployment/compression configuration. The site builder currently supplies its own boot shell and source viewer.

## Remaining application limitations

- All five save on one browser/device. There is no account, cross-device sync, multi-tab reconciliation, schema migration, undo, or shared editing. Failed writes produce a notice; malformed saved JSON falls back to defaults, without a recovery UI. Hand-edited valid-but-wrong JSON is not comprehensively validated.
- Folio has no book metadata lookup, cover images, editing existing titles, or export. Search is a simple case-insensitive substring match.
- Juniper is an order notebook, with a 20-per-item limit, static illustrative prices, and no checkout, order delivery, inventory, tax calculation, or real café integration. Clearing notes is immediate.
- Wayfarer supports three days, integer-dollar estimated costs, and visited state. There are no maps, actual dates, dragging/reordering, booking APIs, or editing an existing stop; remove and re-add is the current workflow.
- Signal uses a fixed eight-session fictional programme and UTC times. Conflicts warn but do not prevent export. Calendar export handles these fixed titles and dates; a general editor would need text escaping, line folding, timezone selection, and update/cancellation semantics.
- Scope uses USD, whole-dollar hourly rates, quarter-hour durations, and a single project. It excludes taxes, expenses, discounts, invoices, payment collection, and import. Deleting the item currently being edited cancels the edit but leaves the input text available for reuse. CSV is a small data-URI download, not a streaming export.
- Some secondary replacement actions can still lose keyboard focus (for example removing a saved session while viewing only saved sessions). Form errors rely mainly on native validation. No full screen-reader audit, automated contrast audit, or localization pass has been performed.
- Long lists have no pagination or virtualization. Rendering and persistence favor understandable small-site code over huge-data throughput. Layouts were checked at 1440px and 390px, not every viewport or zoom level.

## Ten more iterators worth adding

| Iterator | Useful behavior | Example use here |
| --- | --- | --- |
| `group_by` | Bucket items by a key; materializes groups | Sessions by time slot, stops by day |
| `distinct_by` | Keep the first item for each key | Derive unique menu categories |
| `partition` | Split once into matching/nonmatching outputs | Read/unread books, visited/unvisited stops |
| `scan` | Emit each intermediate accumulator | Running trip budget |
| `batched(n)` | Non-overlapping batches; define final partial batch | Paginated book shelves |
| `windows(n)` | Overlapping windows; define ownership of each window | Consecutive itinerary segments |
| `min_by` | Optional item with the smallest key | Cheapest dish or earliest session |
| `max_by` | Optional item with the largest key | Most expensive work item |
| `first_where` | Optional first item matching a predicate | Find the line currently being edited |
| `reduce` | Fold without an initial seed; optional result on empty input | Aggregate a nonempty set without inventing an identity |

These ten operators were subsequently implemented. See [iterator semantics](iterators.md) for syntax, optional results, allocation, and complexity, and [query indexes](queries.md) for bisect-related range and spatial facilities.
