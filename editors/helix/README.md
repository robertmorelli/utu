# utu for Helix

Syntax highlighting (with JavaScript, CSS, and JSON inside `@es`, `@css`, and
`@json`), text objects (`maf`/`mif` for functions, `mac` for structs, enums,
protocols, and modules, `mat` for tests), indentation, and the utu language
server (diagnostics, hover, go to definition, references, rename, completion,
symbols) for `.utu` files.

```sh
node editors/helix/install.mjs            # install or update
node editors/helix/install.mjs --remove   # take it out again
```

The installer:

- writes utu's language, language server (`node cli/utu.mjs lsp` from this
  repository), and grammar into `~/.config/helix/languages.toml` between two
  marker lines, keeping everything else (the file is backed up to
  `languages.toml.bak.utu` first);
- copies `queries/utu/` to `~/.config/helix/runtime/queries/utu/`;
- builds the tree-sitter grammar from this repository's `src/parser.c` and
  `src/scanner.c` into `~/.config/helix/runtime/grammars/utu.so` (it needs a C
  compiler, `cc` or `$CC`).

Run it again after the grammar or the queries change. `hx --health utu` shows
what Helix found.
