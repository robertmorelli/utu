# utu for Helix

Syntax highlighting, recursive into embedded languages: a `@wutu` template is
parsed by its own grammar (`editors/tree-sitter-wutu`: elements, attributes,
events, bindings, CSS, and the utu inside), whose `@document` CSS is CSS and
whose nested `@wutu`, `@es`, and `@css` are Wutu, JavaScript, and CSS again;
`@es` and `@css` in utu are JavaScript and CSS. Also text objects (`maf`/`mif` for functions, `mac` for structs, enums,
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
- copies `queries/utu/` and `queries/wutu/` to `~/.config/helix/runtime/queries/`;
- builds the two tree-sitter grammars, utu's (this repository's `src/`) and
  Wutu's (`editors/tree-sitter-wutu/src/`), into
  `~/.config/helix/runtime/grammars/` (it needs a C compiler, `cc` or `$CC`).

Run it again after the grammar or the queries change. `hx --health utu` shows
what Helix found.
