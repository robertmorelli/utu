# TypeScript declarations as UTU's JavaScript ABI

Declarations describe the host interface. UTU keeps its own semantics and uses
TypeScript's parser and checker to resolve the declaration graph. The compiler
retains foreign identities and member types through analysis, then emits only
the JavaScript boundary operations actually used. Neither TypeScript nor the
compiler ships with a compiled application.

## Browser code

```utu
using Browser from std:Browser;

export main() void {
    let document = Browser.document;
    let input = document.createElement("input");
    input.placeholder = "Write something";
    input.addEventListener("input", cl(event) void {
        Browser.console.log(input.value);
    });
    document.body.appendChild(input);
}
```

One import provides the browser and standard JavaScript declarations. Other
hosts import only what they have:

| Module | Contents | Runs on |
|---|---|---|
| `std:JS` | ECMAScript: `Array`, `Map`, `Set`, `JSON`, `Math`, `Promise`, `Date`, `RegExp`, `Intl`, … | any JS host |
| `std:Web` | the common web APIs (WinterTC): `fetch`, `Request`/`Response`, `URL`, `TextEncoder`, streams, `AbortController`, `Blob`, `crypto`, `console`, timers, `structuredClone`, `WebAssembly`, events | Node, Bun, Deno, browsers, workers |
| `std:Browser` | all of the above plus the DOM | browser pages |
| `std:Worker` | a worker's global scope: `self`, `postMessage`, `importScripts`, service-worker types | web workers |

`std:JS` and `std:Web` are views of the browser graph, and every module shares
standard-library identities: a `Web.Response` is a `Worker.Response` is a
`Browser.Response`. Generic declared types
written bare, such as `Browser.Map`, mean any instantiation. Local
`let` types can be inferred. Literal overloads preserve useful return types:
`createElement("input")` returns `HTMLInputElement`, including its `value`
property. Named parameters can use types such as `Browser.Document` and
`Browser.HTMLElement`. Properties use assignment, methods preserve their
receiver, and computed access uses `value[key]`.

Use `new Browser.Date(0.0)` to select a constructor when a host value supports
both calling and construction. A constructor-only value can also be called
directly, such as `Package.Counter(2.0)`.

The [browser task board](../examples/browser-board/main.utu) uses this interface
for DOM construction, events, JSON, arrays, and persistent storage. It contains
no `@es`, application JavaScript, or helper modules.

## Writing against declarations

Declaration shapes map onto ordinary UTU syntax:

| TypeScript | UTU |
|---|---|
| `ctx.fillStyle = "red"` (`string \| CanvasGradient \| CanvasPattern`) | same: union slots accept any member |
| `el.append("text", span)` (`...(string \| Node)[]`) | same: subtypes are accepted |
| `el.dataset.role = "x"` (string index signature) | same |
| `setTimeout(() => {...}, 100)` (`TimerHandler`) | `Browser.setTimeout(cl() void {...}, 100)` |
| `list.forEach(el => el.remove())` | `list.forEach(cl(el) void { el.remove(); })`: fewer parameters than declared are fine |
| `xs.map(s => s.toUpperCase())` | `xs.map(cl(s) Str { s.toUpperCase(); })`: `U` is inferred from the closure |
| `new Blob(["a", "b"], { type })` | `new Browser.Blob(["a", "b"], &{ type: "text/plain" })` |
| `el.addEventListener("x", f, { once: true })` | same shape, with `&{ once: true }` |
| `const t = e.target as HTMLInputElement` | `alt e.target { Browser.HTMLInputElement \|t\| => ..., ~> ..., }` |
| `m.get(k) ?? fallback` (`V \| undefined`) | `promote m.get(k) { \|v\| => ..., ~> fallback, }` |
| `"abc".toUpperCase()`, `n.toFixed(2)` | same: `Str` and `F64` use declared `String` and `Number` members |
| `Shape.Square` (any `enum`, const or not) | same: folds to a literal, with no import or host read |
| `mean(new Float64Array([2, 4]))` | `Geom.mean([2, 4])`: typed-array slots receive that typed array |

Records (`&{...}`) and arrays (`[...]`) take their shape from the declaration
slot they are passed to and become real JS objects and arrays, including when
nested. Array literals satisfy arrays, typed arrays, `ArrayLike<T>`,
`Iterable<T>`, and `any`, and bind `T` when every element has the same type.
Without a declaration slot, `[...]` is a native WasmGC `Array[T]` (see the
language notes in `docs/arrays.md`).

