# Over-the-wire size and `@es` glue

Small over-the-wire bundles depend on the generated JavaScript glue staying tree-shakeable. These rules are enforced by tests in `scripts/codegen-core-tests.mjs`.

## Rules

1. **Hoist named imports, never namespace imports.**
   An `@es` body may open with `import` declarations, which are hoisted to the top of the generated glue module and deduplicated:

   ```utu
   let valid: fun(Str) Bool = @es/\ import { valid } from 'semver'; (v) => valid(v) ? 1 : 0 \/
   ```

   Avoid `((m) => (v) => m.valid(v))(await import('pkg'))`. Holding the namespace object prevents bundlers from tree-shaking unused exports out of modular ESM packages and adds top-level `await` to the common path.

2. **Shake dead bindings against the emitted Wasm.**
   `liveGlueFields(wasm)` inspects the emitted binary's actual import list, and `glueModuleSource(spec, live)` emits only the bindings the binary imports. Always pass `{ wasm }` to `buildImportObject` so unused `.d.ts` bindings are never shipped or loaded.

3. **Keep the runtime shim split.**
   `promiseImports`, `awaitImports`, and `closureImports` are separate exports so bundlers drop unused runtime pieces. When `runtimeIsEmpty(closureSpec, promiseSpec)` is true, no `utu` runtime import is emitted at all. Inside `closureImports`, all `closure_call_*` arities alias a single shared function.

4. **Do not collapse bindings into a dynamic dispatcher.**
   Replacing per-binding wrappers with `obj[name](a, b)` requires holding the full namespace object (defeating rule 1) and adds dynamic property lookups on the hot path, while per-binding wrappers already gzip to ~8 B each.
