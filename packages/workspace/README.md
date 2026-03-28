# Workspace Package

Shared workspace/session orchestration lives here.

Use this package for:

- open document tracking
- shared analysis caching
- dependency tracking from header facts
- file-backed document resolution
- workspace folder traversal
- header-backed workspace symbol synchronization
- session-level invalidation around shared parser, analysis, and language-service state

Key modules:

- [`document-store.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/workspace/document-store.js)
- [`analysis-cache.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/workspace/analysis-cache.js)
- [`dependency-graph.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/workspace/dependency-graph.js)
- [`workspace-symbol-index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/workspace/workspace-symbol-index.js)
- [`session.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/workspace/session.js)

Public entrypoint:

- [`index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/workspace/index.js)

Migration note:

- this package now backs the stdio LSP server and the VS Code host adapter
- `UtuAnalysisCache` provides syntax/header/body snapshot caching by document version
- `UtuWorkspaceSymbolIndex` consumes header snapshots instead of full body analysis
- `UtuDependencyGraph` tracks conservative header-level dependencies for invalidation

Import rule:

- hosts may depend on this package
- this package may depend on `packages/document`, compiler facades, and shared language-service code
- this package should not depend on VS Code APIs or JSON-RPC transport code
