# Removed Helmets

## Generated Value Import Undefined Guard

Removed the generated JS shim guard that threw `Missing host import "..."` when a value import resolved to `undefined`.

Why it was removed:

- It inserted runtime policy the programmer did not ask for.
- It rewrote the host/runtime failure mode into a compiler-authored error path.
- It betrayed the expectation that codegen should stay a thin wrapper around Wasm and JS rather than adding protective behavior.

Current behavior:

- Generated value imports now pass through directly.
- If a host provides `undefined` or an otherwise invalid import, the natural JS/Wasm failure mode is preserved instead of being replaced by shim-authored validation.

## Generated Global Fallback For Explicit Host Imports

Removed the generated JS shim fallback that resolved explicit non-`node:` imports from ambient globals like `window`, `self`, or `global` when the host import object did not provide them.

Why it was removed:

- It inserted implicit ambient behavior the programmer did not ask for.
- It made `escape "es"` mean "look around in random globals" instead of "use the imports the host explicitly provided."
- It betrayed the expectation that codegen should preserve explicit host wiring rather than auto-magic fallback rules.

Current behavior:

- Explicit host imports now resolve only from `__hostImports`.
- Only `node:` auto-resolve still synthesizes a fallback, because that shape intentionally means "import this Node module."

## Parenthesized Inline JS Value Escapes

Removed the generated JS shim wrapper that parenthesized inline JS value escapes before inserting them into the import object.

Why it was removed:

- It changed the exact JS source the programmer wrote.
- It was another compiler-authored policy layer instead of direct code emission.
- It betrayed the expectation that inline JS escapes should land in the shim literally as authored.

Current behavior:

- Inline JS function escapes and inline JS value escapes now both emit the raw JS source text directly.

## Named Host Imports Removed Entirely

Removed the non-inline host import path entirely. The only remaining host import form is inline JS: `escape |...| ...`.

Why it was removed:

- It created extra compiler/runtime machinery for host wiring the programmer did not ask for.
- It kept reintroducing policy and convenience behavior around host imports instead of staying literal.
- It betrayed the expectation that escape-based codegen should only emit the JS the programmer explicitly wrote, aside from the minimum Wasm import-object plumbing.

Current behavior:

- `escape foo(...) ...` no longer parses.
- `escape "module" foo(...) ...` no longer parses.
- Only `escape |<js code>| ...` remains for JS-backed imports.
