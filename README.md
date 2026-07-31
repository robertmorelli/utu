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
