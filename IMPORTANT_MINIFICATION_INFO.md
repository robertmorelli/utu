# Over-the-wire size: what is settled, and what the binder must not undo

utu's headline claim is small over-the-wire bytes. The `@es` glue layer is the
one place where that claim can quietly die, because a `.d.ts` ingester emits
bindings *en masse* and every mistake is multiplied by the size of the
declaration file.

Everything below was measured on this machine (Bun 1.3.14, arm64 macOS), by
bundling with `Bun.build({ minify: true })` and gzipping the result. Reproduce
with the scripts referenced in each section.

---

## Part 1 — Implemented and locked in by tests

### 1.1 Named imports, not namespace imports (116x)

An `@es` body may open with `import` declarations. They are hoisted to the top
of the generated glue module and deduplicated:

```utu
let valid: fun(Str) Bool = @es/\ import { valid } from 'semver'; (v) => valid(v) ? 1 : 0 \/;
```

This is the **preferred spelling** and the binder must emit it.

The alternative — `((m) => (v) => m.valid(v))(await import('semver'))` — obtains
the whole module namespace, which prevents the bundler from shaking unused
members out of the package. Against a synthetic 200-export ESM package with one
export used:

| form | bundled | gzip |
|---|---:|---:|
| `(await import('pkg')).member` | 7,977 B | 1,878 B |
| `import { member } from 'pkg'` | **69 B** | **79 B** |

`semver` shows no difference because `semver` does not tree-shake at all. The
gap only appears for genuinely modular ESM packages — `lodash-es`, `date-fns`,
`rxjs`, `three` — which are exactly the packages where this matters most. Do not
conclude from one flat measurement that the namespace form is safe.

Side benefit: the named form removes the `((m) => …)(await import(…))` wrapper
that otherwise appears in most bindings, and takes top-level `await` off the
common path.

Pinned by `codegen: @es hoists leading import declarations out of the body`.

### 1.2 Dead bindings are dropped from the glue (10x)

Codegen already shakes unused `@es` bindings out of the **wasm** — 100 declared
with 1 used emits a binary byte-identical to declaring 1. The stamped
`data-dsl-imports-js` spec still listed all 100, so the glue module carried dead
bodies *and loaded their packages at runtime*.

`liveGlueFields(wasm)` reads the emitted binary's actual import list, and
`glueModuleSource(spec, live)` emits only those. 100 declared / 1 used, where
the 99 dead ones pull in `js-yaml`:

| | glue source | bundled | gzip |
|---|---:|---:|---:|
| unshaken | 6,728 B | 53,322 B | 17,486 B |
| shaken | **85 B** | **4,549 B** | **1,723 B** |

Wired into `buildImportObject(doc, { wasm })` and into `utu build-exe`. Note
`buildImportObject` only shakes when you **pass the `wasm` option** — without it
the old behaviour is preserved for callers that have no binary in hand.

Pinned by `codegen: unused @es bindings are dropped from the glue module`.

### 1.3 The runtime shim is now tree-shakeable (7x)

`utuRuntimeImports` was one function containing promise, JSPI, and closure code
behind runtime `if`s. Bundlers cannot shake across a runtime branch, so every
program shipped all three whether or not it used any.

It is now split into `promiseImports`, `awaitImports`, and `closureImports`,
with `utuRuntimeImports` kept as a facade for callers that are not shipping the
result. `runtimeIsEmpty(closureSpec, promiseSpec)` reports when a program needs
no `utu` namespace at all, and `utu build-exe` then emits no runtime import
whatsoever.

DeltaBlue uses none of the three (`closureRuntime: {"new":false,"calls":[]}`,
`promiseRuntime: {"ops":[],"awaits":[],"asyncExports":[]}`):

| loader | minified | gzip |
|---|---:|---:|
| monolithic shim | 994 B | 581 B |
| split + omitted | **137 B** | **134 B** |

Also in `closureImports`: every `closure_call_*` arity now aliases **one** shared
function object instead of allocating a new closure per arity. An extra arity now
costs one property assignment.

---

## Part 2 — DeltaBlue: honest result

The shim work took DeltaBlue from 1.24x to 1.03x of the equivalent minified JS.
**It does not win.** It is a dead heat, 56 B short.

