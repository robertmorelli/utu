# Compiler API

This is the public compiler facade layer.

Use this package when callers need to:

- analyze a document
- compile a document
- read document metadata
- validate emitted WAT

Public entrypoint:

- [`index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/api/index.js)

Stable surface:

- named exports: `analyzeDocument`, `compileDocument`, `getDocumentMetadata`, `validateWat`
- object export: `COMPILER_API`
- callers may use either style, but should stay within this package boundary rather than importing deeper compiler internals

Current rule:

- callers should depend on these facades instead of reaching into deeper compiler internals
- `analyzeDocument()` always returns syntax/header snapshots, and can attach body facts when a higher layer supplies the shared language service
- `compileDocument()` remains free to reuse lower-level compiler internals, but the public boundary stays here

Import rule:

- hosts and workspace/session layers should import from this package
- this package may wrap lower-level compiler code internally when that keeps the public API stable
- this package should not depend upward on `packages/workspace`, `packages/language-platform`, or `packages/hosts`
