# Compiler API

This is the public compiler facade layer.

Use this package when callers need to:

- analyze a document
- compile a document
- read document metadata
- validate emitted WAT

Public entrypoint:

- [`index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/compiler/api/index.js)

Phase 1 rule:

- these files are shims over the current implementation
- callers should depend on these facades instead of reaching into legacy compiler internals directly when practical

Import rule:

- hosts and workspace/session layers should import from this package
- this package may wrap legacy compiler code internally during migration
