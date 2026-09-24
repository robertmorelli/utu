# Experimental TypeScript declaration ABI

Branch: `codex/typescript-browser-bindings`.

UTU can call JavaScript APIs through generated bindings from TypeScript declaration
files. The generator uses the actual TypeScript parser, module resolver and type
checker, including declaration merging, inherited members, overloads, reexports
and generic constraints. It does not parse declarations with regular expressions.

The ABI is ordinary JavaScript values and calls: objects stay `Externref`, strings
stay host strings, and closures are real JavaScript functions. UTU `fun` pointers
remain internal to UTU; generated `fun` bindings describe imported calls, not
callbacks to pass into JavaScript. No second object heap, object copying, package
namespace dispatcher, or declaration interpreter runs in the application.

## Generate and use bindings

From the repository root, after `bun install`:

```sh
node tools/dts/cli.mjs --input node_modules/nanoid/index.d.ts \
  --module nanoid --prefix Nano --out std/nanoid
node scripts/build.mjs
```

```utu
using Nano from std:Nano;
export main() Str { Nano.call_nanoid_arity1(12.0); }
```

`--module` is the JavaScript import specifier, not the declaration filename. The
implementation package must be installed/resolvable when running or bundling the
app. Prefer package specifiers. Local implementations can use absolute paths at
generation time (the browser bundler removes those paths); relative specifiers
resolve from the emitted glue module, not from the declaration file. For ambient declarations select their declared module, such as `node:path`.
Wildcard ambient asset modules also match the supplied runtime specifier.
CommonJS callable `export =` becomes a default import; use `.d.cts` for CommonJS
declarations inside an ESM package. Global declaration files omit `--module`.
The programmatic wrapper accepts multiple input files and `compilerOptions` for
projects with custom module resolution. Declaration diagnostics fail generation.

For the complete pinned DOM and ES2022 libraries:

```sh
bun run bindings:browser
bun run build
bun run demo:serve
```

The generated standard library includes DOM, DOM iterable/async iterable, and
ES2022 APIs. This is the browser declaration surface shipped with TypeScript
5.9.3, not a claim that every browser implements every declared API. Worker-only
libraries can be generated separately; conflicting host libraries should use
separate Programs/prefixes.

## Names and representation

| Declaration | Generated UTU surface |
| --- | --- |
| Export/global function `f` | `Prefix.call_f(...)`, `Prefix.get_f()` |
| Interface or class `T` | `PrefixT.call_method(self, ...)`, getters/setters |
| Class constructor | `PrefixT.new_instance(...)` |
| Export/global object `value` | `Prefix.get_value()`, `PrefixGlobal_value` members |
| Overload after the first | `_overload2`, `_overload3`, etc. |
| Optional arguments | Shortest required arity unsuffixed; `_arityN` for additional arguments |
| Rest parameter | A host JS array, spread by the generated call |
| Any callable/constructor | `_js` variant takes a host argument array and returns `Externref` |
| Index signature | `get_index` / `set_index` |
| Well-known symbol method | `call_symbol_iterator`, etc. |

Names are deterministic; a manifest records allocated module names, binding
counts and erased types. Collisions, including case-insensitive filenames, get
suffixes. Do not infer names for colliding identifiers: consult the generated
module/manifest. Overloads without type parameters precede generic overloads.
Readonly and private/protected members do not gain public setters. Const enum
values are emitted as literals without importing a nonexistent runtime export.

| TypeScript type | UTU ABI type |
| --- | --- |
| `number`, numeric literals/brands | `F64` (including NaN and infinity) |
| `string`, string literals/brands | `Str` |
| `boolean` | `Bool`, with explicit host boolean conversion |
| `void` | `void` |
| Fixed callback with compatible signature | `cl(...) ...` |
| Object, array, promise, bigint, symbol | `Externref`: the exact host value |
| Nullable/mixed union, unresolved generic, complex callback | `Externref` |

Homogeneous primitive unions collapse to the corresponding primitive type.
Optional parameters have omission variants; the `_js` path additionally supports
explicit `undefined` and any legal argument shape. Arrays are JavaScript arrays,
not UTU WasmGC arrays. Returned promises remain real host promises. Exceptions
propagate normally.

This provides broad **runtime access**, not the complete TypeScript static type
system inside UTU. Conditional/mapped types, overload constraints, literal
restrictions, correlated generics and object shapes may lose static precision.
TypeScript `any`, dynamic properties and APIs requiring exact values remain
accessible through `std:JS`. Declarations supply neither implementations nor
host capabilities. This experiment does not transpile arbitrary `.ts` application
code, implement JavaScript class inheritance in UTU, or prove every possible
third-party declaration correct.

## Universal JS values and callbacks

`JS.object`, `JS.array`, `JS.get`, `JS.set`, `JS.get_key`, `JS.call` and
`JS.construct` expose host operations without writing custom JS. `JS.string`,
`JS.number`, `JS.boolean`, `JS.bigint`, `JS.symbol`, `JS.undefined_value` and
`JS.null_value` produce exact host values. The `as_*` accessors check types.
Unique symbol members use the exported symbol getter plus `JS.get_key`.

