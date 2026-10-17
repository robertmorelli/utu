# The language server

`utu lsp` is a language server on stdin and stdout, for any editor that speaks
LSP. It is the self-hosted compiler (`dist/utu.wasm`) answering the editor's
questions; there is no second analyzer (PRINCIPLES #4).

```sh
node cli/utu.mjs lsp
```

## What it answers

| request | answer |
|---|---|
| diagnostics | both builds `utu check` makes (the exports' and the tests'), on every edit; an edit to an open file also rechecks the other open files |
| hover | a declaration's first line, a local's or parameter's checked type, and its `///` doc comment |
| go to definition | names, fields, and methods (a method by its receiver's type, as checked) |
| find references, highlights | every name that resolves to the declaration |
| rename | the same names, in every file of the program; the standard library is not renamed |
| outline | the file's types, functions, globals, fields, and variants, nested |
| semantic tokens | each name colored by what it names (function, parameter, field, …) |
| completion | after `x.`, the fields of x's type and its module's methods; after `M.`, what module M holds; elsewhere, the function's locals, the file's declarations, the prelude's types, and the keywords |

## How it works

Every answer is read from a build of the program whose entry is the file
asked about. A build takes a few milliseconds (1 to 20 for the programs in
`examples/`), so nothing is incremental: the compiler holds one program, and
a question about another file, or after an edit, builds again. The names come
from the compiler's resolution tables (`node_decl`, `decl_node`), read in
place through `src/selfhost/query.js`; types come from the last check
(`decl_checked_type`).

Text being typed rarely parses, so completion builds the text with a name
where the one being typed is (followed by `;`, `);` or ` }` when that is what
it takes to parse), and reads the receiver's type from that build.

`src/selfhost/lsp.js` touches no file system or stream: the host gives it the
compiler, a compile host per program, the mapping between URIs and file keys,
and a function to send messages. `cli/utu.mjs` is the host for Node (LSP's
framing on stdio). Definitions in the standard library open its file in
`std/` when this repository is where the server runs.

## Editors

Neovim (0.11+):

```lua
vim.lsp.config('utu', { cmd = { 'node', '/path/to/utu/cli/utu.mjs', 'lsp' }, filetypes = { 'utu' } })
vim.lsp.enable('utu')
vim.filetype.add({ extension = { utu = 'utu' } })
```

Helix: `node editors/helix/install.mjs` installs the language server, the
tree-sitter grammar, and highlight, injection, text-object, and indent queries
(see [editors/helix](../editors/helix/README.md)). By hand, `languages.toml`:

```toml
[language-server.utu]
command = "node"
args = ["/path/to/utu/cli/utu.mjs", "lsp"]

[[language]]
name = "utu"
scope = "source.utu"
file-types = ["utu"]
language-servers = ["utu"]
```

Zed, Sublime (LSP package), Emacs (eglot), and Kakoune take the same command.
