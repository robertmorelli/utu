# Looping Expand Refactor Part 2

## Goal

Collapse the old expansion pipeline around the new fixed-point engine from Part 1.

Part 2 is about deleting redundant pipeline structure, not layering a cleaner name over the same old sequence.

## Target Outcome

After Part 2, expansion should appear to the compiler as one coherent operation:

1. `syntax`
2. `expand`
3. `canonicalize-expanded-tree`
4. `semantics`
5. `backend`
6. `output`

The compiler should no longer expose a parade of expansion-preparation, expansion-discovery, expansion-materialization, and expansion-cleanup steps as separate public pipeline slices.

## What Must Change

### 1. Replace many expansion pipeline slices with one expansion stage

`packages/compiler/pipeline.js` should stop treating expansion as many public internal steps.

The expansion area should collapse to something close to:

- `expand`
- `parse-expanded-source`
- `canonicalize-expanded-tree`

If some analysis snapshotting is still needed for tooling, it should be derived from expansion state, not represented as fake independent pipeline stages.

### 2. Remove redundant expansion analysis files

These files currently behave like state snapshots broken into pseudo-stages:

- `packages/compiler/analyze-load-expansion-imports.js`
- `packages/compiler/analyze-collect-top-level-expansion-facts.js`
- `packages/compiler/analyze-build-expansion-namespaces.js`
- `packages/compiler/analyze-collect-expansion-symbol-facts.js`
- `packages/compiler/analyze-prepare-expansion.js`

They should be deleted, inlined into the fixed-point subsystem, or replaced by one snapshot/export function.

Acceptable replacement shape:

- `snapshotExpansionState(state)`
- `snapshotExpansionForTooling(state)`

Not acceptable:

- keeping all old files and having them call the new engine internally

### 3. Collapse post-expansion cleanup passes into one canonicalization pass

These currently represent many tiny tree walks:

- `edit-post-expand-normalize.js`
- `edit-prune-construct-declarations.js`
- `edit-prune-file-imports.js`
- `edit-prune-module-declarations.js`
- `edit-normalize-expansion-residuals.js`
- `edit-finalize-expansion-tree.js`

Replace them with a single canonicalization pass that:

- strips comments
- removes module/file-import/construct declarations from expanded output
- normalizes leftover module/namespace call forms
- guarantees semantic-stage tree shape

One walk is preferred. Two is acceptable only with a written reason.

### 4. Remove no-op rewrite stages from the main path

These files currently do not justify their own rewrite step:

- `edit-type-value-resolution.js`
- `edit-call-and-pipe-rewriting.js`
- `edit-core-and-control-rewriting.js`

They must be either:

- deleted, or
- moved out of the main pipeline until they contain real logic

Leaving them as named no-op pipeline steps does not count as completion.

### 5. Keep emission separate and terminal

`materializeExpandedSource()` should remain a terminal action after the fixed-point engine converges.

Emission must not be reused as discovery.

The post-emission reparse should happen once, not as part of an iterative pseudo-pipeline.

## Explicit Anti-Goals

The following do **not** count as Part 2 completion:

1. Renaming many expansion stages to nicer names while keeping the same count and flow.
2. Keeping old analysis files but turning each into a wrapper around one shared expansion state.
3. Keeping six cleanup rewrites that each call one shared helper.
4. Leaving no-op rewrite stages in the main compiler path because they are "reserved for later".
5. Keeping the compiler pipeline API stable by secretly mapping old stage names to new ones.

## Concrete Work Items

1. Add one compiler-visible `expand` step.
2. Route that step through the fixed-point engine from Part 1.
3. Materialize expanded source exactly once after convergence.
4. Reparse exactly once after materialization.
5. Replace the many cleanup rewrites with one canonicalization pass.
6. Remove old expansion analysis wrappers and their pipeline entries.
7. Remove no-op rewrite entries from the main path.
8. Update any tooling snapshots to read from expansion state or one consolidated expansion artifact.

## Required Output Shape

The pipeline should read conceptually like this:

```js
[
  "load-source",
  "parse-source",
  "collect-syntax-diagnostics",
  "normalize-syntax",
  "build-stage-tree",
  "analyze-source-layout",
  "collect-header-snapshot",
  "expand",
  "parse-expanded-source",
  "canonicalize-expanded-tree",
  "index-top-level-symbols",
  "bind-top-level-symbols",
  "check-semantics",
  "plan-compile",
  "collect-lowering-metadata",
  "collect-binaryen-metadata",
  "prepare-backend-metadata-defaults",
  "lower-to-backend-ir",
  "build-binaryen-module",
  "validate-output-plan",
  "build-backend-artifacts",
  "analyze-js-emission-inputs",
  "emit-output",
]
```

The exact names can differ slightly, but the shape should be this simple.

## Strict Done Criteria

Part 2 is only done when **all** of these are true.

### Pipeline Criteria

- `packages/compiler/pipeline.js` does not expose multiple separate expansion preparation/discovery/materialization/cleanup slices.
- The compiler has one primary expansion step.
- There is one canonicalization step after reparsing expanded source.
- The main pipeline does not include no-op rewrite stages.

### Anti-Wrapper Criteria

- Deleted expansion analysis files are actually deleted or no longer imported by the compiler pipeline.
- Cleanup passes are actually collapsed, not just hidden behind one new wrapper file.
- The main compiler pipeline does not preserve old expansion step count under new names.

### Search-Based Criteria

These searches should reflect the collapse:

```sh
rg -n 'load-expansion-imports|collect-top-level-expansion-facts|build-expansion-namespaces|collect-expansion-symbol-facts|prepare-expansion-emission' packages/compiler
rg -n 'normalize-post-expansion|prune-construct-declarations|prune-file-imports|prune-module-declarations|normalize-expansion-residuals|finalize-expansion-tree' packages/compiler
rg -n 'runRewriteTypeValues|runRewriteCallsAndPipes|runRewriteCoreControl' packages/compiler
```

The results are acceptable only if:

- they do not appear in the active compiler pipeline
- old expansion analysis files are gone or dead
- cleanup passes are gone or dead
- no-op rewrites are gone or dead

### Behavioral Criteria

- Expansion output for current fixtures is unchanged unless intentional changes are documented.
- Semantic analysis still receives a stable, canonicalized tree.
- Backend compilation still passes on current compile fixtures.
- Tooling that needs expansion facts can still read them from one stable artifact or snapshot API.

### Review Criteria

A reviewer should be able to answer these questions clearly:

1. Where does expansion happen?
2. Where is convergence handled?
3. Where is source emitted?
4. Where is the emitted source reparsed?
5. Where is post-expansion cleanup performed?

If the answers require naming five old "expansion sub-stages", Part 2 is not done.

## Final Definition Of Done

The overall refactor is done only when both parts are true:

1. Expansion internals are a genuine fixed-point engine over explicit state.
2. The compiler externally treats expansion as one operation plus one post-expansion canonicalization step.

Anything less is just a nicer wrapper around the old staged expansion logic.
