# Document Package

Shared source-document and tree-sitter utilities live here.

Use this package for:

- text document abstractions
- mutable document updates for host/session code
- tree-sitter parser bootstrap and parser service
- span/range helpers
- parse diagnostics and small syntax helpers

Public entrypoint:

- [`index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/document/index.js)

Common edit paths:

- parser/runtime bootstrap changes start in [`index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/document/index.js)
- document mutation behavior for LSP/session code starts in [`index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/document/index.js)

Import rule:

- shared compiler, language-platform, and host code may depend on this package
- this package should not depend on compiler, workspace, or host layers
