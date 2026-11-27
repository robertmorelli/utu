# Editor Support

All editor integrations use the self-hosted compiler (`utu lsp`) as the single source of diagnostics, hover, go-to-definition, references, rename, completion, and formatting. See [docs/tooling/language-server.md](../docs/tooling/language-server.md).

- `vscode/` — TextMate grammar, language configuration, and icon for the VS Code extension (`bun run package:vscode`)
- [helix/](helix/README.md) — Helix LSP and Tree-sitter setup (`node editors/helix/install.mjs`)
- [neovim/](neovim/README.md) — Neovim LSP and Tree-sitter setup
- [tree-sitter-utu/](tree-sitter-utu/README.md) — Tree-sitter grammar for utu
- [tree-sitter-wutu/](tree-sitter-wutu/README.md) — Tree-sitter grammar for Wutu
- [skill/](skill/README.md) — Claude Code skill for writing idiomatic utu (`writing-utu`)
