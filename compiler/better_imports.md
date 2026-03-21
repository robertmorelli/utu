# Better Imports Sketch

## Goal

Support imports like:

```utu
import extern "es" console_log(str)
import extern "node:fs" readFileSync(str) str
```

without hardcoding all host behavior into `jsgen`, and without duplicating import analysis across the compiler.

## Current Problem

- The parser already accepts any string module specifier.
- `watgen` already preserves the module string and emits it into Wasm imports.
- `jsgen` rescans the tree separately and only recognizes `"es"`.
- The CLI and example runner expect a flat import bag instead of a real Wasm import object.

This means the language surface is already generic, but the generated JS and host runners are still specialized to one namespace.

## Design Principle

Do one host-import analysis pass and share it everywhere.

That shared result should drive:

- Wasm import emission
- generated JS wrapper shape
- compiler metadata
- CLI auto-resolution and diagnostics

The generated JS should only include the tiny amount of runtime logic needed for the imports that the current program actually uses.

## Proposed Shared Analysis

Add a small shared analyzer, for example:

- `compiler/host_analysis.js`

Export something like:

```js
export function analyzeHostRequirements(rootNode) {
  return {
    imports: [
      { module: "es", name: "console_log", kind: "function", params: [...], returnType: null },
      { module: "node:fs", name: "readFileSync", kind: "function", params: [...], returnType: {...} },
      { module: "es", name: "document", kind: "value", type: {...} },
    ],
    modules: ["es", "node:fs"],
    capabilities: ["node-builtins"],
    platformHints: ["node", "bun"],
    assumptions: {
      needsNothing: false,
      needsNodeBuiltins: true,
      needsEsHost: true,
    },
  };
}
```

## Suggested Rules

Derive the shared host info from declared imports:

- `"es"`:
  - means "host must provide this namespace manually"
  - does not imply Node or Bun
- `"node:*"`:
  - adds capability `node-builtins`
  - adds platform hints `node` and `bun`
- any other specifier:
  - treat as a generic external module specifier
  - no automatic platform claim unless there is a clear rule

The raw import list should always be preserved even if higher-level hints are derived.

## Metadata Shape

Extend compiler metadata with a `host` section:

```js
metadata.host = {
  imports: [...],
  modules: [...],
  capabilities: [...],
  platformHints: [...],
  assumptions: {...},
};
```

This is better than only returning `["node"]` or `["bun"]`, because:

- tooling can show exact missing modules
- the CLI can decide what it can auto-resolve
- the compiler stays descriptive instead of pretending to fully know the runtime

## Compiler Flow

Refactor `compiler/index.js` so host analysis happens once and is passed through:

```js
const tree = parser.parse(source);
const host = analyzeHostRequirements(tree.rootNode);
const { wat, metadata } = watgen(tree, { mode, host });
const js = jsgen(tree, wasm, { mode, host });

return {
  js,
  wasm,
  metadata: {
    ...metadata,
    host,
  },
};
```

## `watgen` Changes

`watgen` should stop owning host-import discovery logic beyond lowering.

Suggested change:

- keep `parseImportDecl`
- accept `host` in the constructor or `generate()` options
- use `host.imports` as the source of truth for import declarations
- keep test and bench metadata where it already lives

This will remove drift between `watgen` and `jsgen`.

## `jsgen` Changes

`jsgen` should consume `host`, not rescan the tree.

### Generated API

Change generated `instantiate` to accept a real Wasm import object shape:

```js
await instantiate({
  es: {
    console_log,
  },
  "node:fs": {
    readFileSync,
  },
})
```

For convenience, `jsgen` can still accept the old flat `es` shape temporarily if desired, but that should be compatibility sugar, not the core model.

### Avoiding Code Bloat

Only emit helper code when needed:

- if the program only imports from `"es"`, emit no module auto-resolution logic
- if the program imports any `"node:*"` module, emit a tiny resolver path for those modules only
- if the program has no imports, emit nothing extra

### Possible Generated Logic

For Node/Bun-friendly output:

```js
const importObject = {
  "__strings": ...,
  "wasm:js-string": {},
  ...userImports,
};

if (needsNodeBuiltins) {
  for (const specifier of nodeBuiltinModules) {
    if (importObject[specifier] == null) {
      importObject[specifier] = await import(specifier);
    }
  }
}
```

That keeps the runtime code small and data-driven.

## CLI Changes

Update the CLI to match the real Wasm import model.

### Current State

Today the CLI provides:

```js
{
  console_log,
  math_sqrt,
  ...
}
```

### Proposed State

Provide:

```js
{
  es: {
    console_log,
    math_sqrt,
    ...
  }
}
```

Then add auto-resolution for `node:*` when required by metadata:

```js
for (const specifier of metadata.host.modules) {
  if (specifier.startsWith("node:") && importObject[specifier] == null) {
    importObject[specifier] = await import(specifier);
  }
}
```

If a required module is still missing, throw a targeted error that names:

- the missing module
- the missing import name
- the platform hint, if any

## Example Runner And Tests

Update test helpers and fixtures to use the nested import object:

```js
{
  es: {
    console_log(value) { ... },
    wrap(value) { ... },
  }
}
```

Add tests for:

- `import extern "es" ...` still works
- `import extern "node:fs" ...` compiles
- generated JS auto-loads `node:*` in Node/Bun
- browser-like environments fail with a clear diagnostic for `node:*`
- metadata reports `platformHints: ["node", "bun"]` when `node:*` is used

## Compatibility Plan

To keep the change easy to land:

1. Add shared host analysis.
2. Make `watgen` and `jsgen` consume it.
3. Keep temporary flat-`es` compatibility in generated JS if helpful.
4. Migrate CLI and tests to nested import objects.
5. Remove flat compatibility once all call sites are updated.

## Interaction With `T # E`

This import refactor should stay mostly independent from the `T # E` work.

The only link is that host metadata can help produce better runtime errors:

- "this program needs Node-compatible host imports"
- "this import is assumed to be wrapped by host-side try/catch sugar"

But the null-wrapping exception behavior should not be part of the core host analysis model.

## Files Likely To Change

- `compiler/index.js`
- `compiler/jsgen.js`
- `compiler/watgen.js`
- `compiler/host_analysis.js` or similar new file
- `cli_artifact/src/cli.mjs`
- `scripts/test-examples.mjs`
- docs that currently describe imports as `"es"`-only

## Recommended Minimal First Pass

If we want the smallest safe landing:

1. Add shared host analysis with `imports`, `modules`, `capabilities`, and `platformHints`.
2. Switch `jsgen` to emit nested import objects.
3. Auto-resolve only `"node:*"` modules in Node/Bun contexts.
4. Return `metadata.host` from the compiler.

That gets us:

- generic module-aware imports
- no npm requirement for Node builtins
- small generated code
- a single source of truth for host assumptions

without committing yet to a broader module-resolution story for arbitrary ESM specifiers.
