# Compiler simplification

The target is 6,500 logical lines without compressed syntax. Semantic facts
must survive compilation and remain queryable by analysis clients.

Baseline before declaration elaboration: **7,498 code lines**. The compiler is
currently **7,365 logical lines**, including retained elaboration, diagnostic,
and source-range graphs.

## Structural refactor pass

This pass replaces whole traversals and duplicated intermediate models. It does
not count tables, formatting changes, or compact syntax as architectural work.

- [x] Build one kind-index while constructing the type graph; inference,
      operation checking, literal policy, and downstream graph builders consume
      it instead of independently querying the DOM.
- [x] Build actual and expected type facts in one node-fact traversal instead of
      separate actual, declaration-expectation, and semantic-expectation walks.
- [x] Derive the call/effect graph from the settled type graph's node index.
- [x] Make the elaboration graph own module requests, including requests created
      inside cloned instantiations; module lowering consumes those retained facts.
- [ ] Materialize imported and instantiated modules directly into flat final
      declarations, replacing the clone-then-hoist intermediate model.
- [x] Make diagnostic/blame facts canonical and retained before projecting the
      compatibility `data-error-*` attributes.
- [x] Retain the source/semantic range index built for snapshots so later
      analysis clients reuse the same entries and interval index.

## Declaration elaboration

- [x] Build one retained graph for modules, declarations, instantiation requests,
      products, substitutions, resolutions, and failures.
- [x] Use it for module lookup and variance traversal.
- [x] Record import, alias, inline-instantiation, substitution, and hoisting blame.
- [x] Keep unresolved requests as graph failures instead of discarding context.
- [x] Feed the final declaration and layout graphs from elaborated declarations.
- [x] Preserve stable source/rewrite IDs while materializing IR once.

## Existing graph consolidation

- [x] Make scope captures graph-only; do not duplicate them as synthetic IR.
- [x] Use declaration reachability for recursive-type validation.
- [x] Use layout nodes for heap-type construction.
- [x] Use call/effect sites for runtime import and async-export discovery.
- [x] Remove redundant semantic DOM projections where all consumers have graph
      access; retain compatibility projections still consumed by public APIs.

## Pass simplification

- [x] Deduplicate explicit and inline module instantiation.
- [x] Consolidate module materialization and provenance around elaboration facts;
      keep hoisting explicit because it is a distinct destructive phase.
- [x] Consolidate type-reference linking and resolution blame.
- [x] Keep parsing, structured codegen, and CFG concerns separate.
- [x] Do not introduce generic graph frameworks or hide phase ordering.

## Verification

- [x] Add regressions for retained elaboration and capture blame.
- [x] Run both debug modes, production build, and diff checks.
- [x] Measure logical LOC with `cloc`; reductions must remove concepts rather
      than comments, whitespace, diagnostics, or assertions.