Closures take parameter types from the slot they reach: an argument, a record
field, an assigned property such as `button.onclick`, or the first use of a
`let`-bound closure (`let handler = cl(e) void {...}; a.addEventListener("x", handler);`).
If no context exists, the compiler asks for an annotation.

`alt` over a host value tests each arm with `instanceof` against the declared
runtime class, using one generated import per class. Arms naming interface-only
types with no runtime value (such as `ParentNode`) are rejected. Subjects may be
nullable.

Native UTU members take precedence on `Str` and `F64` (`s.len()` and
`s.slice(0, 4)` use `I32`). Declared `String`/`Number` members are used only for
names UTU does not define, and only when an ABI declaring them is imported.

## Identity and inference

Generic calls infer bindings from arguments, rest elements, tuple elements, and
callback results, and they respect declared constraints: `appendChild("text")`
is rejected because `T extends Node`. Relations such as `S extends T` are kept,
so `words.find(...)` on `Str[]` returns `?Str` and `filter` returns `Str[]`.
Literal types are inferred only for keyed or literal-constrained parameters
(`createElement("input")`), so `Array.of("a", "b")` is `Str[]`.

Types declared by TypeScript's standard libraries (`lib.dom`, `lib.es*`) have one
identity across every imported ABI. An element from `std:Browser` is accepted
directly by a package whose declarations reference DOM `Element`, and a
package's `Promise<T>` is the same type as the browser's.

Diagnostics use declaration names, such as `expected Browser.Node, got Str`,
`got Browser.Str[]`, and `Unknown foreign member 'Fixture.Counter.missing'`.

## Import a package

```utu
using Nano from "npm:nanoid";
using Floating from "npm:@floating-ui/dom";
using Path from "node:path";

export main() void {
    let id = Nano.nanoid(8);
    let file = Path.join("out", id, "report.txt");
}
```

`"npm:pkg"` (including scoped packages and subpaths) and `"node:mod"` import a
package's declarations directly. TypeScript's own module resolution finds them:
`types` and `exports` conditions, `@types/*` packages, and Node's ambient
`node:*` modules. Members of an `export =` module are importable by name, so
`Path.join` works as `import { join } from "node:path"` does. The glue imports
the same specifier, so the package must be resolvable by the bundler or runtime.

The compiler itself never touches a file system or TypeScript. The host passes
`createCompiler({ resolvePackage })`:

- `tools/dts/packages.mjs` resolves from `node_modules` for Node and Bun, and
  caches each linked graph in `node_modules/.utu/abi` until a declaration file
  changes. The CLI and `tools/dts/build-app.mjs` use it automatically.
- `src/bindings/packages.js` is the host-neutral resolver behind it. It takes
  the TypeScript API and synchronous file callbacks, so a browser Worker can
  supply an in-memory file system (for example, packages fetched from a CDN).

## Link a declaration file

```sh
node tools/dts/cli.mjs --input path/to/api.d.ts --module ./api.js --prefix Api --out bindings
```

```utu
using Api from "./bindings/Api.abi.json";
```

Rust crates work the same way through wasm-bindgen's declarations:

```sh
wasm-pack build --target nodejs --out-dir pkg
node tools/dts/cli.mjs --input pkg/geom.d.ts --module ./pkg/geom.js --prefix Geom --out bindings
```

Constructors, getters and setters, `&mut self` methods, `Option<T>` results,
`Vec<f64>` parameters and results, enums, and `js_sys::Function` callbacks map to
ordinary UTU syntax (see `scripts/fixtures/rust-geom`). Rust memory is still
managed by wasm-bindgen: call `free()` when an object is no longer needed.

The host-neutral linker accepts an injected TypeScript API and Program. Its
source of truth is the checker's resolved symbols, including reexports,
namespace merging, ambient/wildcard modules, and CommonJS `export =` declarations.
It runs with an in-memory CompilerHost inside a browser Worker. Syntactic errors
are rejected; unrelated TS semantic diagnostics do not prohibit an ABI header.

## Preserved information

The graph stores foreign types, inherited members, readonly properties, index
signatures, callable and constructor overloads, optional/rest parameters, literal
parameters, generic references, indexed access types, and exported symbol keys.
It stores references to generic templates rather than recursively expanding
instances such as arrays of arrays. Recursive declarations therefore remain a
graph rather than an ever-growing pile of source wrappers.

Compiler integration is separated into three parts:

- `foreign-types.js` owns per-compilation type identities, substitutions, and import aliases.
- `foreign-abi.js` resolves source operations and supplies contexts to the shared type graph.
- `foreign-lowering.js` emits and interns only resolved boundary operations.