| | gzip |
|---|---:|
| JS, minified | 2,096 B |
| utu wasm alone | 2,021 B |
| utu + loader (before) | 2,602 B — 1.24x |
| utu + loader (after) | **2,152 B — 1.03x** |

The wasm *by itself* is smaller than the minified JS. The remaining gap is the
irreducible instantiation boilerplate — `compileStreaming` + `instantiate` is
136 raw bytes and there is nothing left to cut. Concatenating loader and wasm
into a single gzip stream makes it slightly worse (2,167 B), not better.

The general shape: **utu is at parity-per-unit-of-logic with minified JS
(0.96x), plus a ~130 B fixed entry fee.** Below roughly 5 KB gzipped of logic,
JS wins on size; above it, utu pulls ahead. DeltaBlue sits right at the
crossover, and it is a deliberately unfavourable case — pure compute, small, no
interop, which is precisely where wasm has the least to offer.

Quote size numbers at a realistic program size. The claim is strong for real
programs and weakest for hello-world.

---

## Part 3 — On monomorphizing the externref glue

The idea: `externref(externref, externref)` is the same glue no matter which
three externrefs, so all two-argument bindings could share one implementation.

**Where this is already true and now exploited.** The `closure_call_*` family is
exactly this case — every arity is "invoke a JS callable", differing only in wasm
signature because wasm imports are monomorphic. They now all alias one shared
function (§1.3).

**Where it does not pay, and actively hurts.** Collapsing N *bindings* into one
dispatcher requires something like:

```js
export const call2 = (obj, name, a, b) => obj[name](a, b);
```

This looks like a big win — N bindings become one function plus N string
constants, and strings gzip well. It is a trap, for two reasons:

1. **It requires the namespace object.** `obj[name]` means you must hold the
   whole module, which is precisely the namespace-import form that costs 116x in
   §1.1. You would trade a measured 116x loss for a win worth ~8 B/binding.
2. **The win is already tiny.** Marginal cost of a generated binding in one
   bundled glue module:

   | bindings | gzip | marginal gzip/binding |
   |---:|---:|---:|
   | 1 | 229 B | — |
   | 10 | 311 B | 9.1 B |
   | 200 | 1,808 B | 7.7 B |
   | 1,000 | 7,795 B | **7.5 B** |

   Generated wrappers are near-identical text, which is gzip's best case. A
   thousand bindings costs 7.8 KB. There is almost nothing left to recover.

3. It adds a dynamic property lookup on every call, on the hot interop path.

**Conclusion: do not monomorphize the glue.** The per-binding cost is already
~8 B gzipped and the mechanism that would reduce it destroys a 116x larger win.
Monomorphization belongs on the *shim* side, where it is already applied.

---

## Part 4 — Rules for the binder

1. **Always emit `import { member } from 'pkg';` form.** Never
   `(await import('pkg')).member` in generated output. This is the single most
   important rule in this document (§1.1).
2. **Always pass the emitted `wasm` to `buildImportObject`**, or shake with
   `liveGlueFields` before writing glue. An ingested `.d.ts` declares thousands
   of bindings; without this, one used function drags the whole declared surface
   into every bundle (§1.2).
3. **Do not collapse bindings into a shared dispatcher** (§3).
4. **Generate loaders that import only the runtime pieces the program uses** —
   `closureImports` / `promiseImports` / `awaitImports`, never
   `utuRuntimeImports`, and nothing at all when `runtimeIsEmpty` (§1.3).
5. **One binding per overload, per option-combination, and per variadic arity.**
   These cannot be derived mechanically and need a naming policy decided before
   generation starts.
6. **Re-measure §1.1 against a real tree-shakeable ESM package** before shipping
   the binder. The synthetic probe proves the mechanism; a real package proves
   the integration.

## Reproducing

The numbers above came from throwaway scripts against
`hand_written_bindings/` (gitignored) and `benchmarks/deltablue/`. The durable
checks are the two tests in `scripts/codegen-core-tests.mjs` named in §1.1 and
§1.2; the size figures are point-in-time and should be re-measured, not trusted,
when the binder lands.
