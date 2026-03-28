# Language Platform Package

This package is the public language-service and editor-query surface.

Use this package for:

- diagnostics
- hover/definition/reference/completion logic
- workspace symbols
- semantic token support
- shared language-service types and helpers
- provider-oriented host entrypoints under `providers/`

Public entrypoint:

- [`index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/index.js)

Migration note:

- this package currently re-exports the legacy `lsp_core` implementation
- callers should prefer this package over importing `lsp_core/*` directly

Key locations:

- [`core/languageService.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/core/languageService.js)
- [`core/documentIndex.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/core/documentIndex.js)
- [`core/symbols.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/core/symbols.js)
- [`core/runnables.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/core/runnables.js)
- [`core/workspaceSymbols.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/core/workspaceSymbols.js)
- [`core/completion-helpers.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/core/completion-helpers.js)
- [`core/compile-diagnostics.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/core/compile-diagnostics.js)
- [`providers/diagnostics.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/providers/diagnostics.js)
- [`providers/hover.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/providers/hover.js)
- [`providers/definition.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/providers/definition.js)
- [`providers/references.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/providers/references.js)
- [`providers/completion.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/providers/completion.js)
- [`providers/semantic-tokens.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/providers/semantic-tokens.js)
- [`providers/document-symbols.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/providers/document-symbols.js)
- [`providers/workspace-symbols.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/language-platform/providers/workspace-symbols.js)

Import rule:

- hosts, compiler facades, and workspace/session code may depend on this package
- this package should become the stable boundary while `lsp_core` is gradually internalized
