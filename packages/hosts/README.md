# Hosts Package

Executable and editor-facing hosts now live under `packages/hosts/`.

Layout:

- [`cli/main.mjs`](/Users/robertmorelli/Documents/personal-repos/utu/packages/hosts/cli/main.mjs): Bun CLI host
- [`lsp/main.mjs`](/Users/robertmorelli/Documents/personal-repos/utu/packages/hosts/lsp/main.mjs): stdio LSP entrypoint
- [`lsp/server-session.mjs`](/Users/robertmorelli/Documents/personal-repos/utu/packages/hosts/lsp/server-session.mjs): shared LSP session orchestration
- [`lsp/transport/jsonRpcConnection.mjs`](/Users/robertmorelli/Documents/personal-repos/utu/packages/hosts/lsp/transport/jsonRpcConnection.mjs): stdio JSON-RPC transport
- [`lsp/protocol-adapters/index.mjs`](/Users/robertmorelli/Documents/personal-repos/utu/packages/hosts/lsp/protocol-adapters/index.mjs): request/response adapters and LSP encoding
- [`lsp/server/index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/hosts/lsp/server/index.js): shared LSP language server core
- [`vscode/extension.web.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/hosts/vscode/extension.web.js): VS Code web extension host

Compatibility:

- host entrypoints live only under `packages/hosts/*`
- build tooling now points at `packages/hosts/*` directly
- the VS Code host is `vscode.dev`-first; desktop compatibility must flow through the same web host rather than a separate desktop implementation