Foreign identities have an `externref` representation; they are not UTU heap
structs and are not copied into a parallel object model. A value's properties and
methods remain available after it passes through a function or collection.
Inheritance permits an `HTMLElement` where a `Node` is required.

Overloads are selected from supplied arguments. Optional arguments may be
omitted; rest arguments are written normally. Generic identity functions preserve
the actual argument type. Generic collection methods retain their element type.
Contextual record expressions such as `API.make(&{label: "hello", count: 2.0})`
create real JS objects. Missing required fields and readonly writes are errors.

Numbers cross as `F64`, strings as `Str`, and booleans as actual JS booleans.
Closures remain JS functions and preserve identity; boolean-returning closures
produce JS booleans. Function pointers remain UTU-internal. Contextual callbacks
derive parameter types from declarations, including DOM event maps.

Host exceptions are caught with `try`:

```utu
let parsed = try { JS.JSON.parse(text); } catch |e| { Browser.console.warn(e.message); null; };
```

`try { … } catch |e| { … }` is an expression whose branches meet like `if`.
`e` is the thrown JavaScript value, so its members are available; the binding
is optional. It lowers to one Wasm `try` that catches on the host's
`WebAssembly.JSTag`. Wasm traps (`fatal`, a failed `assert`, a null
dereference) are not exceptions and are never caught.

Reading a dynamic value (`any`, `unknown`, or a primitive union such as
`string | number`) where UTU expects `F64`, `Str`, or `Bool` converts it at the
boundary after checking its JavaScript `typeof`; a mismatch throws a
`TypeError` instead of producing a wrong value.

Nullable references retain their foreign identity through `promote`. Both
`null` and `undefined` mean absence: host results normalize to null at the
boundary, and a null passed to a slot that accepts `undefined` but not `null` is
passed as `undefined`. Nullable numbers are represented as host values until
promotion, then unboxed when a numeric result is required.

```utu
promote Browser.localStorage.getItem("key") {
    |stored| => { /* stored is Str */ },
    ~> { /* missing value */ },
};
```

Typed host promises work with UTU `await` on engines supporting JSPI. Boundary
calls preserve host exceptions. Accessing a method as a value keeps JavaScript's
normal unbound-method behavior; calling `object.method(...)` retains `object`
as the receiver. There are no automatically bound proxy objects.

## Size and portability

The browser declaration graph is compressed in the compiler,
replacing the former 1,490 expanded source modules. Standard `DecompressionStream`,
`Blob`, and `Response` APIs decode them on first use. Decoded declarations can be
shared; demand, type identities, and inference state are private to a compilation.
The catalog is not decompressed when the program does not import the browser.

Only used operations become Wasm imports and live JavaScript. Host references
share one Wasm representation, so operations that differ only in declaration
types share one import (`el.append(a, b)` is one import for every element type).
Each call site keeps its precise declaration signature for type checking.
Package imports remain named imports so bundlers can discard unused exports. A
regression requires 1,000 unused declarations to add exactly zero Wasm and
live-glue bytes. The browser app enforces a 6 KB combined JS/Wasm gzip budget;
catalog metadata never ships with it.

The boundary still costs time. The compiler does not automatically move UTU
loops into JavaScript. See the archived [d8 array comparison](../benchmarks/abi/README.md):
a crossing per element is materially slower than making one call for the whole
operation. Ergonomic syntax does not remove that cost.

## Remaining limits

- A callback receives at most as many arguments as its closure declares; an
  unbounded `...args` list is not collected into one value.
- A type the checker could not resolve arrives as a host value. Narrow it with
  `alt`, read it through a primitive context, or pass it along.

## Verification

```sh
node scripts/dts-abi-tests.mjs
node scripts/dts-deep-tests.mjs
bun scripts/dts-deep-tests.mjs
node scripts/test-dts-portability.mjs
node scripts/test-dts-browser.mjs
node scripts/benchmark-js-arrays.mjs
```

Coverage includes declared classes, nested objects/namespaces, const enums,
symbol keys, nullable and undefined results, inferred locals, typed records,
tuples, unions, overloads, generic inference and constraints, callbacks,
`alt` narrowing, `String`/`Number` members, promises, cross-package DOM
identity, enums, typed arrays, a wasm-bindgen Rust crate, alias/file imports,
and diagnostics. Real-package tests cover
nanoid, mitt, node:path, CommonJS, and Floating UI. Browser tests exercise live
DOM behavior and storage across reloads. The array benchmark builds with Node
but performs all warmups and timings in d8; select it with `D8_BIN` if necessary.
