utu is a language that compiles to WasmGC. The compiler, standard library, parser, and analysis engine ship as one bundle -- same bytes whether you're running it in Node, Bun, a browser, an IDE, or CI. There is no separate stdlib install, no host-specific build, no "lite" version. You get all of utu or none of it.

See `PRINCIPLES.md` for the design constraints that keep this true.

## VS Code

The desktop and web extension provides syntax highlighting, compiler-backed
diagnostics, hover information, Wasm/WAT compilation, syntax and compiler-IR
views, and `export main` execution.

```sh
bun run package:vscode
code --install-extension dist/utu-vscode.vsix
```

Open any `.utu` file or run a command from the **UTU** command palette group.

## Go

`utu build` writes a Go package: the module, made Go by gosm, and Go for
everything it imports, the standard library's included. `--package main`
makes a program that `go run` runs as `utu run` would. `@go/\ … \/` bindings
are Go, as `@es` ones are JavaScript. See [the Go host](docs/go-host.md).

```utu
let shout: fun(Str) Str = @go/\ import "strings"; strings.ToUpper \/;
```

## JavaScript, the browser, and npm

TypeScript declarations are utu's foreign-function interface. `std:Browser`
gives typed access to the whole DOM and JavaScript standard library, and any
npm package with types imports directly:

```utu
using Browser from std:Browser;
using Nano from "npm:nanoid";

export main() void {
    let item = Browser.document.createElement("li");
    item.textContent = Nano.nanoid(8);
    Browser.document.body.append(item);
}
```

Only the boundary operations a program actually uses are emitted. See
[TypeScript declarations as utu's JavaScript ABI](docs/typescript-abi.md) for
type mapping, packages, and linking your own `.d.ts` files.

## Typed JSON

`@json/\ decode Save text \/` parses straight into native structs, with errors
that name the field, line, and column. `encode` writes them back, and `match`
pulls typed fields out of documents you do not control. See [typed JSON](docs/json.md).

## Iterators and Wutu

Native array pipelines fuse into Wasm loops; Wutu combines DOM construction and
CSS in typed Utu expressions. See [iterators](docs/iterators.md),
[Wutu](docs/wutu.md), [native range/spatial queries](docs/queries.md), and the [greenhouse website](examples/wutu-garden/README.md).

Wutu now supports reactive roots, keyed DOM reuse, scoped node aliases, two-way
bindings, typed local storage, prerendering, and a compiler-backed preview.

```sh
node cli/wutu.mjs dev examples/wutu-five/folio/main.utu
node cli/wutu.mjs format examples/wutu-five/folio/main.utu
node cli/wutu.mjs build examples/wutu-five/folio/main.utu --out dist/folio
```

The five-site gallery is built with `bun run demo:wutu-five`. Its source viewers
show the exact readable Utu source; deployed JS/Wasm are optimized separately.

Three more complete examples—Dispatch, Supper, and Split—are built with
`bun run demo:wutu-more` and tested with `bun run test:wutu-more`.
See [the follow-up usability review](docs/wutu-more-review.md) for measured
rendering/persistence costs and the remaining language and framework friction.

The latest [ten Wutu applications and friction review](docs/wutu-round-two-review.md)
exercise CSS stenciling, recursive DSL composition, scoped views, persistence,
routing and lifecycle. Run `npm run test:wutu-rounds` to build and verify both
five-site batches. Each generated gallery links to its sites and readable source.
