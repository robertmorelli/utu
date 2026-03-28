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

Primary ownership is now split by concern:

- [`text-document.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/document/text-document.js)
- [`mutable-document.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/document/mutable-document.js)
- [`spans.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/document/spans.js)
- [`syntax.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/document/syntax.js)
- [`tree-sitter.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/document/tree-sitter.js)

Common edit paths:

- parser/runtime bootstrap changes start in [`tree-sitter.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/document/tree-sitter.js)
- document mutation behavior for LSP/session code starts in [`mutable-document.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/document/mutable-document.js)
- span/range or parse-diagnostic behavior starts in [`spans.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/document/spans.js) and [`syntax.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/document/syntax.js)

Import rule:

- shared compiler, language-platform, and host code may depend on this package
- this package should not depend on compiler, workspace, or host layers
