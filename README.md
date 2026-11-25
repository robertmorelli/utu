# utu

A programming language that compiles to WasmGC. The self-hosted compiler, standard library, parser, and analyzer ship as a single bundle — the same bytes in Node, Bun, browsers, and editors.

```utu
using Browser from std:Browser
using Nano from "npm:nanoid"

main {
    let item = Browser.document.createElement("li")
    item.textContent = Nano.nanoid(8)
    Browser.document.body.append(item)
}
```

## Quick Start

```sh
bun install
bun run build
```

Run, check, format, or build a program:

```sh
./cli/utu.mjs examples/hello.utu
./cli/utu.mjs check examples/hello.utu
./cli/utu.mjs format examples/hello.utu
./cli/utu.mjs build examples/wutu-five/folio/main.utu --out dist/folio
```

Run the test suite:

```sh
bun run test
```

## VS Code

```sh
bun run package:vscode
code --install-extension dist/utu-vscode.vsix
```

## Layout

- `selfhost/` — self-hosted compiler written in utu
- `std/` — standard library baked into the compiler bundle
- `src/` — WasmGC runtime, selfhost loader, TypeScript ABI bindings, and VS Code extension
- `cli/` — `utu` and `wutu` command-line tools
- `editors/` — VS Code, Helix, Neovim, and Tree-sitter support
- `examples/` — language, stdlib, and Wutu web examples
- `docs/` — language specification, guides, and docs site

## Documentation

- [Language specification](docs/spec.md)
- [Design principles](docs/principles.md)
- [Type system](docs/types.md)
- [TypeScript ABI & JS interop](docs/typescript-abi.md)
- [Wutu (web DSL)](docs/wutu.md)
- [Typed JSON](docs/json.md)
- [Iterators](docs/iterators.md)
- [Self-hosting & bootstrap](docs/self-hosting.md)

## License

[MIT](LICENSE)
