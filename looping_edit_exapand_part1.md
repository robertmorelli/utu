# Looping Expand Refactor Part 1

## Goal

Replace the current "expansion as many named pipeline slices" approach with a real fixed-point expansion subsystem that iterates over expansion state until no new work is discovered.

Part 1 is about building the real engine and separating discovery from emission.

It is not done when there is a new top-level wrapper that still just calls the old helpers in order.

## Target Outcome

After Part 1, expansion should work like this:

1. Create one expansion session/state object.
2. Repeatedly run explicit discovery/edit passes over that state.
3. Stop only when no pass reports new work.
4. Emit expanded source once.
5. Reparse expanded source once.

The outer compiler is allowed to keep its current broad shape during Part 1, but the expansion internals must become a genuine loop-driven subsystem.

## Problems To Solve

The current code has three structural issues:

1. Discovery and emission are coupled.
   `emitExpansionItem()` is currently used to discover namespaces and apply constructs, not just emit source.

2. The loop is partial and hidden.
   `ensureExpansionNamespaceDiscovery()` already loops, but only around one slice of work and it mixes iteration with emitter behavior.

3. Expansion facts are recomputed through multiple public pipeline files instead of being maintained in one coherent state object.

## Required Design

### 1. Add a dedicated fixed-point driver

Create a new module, likely `packages/compiler/expansion-fixed-point.js`, that owns:

- `runExpansionFixedPoint(state)`
- `runExpansionPass(state, passName)`
- convergence checks
- iteration limits
- failure diagnostics for non-convergence

This driver must own the loop. The loop must not live in `pipeline.js`.

### 2. Introduce explicit expansion passes

The driver should run explicit passes over state. The initial pass list should be close to:

- `load-root-imports`
- `collect-root-definitions`
- `discover-root-constructs`
- `discover-root-namespace-instantiations`
- `populate-pending-namespaces`
- `discover-nested-namespace-instantiations`
- `finalize-expansion-facts`

Each pass must return structured results:

```js
{
  changed: boolean,
  diagnostics: [],
  stats: {}
}
```

### 3. Expand session state into a real work graph

`packages/compiler/expansion-session.js` must hold real worklist state, not just booleans like `importsLoaded` and `namespacesPrimed`.

At minimum add fields like:

- `pendingImportKeys`
- `processedImportKeys`
- `pendingNamespaceKeys`
- `processedNamespaceKeys`
- `knownRootConstructs`
- `knownRootModuleRefs`
- `iteration`
- `maxIterations`
- `changedSinceLastIteration`

The session must make it possible to discover only new work and skip already-processed work.

### 4. Split discovery from emission

`packages/compiler/expansion-materialize-items.js` must stop being responsible for discovery side effects.

Create a separate discovery walker, for example:

- `discoverExpansionItem(expander, node, ctx, inModule)`
- `discoverExpansionItems(expander, items, ctx, inModule)`

Emission functions may assume discovery is already complete.

### 5. Make namespace creation incremental

`ensureNamespace()` in `packages/compiler/expansion-namespace-methods.js` currently allocates and fully populates namespace data in one go.

Break it into phases such as:

- `ensureNamespaceShell()`
- `populateNamespaceTypes()`
- `populateNamespaceDeclarations()`
- `populateNamespaceValues()`

The fixed-point loop should schedule namespace population explicitly, instead of relying on implicit side effects during name lookup.

### 6. Keep behavior stable

Part 1 is allowed to reorganize the engine, but it should preserve expansion output for existing examples and tests.

If behavior changes, the change must be intentional, documented, and covered by tests added in the same change.

## Explicit Anti-Goals

The following do **not** count as Part 1 completion:

1. Adding `runExpansionFixedPoint()` that just calls the old helpers in sequence:
   - `ensureExpansionImports()`
   - `ensureExpansionTopLevelDeclarations()`
   - `ensureExpansionNamespaceDiscovery()`

2. Keeping discovery dependent on `emitExpansionItem()` side effects.

3. Wrapping the current `ensureExpansionNamespaceDiscovery()` loop in a new function without changing the underlying ownership.

4. Adding a loop that still rescans and re-emits the entire root on every iteration without tracking new work.

5. Keeping namespace population as a single hidden side effect of `ensureNamespace()`.

## Concrete Work Items

1. Add `packages/compiler/expansion-fixed-point.js`.
2. Refactor `packages/compiler/expansion-session.js` to build and own worklist state.
3. Add discovery walkers separate from emit walkers.
4. Refactor namespace discovery/population into incremental functions.
5. Refactor top-level symbol collection so it can be driven by the fixed-point engine.
6. Make `prepareExpansionEmission()` depend on already-computed expansion state, not drive discovery itself.
7. Keep `materializeExpandedSource()` as a terminal step after convergence.

## Strict Done Criteria

Part 1 is only done when **all** of these are true.

### Architecture Criteria

- `runExpansionFixedPoint()` exists and owns the convergence loop.
- The convergence loop is not implemented in `pipeline.js`.
- Expansion discovery no longer depends on `emitExpansionItem()`.
- Namespace discovery no longer depends on "emit while discovering".
- The expansion session has explicit pending/processed work tracking for imports and namespaces.
- `prepareExpansionEmission()` no longer triggers discovery as a side effect.

### Anti-Wrapper Criteria

- `runExpansionFixedPoint()` does not simply call the old `ensureExpansion*` helpers in order.
- `ensureExpansionNamespaceDiscovery()` is either removed or reduced to a thin cached accessor around fixed-point results.
- `emitExpansionItem()` does not call `applyConstruct()` for discovery purposes.
- `ensureNamespace()` does not fully populate namespace data in one hidden step.

### Verification Criteria

- Importing `packages/compiler/expansion-fixed-point.js` succeeds.
- Importing `packages/compiler/pipeline.js` succeeds.
- Existing expansion fixtures still pass.
- New tests cover:
  - nested file-import discovery
  - namespace discovery reaching a fixed point
  - repeated iteration terminating
  - non-convergence reporting a diagnostic

### Repo Search Criteria

The following searches must support the architectural claims:

```sh
rg -n 'emitExpansionItem\\(' packages/compiler
rg -n 'ensureExpansionNamespaceDiscovery|ensureExpansionTopLevelDeclarations|ensureExpansionImports' packages/compiler
rg -n 'applyConstruct\\(' packages/compiler
```

The results are acceptable only if:

- discovery code no longer goes through emitter code
- old `ensureExpansion*` helpers are either deleted or clearly downgraded to cache accessors
- construct application during discovery lives in discovery-specific code

## Suggested Review Questions

Before calling Part 1 done, answer these plainly:

1. Where does the fixed-point loop live?
2. What exact data structure tracks pending namespace work?
3. What code path discovers namespaces without emitting source text?
4. What code path emits source text after discovery is complete?
5. What stops the loop from becoming "full rescan until lucky"?

If those answers are fuzzy, Part 1 is not done.

## Handoff To Part 2

Part 2 starts only after Part 1 has a real internal engine.

Part 2 will then collapse the outer expansion pipeline shape around that engine, delete redundant analysis slices, and replace the many cleanup rewrites with one canonicalization step.
