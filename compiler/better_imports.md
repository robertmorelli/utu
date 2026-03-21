# Better Imports Notes

## Goal

Support imports like:

```utu
import extern "es" console_log(str)
import extern "node:fs" readFileSync(str) str
```

without hardcoding all host behavior into `jsgen`, and without duplicating import analysis across the compiler.

## Current State

- The parser accepts arbitrary string module specifiers.
- `watgen` preserves the declared module string and emits it into Wasm imports.
- Shared host import analysis now lives in `compiler/host_analysis.js`.
- `compiler/index.js` returns `metadata.host` and passes shared host analysis to
  `jsgen`.
- `jsgen` emits module-shaped import objects, auto-resolves `node:*` imports,
  and keeps flat `es` compatibility as temporary sugar.
- The CLI and example runner normalize nested import objects instead of
  expecting a flat import bag.

The first pass of the import refactor has already landed. The rest of this
document is best read as follow-on cleanup and future design notes.

## Design Principle

Do one host-import analysis pass and share it everywhere.

That shared result should drive:

- Wasm import emission
- generated JS wrapper shape
- compiler metadata
- CLI auto-resolution and diagnostics

The generated JS should only include the tiny amount of runtime logic needed for the imports that the current program actually uses.

## Shared Analysis

The compiler now has a shared analyzer in `compiler/host_analysis.js`.
Conceptually it exposes:

```js
export function analyzeHostRequirements(rootNode) {
  return {
    importFns: [
      { module: "es", name: "console_log", kind: "function" },
      { module: "node:fs", name: "readFileSync", kind: "function" },
    ],
    importVals: [
      { module: "es", name: "document", kind: "value" },
    ],
    metadata: {
      imports: [...],
      modules: ["es", "node:fs"],
      capabilities: ["node-builtins"],
      platformHints: ["node", "bun"],
      assumptions: {
        needsNothing: false,
        needsNodeBuiltins: true,
        needsEsHost: true,
      },
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

The shared compiler already computes host analysis once and passes it through
to generated JavaScript. A next pass could also make `watgen` consume that
same shared analysis directly:

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

Most of this section has landed: `jsgen` already consumes shared host
analysis, emits module-shaped imports, and auto-resolves `node:*` modules.
What remains is cleanup and sharper diagnostics.

### Generated API

The generated `instantiate` API now accepts a real Wasm import object shape:

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

Flat `es` input still works as compatibility sugar, but it is no longer the
core model.

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

The CLI already matches the real Wasm import model while still normalizing flat
`es` compatibility input.

It now provides:

```js
{
  es: {
    console_log,
    math_sqrt,
    ...
  }
}
```

Generated JavaScript handles `node:*` auto-resolution when required by
metadata:

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

The test helpers and fixtures now use the nested import object shape:

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

## Remaining Cleanup

The remaining follow-on work is roughly:

1. Make `watgen` consume shared host analysis directly instead of reparsing
   imports for itself.
2. Tighten diagnostics for missing module bindings.
3. Keep auto-resolution limited to `node:*` unless the project adopts a
   broader module-resolution policy.
4. Remove flat `es` compatibility once all callers are comfortably on the
   nested import shape.

## Interaction With `T # E`

This import refactor should stay mostly independent from the `T # E` work.

The only link is that host metadata can help produce better runtime errors:

- "this program needs Node-compatible host imports"
- "this import is assumed to be wrapped by host-side try/catch sugar"

But the null-wrapping exception behavior should not be part of the core host analysis model.

## Files Likely To Change Next

- `compiler/index.js`
- `compiler/jsgen.js`
- `compiler/watgen.js`
- `compiler/host_analysis.js`
- `cli_artifact/src/cli.mjs`
- `scripts/test-examples.mjs`
- any docs that still imply host imports are `"es"`-only