For callbacks with `this`, rest/optional parameters, or exact boolean results:

```utu
let callback: Externref = JS.function_value(cl(receiver, args) {
    JS.boolean(not JS.as_boolean(JS.at(args, 0.0)));
});
```

Create this function once and reuse it for identity-sensitive operations such as
subscribe/unsubscribe. Its closure receives the real receiver and a host array
of all arguments. `JS.event_listener` simply exposes a fixed event closure as an
`Externref`; the browser-board example uses it for DOM listeners. Closures always
cross through JavaScript; this layer does not attempt closure escape lowering to
UTU function pointers.

## Output size and runtime cost

Bindings compile to existing `@es` imports. The builder filters the glue using
imports in the optimized Wasm, then bundles/minifies only that glue and required
closure/promise runtime. Package imports are named imports so a bundler can
remove unused library exports. Neither TypeScript, the UTU compiler, binding
metadata nor the generated browser corpus is deployed with the app. Third-party
package side effects and CommonJS internals can still limit tree shaking.

The regression suite adds 1,000 unused declarations and asserts byte-for-byte
identical Wasm and live glue. A Floating UI middleware test checks that using
`offset` does not pull in the positioning engine. `sizes.json` measures both JS
and Wasm, compressed independently as separately served resources. HTML/CSS
sizes are separate from the reported code budget.

A local Chromium 151 run of the persistent task board measured **5,267 raw bytes,
2,567 gzip bytes, or 2,152 Brotli bytes** for Wasm plus JavaScript, with 36 live
host imports out of 3,175 declared bindings in its selected modules. The full
corpus contains 130,125 bindings across 1,490 modules. Its 200 inserts plus 203
toggles took 42 ms on the test machine; rerun to measure your own environment.

| Deployed asset | Raw bytes | Gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| `app.wasm` | 2,631 | 1,414 | 1,193 |
| `app.js` | 2,636 | 1,153 | 959 |
| `index.html` | 277 | 220 | 113 |
| `style.css` | 2,082 | 926 | 762 |
| **Whole page** | **7,626** | **3,713** | **3,027** |

Compression is measured per resource; HTTP headers are not included. The local
demo server serves raw assets, so these compressed totals describe a deployment
with compression enabled, not its current local transfer encoding.

The generated browser sources are about 14.3 MB and currently embedded in the
portable compiler bundle. This increases compiler download/initialization cost,
not the compiled app's size. Generation and compile-time parsing are not free;
the full browser corpus is a coverage experiment, and lazy compressed compiler
resources would be a useful subsequent optimization.

Direct calls add a small generated wrapper at the Wasm/JS boundary; object
references are not marshalled. Universal variadic callbacks allocate an argument
array. Use fixed callbacks where suitable. The UI benchmark is a smoke test, not
a claim of parity with handwritten JS across workloads.

## Portability and checks

`src/bindings/generate.js` takes an injected TypeScript API and Program and has no
filesystem, network, process or TypeScript imports. A real Chromium Worker test
runs TypeScript's JS parser/checker with an in-memory CompilerHost. The Node/Bun
wrapper is only a convenience for filesystem projects. TypeScript 5.9.3 is pinned
for its portable JS Compiler API; it is a development-time dependency.

```sh
node scripts/dts-abi-tests.mjs
bun scripts/dts-abi-tests.mjs
node scripts/test-dts-portability.mjs
node scripts/test-dts-browser.mjs
```

Browser tests require Playwright Chromium (`bunx playwright install chromium`).
Tests exercise real nanoid, mitt, Floating UI, Node declarations, ESM/default/
reexports/CommonJS, namespaces, classes, optional/rest/overloaded calls, callbacks,
symbols, bigint, promises, thrown errors, byte budgets, and every generated browser
module's syntax. The app tests add/toggle/delete/reload, literal user text, mobile
layout and sustained interactions. A small binary import scanner avoids engines'
inconsistent reflection support for typed function references; it checks framing
but deliberately is not a full Wasm validator.

The generated app requires the compiler's existing WasmGC, typed-function-
reference and JS string builtin support. The browser demo is tested in Chromium;
the ABI suite runs on Node and Bun. This is tool portability with host-dependent
APIs, not evidence that the app runs on engines missing required Wasm features.

## Compiler integration fixes

Module-level imported values resolve before module hoisting, while intrinsic
free functions keep their existing method-resolution path. Void function bodies
discard a final value without discarding its side effects.

String captures revealed another boundary issue: Binaryen 131 normally protects
public GC heap types from its string type mapper. A closure environment exposed
through a function reference can therefore retain `stringref` fields after the
rest of the module lowers to host strings. UTU runs **only the representation
lowering pass** with closed-world type rewriting, restoring the prior setting
before optimization. This allows the ABI transformation to update environment
fields as well as function signatures; closures still travel through JS. A test
returns callbacks capturing both a host string and a struct holding one, including
Unicode and lone-surrogate data. See the upstream
[string lowering implementation](https://github.com/WebAssembly/binaryen/blob/version_131/src/passes/StringLowering.cpp#L269).
