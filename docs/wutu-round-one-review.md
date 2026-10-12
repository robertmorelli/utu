# First five-site review

Atlas, Pantry, Meter, Ledger, and Studio exercise shared CSS, recursive DSL
composition, named update islands, durable model state, ephemeral numeric/text
drafts, and movement between keyed containers.

Friction found and addressed before the second batch:

- A parent update replaced an island's captured local draft. Stable island
  identities now retain the original factory and its local state until unmount.
- Unkeyed inner loops inherited an outer key and incorrectly reported duplicate
  keys. The compiler now supplies implicit per-loop positions for unkeyed loops.
- Adding collection-edit methods to core Array caused extra loops to appear in
  canonical compiler tests. Persistent edits moved to optional `std:List[T]`.
- Raw CSS style sheets work through `@css` and `@style`, but authors needed an
  editor projection. The CSS stencil command preserves authored CSS and source
  offsets while erasing Utu around it.
- Co-recursive Utu/Wutu expressions now expand repeatedly; the grammar uses
  balanced DSL envelopes. A failed application bootstrap is reported immediately
  to prerendering rather than waiting for a timeout.
- Cross-tab storage needed typed application of incoming data and a conflict
  boundary. Registered codecs now decode incoming envelopes into existing state;
  dirty local changes block conflicting writes until an explicit save or reload.
- Browser callbacks needed the same update/cleanup model as DOM events. The
  second batch uses scoped timers with automatic invalidation and cancellation.
- Navigation and reload erased drafts in preview. Preview now preserves state
  for controls, focus, scroll and the current hash; this is exercised
  alongside the second batch's route-based views.

The first-round browser suite covers filters, saving/reloading, stock restocking,
habit toggles, numeric purchases, island-local drafts, draft edits with no storage
writes, and cross-column node/focus retention. Subsequent test failures are fixed
rather than treated as acceptable rough edges.
