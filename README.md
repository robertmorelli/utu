# utu

utu is a programming language that compiles to WasmGC. The compiler is self-hosted and ships with the standard library, parser, and analyzer in one Wasm bundle that runs in Node, Bun, browsers, and editors.

```utu
using Browser from std:Browser
using Nano from "npm:nanoid"

main {
    let item = Browser.document.createElement("li")
    item.textContent = Nano.nanoid(8)
    Browser.document.body.append(item)
}
```

## Build and run

```sh
bun install
bun run build
```

Then run, check, format, or build a program with the CLI:

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

## VS Code extension

```sh
bun run package:vscode
code --install-extension dist/utu-vscode.vsix
```

## Repo layout

- `selfhost/`: the self-hosted compiler, written in utu
- `std/`: standard library sources embedded into the compiler
- `src/`: WasmGC runtime, selfhost loader, TypeScript ABI bindings, and VS Code extension
- `cli/`: `utu` and `wutu` CLI entry points
- `editors/`: VS Code, Helix, Neovim, and Tree-sitter support
- `examples/`: language, stdlib, and Wutu web examples
- `docs/`: language spec, guides, and the docs site

## Docs

Full index in [docs/README.md](docs/README.md). Main references:

- [Language specification](docs/language/spec.md)
- [Type system](docs/language/types.md)
- [TypeScript ABI and JS interop](docs/language/typescript-abi.md)
- [Wutu (web DSL)](docs/language/wutu.md)
- [Design principles](docs/compiler/principles.md)
- [Self-hosting and bootstrap](docs/compiler/self-hosting.md)

## License

[MIT](LICENSE)
