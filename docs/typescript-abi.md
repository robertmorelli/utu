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
for DOM construction, events, JSON, arrays, and persistent storage. The
[Pantry dashboard](../examples/browser-pantry/README.md) exercises much more of
the platform and lists the friction it found. It contains
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
| `const [n, s] = pair()` (`[number, string]`) | `let t = Api.pair(); t[0]; t[1]`: each constant index has its element's type; a variable index needs elements of one type |
| `const f = getFn(); f(3)` (`(x: number) => number`) | same: a host function value is callable, and so is a callback's function parameter (`cl(g) Str { g("a"); }`) |

Records (`&{...}`) and arrays (`[...]`) take their shape from the declaration
slot they are passed to and become real JS objects and arrays, including when
nested. Array literals satisfy arrays, typed arrays, `ArrayLike<T>`,
`Iterable<T>` (TypeScript 5.9's `Iterable<T, TReturn, TNext>` too), and `any`,
and bind `T` when every element has the same type. A record binds `T` of an
index signature `{ [k: string]: T }` from its first field, so
`get(&{ a: 1.0 }, "z")` of `get<T>(o: { [k: string]: T }, k: string): T | undefined`
is `?F64`. Without a declaration slot, `[...]` is a native WasmGC `Array[T]`
(see the language notes in `docs/arrays.md`); a `let` bound to a literal waits
for its first use, so `let xs = [1.0, 2.0]; Api.sum(xs);` passes a JS array
(not a tuple slot, as TypeScript's `let xs = [1]` is a `number[]`).

Closures take parameter types from the slot they reach: an argument, a record
field, an assigned property such as `button.onclick`, or the first use of a
`let`-bound closure (`let handler = cl(e) void {...}; a.addEventListener("x", handler);`).
If no context exists, the compiler asks for an annotation; so does a `Function`
slot (`fnLike(cl(x: F64) F64 {...})`). An optional callback
parameter (`(a: number, b?: number) => number`) is nullable, `?F64`: `promote`
it, since JS may leave it out. The host gets such a closure (and a `cl(this, …)`
one) wrapped, once per closure: the wrapper is kept on it, so
`removeEventListener` finds what `addEventListener` was given. A closure that
writes no result, where the callback's result is `any` or `void`, has its
body's (`cl(e: Web.Event) { n += 1; }`). A closure whose result is never absent fits a
callback whose result may be (`() => string | null` takes `cl() Str {...}`).

A literal where a union of literals is wanted is one of its values, as in
TypeScript: `let b: Browser.ScrollBehavior = "fast"` is an error, and so is
`99.0` for `enum Mode { Off = 0, On = 5 }`. A string enum takes only its
members (`Api.Tag.A`, not `"a"`). `K extends keyof Events` takes Events'
keys alone (`bus.on("nope", ...)` is an error). An ambient enum whose members have no
initializer (`declare enum Color { Red, Green = 5 }`) is computed, and takes any
number, as TypeScript has it.

`alt` over a host value tests each arm with `instanceof` against the declared
runtime class, using one generated import per class. Arms naming interface-only
types with no runtime value (such as `ParentNode`) are rejected. Subjects may be
nullable.

Native UTU members take precedence on `Str` and `F64` (`s.len()` and
`s.slice(0, 4)` use `I32`). Declared `String`/`Number` members are used only for
names UTU does not define, and only when an ABI declaring them is imported.

A generic parameter that only the result mentions takes the expected type,
within its constraint, as in TypeScript:
`let input: ?Browser.HTMLInputElement = document.querySelector("#search")`.
Host values compare by identity with `==` and `!=` (JavaScript's `===`).
Declared interfaces are structural: a `Set` is an `Iterable`. So are function
types: `(x: number) => number` of one declaration or package is that of
another; and index signatures: a value of `{ [k: string]: number }` is one of
another such declaration. A host `?F64` (`T | undefined`) is no `F64`:
`promote` it, or pass it where absence is taken (`defaultTo(v, 7.0)` of
`defaultTo<T>(v: T | null | undefined, d: T)` gives the host undefined as it
is). `new` of an `abstract class` is an error.

Dynamic values (`any`, parsed JSON) follow JavaScript where UTU needs a
primitive: arithmetic and orderings between two dynamic values are numeric,
`+` takes its context, a dynamic value reaching a `Str`, `F64`, or `Bool`
position (or a union's primitive member) is converted with a `typeof` check,
and a UTU-only method such as `json.length.to_i32()` reads its receiver as that
primitive. `any` absorbs unions (`any | undefined` is `any`), and a dynamic
value is nullable as the subject of `promote` or `orelse`. A closure passed to
a dynamic slot receives dynamic arguments.

## Identity and inference

Generic calls infer bindings from arguments, array elements (`firstOf([1.0])`
of `firstOf<T>(xs: T[]): T | undefined` is `?F64`), rest elements, tuple
elements, and callback results, and they respect declared constraints:
`appendChild("text")` is rejected because `T extends Node`. A record for a
constrained `T` may have more fields than the constraint names, as a fresh
TypeScript literal may (`pick([&{ name: "a", n: 1.0 }])` for
`T extends { name: string }`). Relations such as `S extends T` are kept,
so `words.find(...)` on `Str[]` returns `?Str` and `filter` returns `Str[]`.
Literal types are inferred only for keyed or literal-constrained parameters
(`createElement("input")`), so `Array.of("a", "b")` is `Str[]`.

A tuple's `T` comes from its first element of type `T` (nested tuples too, and
`U extends T[]`'s elements); the others are checked against it, so
`tupOf<T>(t: [T, T])` given `[1.0, "a"]` is a mistake, not a union. A
constrained `T` is the elements' type, not its constraint (`[1.0, 2.0]` for
`<T extends number | string>(xs: [T, T])` makes `T` F64). A tuple literal has
each element of its own type and as many as the tuple takes (`[number,
string]` takes 2; `[number, ...string[]]`, at least 1, the rest strings); an
index past a rest's start reads the rest's type. A function type fits another
as in TypeScript: an optional parameter where a required one is wanted, fixed
parameters where a rest is, a rest's element compared. A closure's result may
be any one member of a union result (`cl() F64` for `() => number | string`).
A `Str` that is not a literal (a variable's, a utu call's, a closure's written
`Str` result) is no union of string literals (`litU(x: "x" | "y")`), as in
TypeScript; one read from the host (`litU(Api.pick())`, or a `let` of it that
nothing assigns again) is taken, since utu keeps no literal types to tell.

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

`utu build` bundles a package's browser build (package.json's `browser`
field or condition), as `wutu build` does: the module then loads in a browser,
and in Node, which has the web APIs such builds use. A Node build may not load
in a browser (nanoid's needs `Buffer`). `utu build --target node` bundles Node
builds instead, for a module only Node runs.

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

The path is from the importing file, as any `using` path is. A relative
`--module` is from the program's directory: `utu build` bundles it from there,
and `utu run` imports it from there.

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
produce JS booleans. Function pointers remain UTU-internal.

The same holds at the other edges where utu values meet JavaScript: an `@es`
body's arguments and results, and an export's arguments and results. A `Bool` reaches
JavaScript as `true` or `false` and comes back as `!!v`. A `U32` reaches it
unsigned (`v >>> 0`), and a `U64` as an unsigned BigInt
(`BigInt.asUintN(64, v)`); on the way in, wasm keeps a value's low bits, so
`4294967295` and `-1` are the same `U32`. A tuple result is a JS array, each
element converted so. An `@es` result of a nullable type
treats `undefined` as `null`, and so does `await` of a `Promise[?T]`.

Structs, `Result`s, payload enums and arrays cross both edges, an `@es`
binding's arguments and results and an `export lib` function's, as opaque
wasm objects, handles: JavaScript cannot read their fields or make one, but
can keep one and give it back, where utu reads it. So `make() Point` and
`norm(p: Point) F64` work together from JS (`lib.norm(lib.make())`), and an
`@es` binding `fun(Point) Externref` may store a `Point` that another,
`fun(Externref) Point`, gives back (`std:Stream` holds its values so). In JS
`p.x` is `undefined`, `a.length` of an `Array[Str]` too, and a value of the
wrong kind where a struct is wanted (`lib.norm({ x: 3, y: 4 })`, or an `@es`
body's `({ x: 3 })` for a `Point` result) throws a `TypeError` where it
crosses. So does null (or `undefined`) from an `@es` binding for a handle
that is not nullable, in every build (`Wrong type from JavaScript: a Point,
not null`); a `?Point` takes both, as null. A protocol value (`fun() Shape`)
must be a wasm object: a plain JS object with an `area` method is no `Shape`
(`a Shape, not object`); a utu struct that does not implement it still
traps where it is used. A closure JS calls is given no null for a handle
argument in safe builds (`a closure's argument 1 is null`), as an `export
lib` function's arguments below. Give JS what it should read as numbers, `Str` (`@json encode` for
whole values), or host objects. A `fun` argument reaches JS as a function it
can call. A JS function is a closure: type a function result `cl(I32) I32`;
`fun(I32) I32` is an error (`add gets a JS function: that is a cl, not
fun(I32) I32`).

An `@es` body bound to a `fun` or `cl` type should be a function. One that
is not plainly one (an arrow or `function`), such as `Math.abs`, is tested
as the glue loads: a value that is no function throws a `TypeError` naming
the binding (`f: @es gave number, not a function`) before the program runs.

Safe builds (`-O small`, `fast`, `debug`) also check an `export lib`
function's arguments: an `I32`, `U32` or
`enum(I32)` an integer number (wasm keeps its low bits, as above), not `1.5`;
an `I64` or `U64` a BigInt; an `F32` or `F64` a number (`NaN` included); a
`Str` a string, a `?Str` a string or null; a struct, array, enum or closure
must not be null, and `undefined` for a nullable parameter is `null`. A wrong
argument throws a `TypeError` naming the function and the argument
(`inc: argument 1 must be an integer, not string`). `smallUnsafe` and
`fastUnsafe` pass arguments as they come: a number as wasm converts it
(`"x"` is 0). Every build takes a `Bool` argument by its truthiness (`flag(1)`,
`flag("x")` are true; `flag(0)`, `flag(null)` false). Contextual callbacks
derive parameter types from declarations, including DOM event maps.

Host exceptions are caught with `try`:

```utu
let parsed = try { JS.JSON.parse(text); } catch |e| { Browser.console.warn(JS.String(e)); null; };
```

`try { … } catch |e| { … }` is an expression whose branches meet like `if`
(here `null` beside an `Externref` makes a `?Externref`). `e` is the thrown
JavaScript value, an `Externref` with no members; `JS.String(e)` reads it as
text. The binding is optional. It lowers to one Wasm `try` that catches on the host's
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
    |stored| => Browser.console.log(stored), // stored is Str
    ~> Browser.console.log("missing"),
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

Builds optimize for size (`-O small`, the default) or speed (`-O fast`); pass
`createCompiler({ optimize: 'speed' })`, `-O fast` to the CLI's `build-exe`, or
`optimize: 'speed'` to `tools/dts/build-app.mjs`. Under `-O small`, plain property
reads and writes, method calls, and global reads share one import per shape,
such as `(self,k) => self[k]`, with the name passed from Wasm as a string
constant; JS string builtins make those constants free. Under `-O fast`, each name
keeps its own import, so every JavaScript access site stays monomorphic.
Named package imports are never shared,
because bundlers need them for tree shaking.

| App | `-O small` total gzip | `-O fast` total gzip |
|---|---:|---:|
| browser task board | 2,565 B | 3,063 B |
| Pantry dashboard | 4,658 B | 5,816 B |

Only used operations become Wasm imports and live JavaScript. Host references
share one Wasm representation, so operations that differ only in declaration
types share one import (`el.append(a, b)` is one import for every element type).
Each call site keeps its precise declaration signature for type checking.
Package imports remain named imports so bundlers can discard unused exports. A
regression requires 1,000 unused declarations to add exactly zero Wasm and
live-glue bytes. The browser app enforces a 9 KB combined JS/Wasm gzip budget;
catalog metadata never ships with it.

The boundary still costs time. The compiler does not automatically move UTU
loops into JavaScript. See the archived [d8 array comparison](../benchmarks/abi/README.md):
a crossing per element is materially slower than making one call for the whole
operation. Ergonomic syntax does not remove that cost.

## Remaining limits

- A callback receives at most as many arguments as its closure declares; an
  unbounded `...args` list is not collected into one value.
- A closure may declare fewer parameters than its callback type, as in
  TypeScript, but not more: `Api.cb(cl(x, y) F64 { … })` where the host passes
  one is an error (`Callback takes 2 parameters; JS passes 1`). A rest
  parameter passes any number. A `fun` is not a host callback; give a `cl`.
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
