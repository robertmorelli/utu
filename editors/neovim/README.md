# utu for Neovim

For Neovim 0.11 or later. You get:

- **Language server:** `utu lsp` provides diagnostics, hover, go to
  definition, references, rename, completion, symbols, and semantic tokens.
  Semantic tokens let the compiler color names (types, functions, fields)
  on top of the tree-sitter colors.
- **Tree-sitter highlighting:** a `@wutu/\ … \/` template is parsed by Wutu's
  grammar, and `@es` and `@css` get JavaScript and CSS when you have those
  parsers.
- **Folds and indentation:** indentation needs nvim-treesitter.
- **Text objects:** these need nvim-treesitter-textobjects.

```sh
node editors/neovim/install.mjs            # install or update
node editors/neovim/install.mjs --remove   # take it out again
```

Everything goes into one package, `~/.local/share/nvim/site/pack/utu/start/utu/`,
which Neovim loads on its own. Your configuration is not touched.

- `plugin/utu.lua` sets up the `utu` filetype, the language server
  (`node cli/utu.mjs lsp` from this repository), tree-sitter highlighting,
  and folds.
- `parser/utu.so` and `parser/wutu.so` are built from
  `editors/tree-sitter-utu/src/` and `editors/tree-sitter-wutu/src/`. This
  needs a C compiler, `cc` or `$CC`.
- `queries/utu/` and `queries/wutu/` are generated from Helix's queries
  (`editors/helix/queries/`), with capture names renamed to Neovim's, such
  as `@namespace` to `@module`. To change highlighting, edit the Helix
  queries; both editors pick it up.

At the end, the installer loads every query in headless Neovim. Run it again
after the grammars or queries change.
