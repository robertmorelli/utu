# Changelog

## 0.1.0

- Added a maintained workspace symbol index so large symbol searches stay incremental.
- Hardened compiler parse-tree cleanup and added stress coverage for repeated runtime cycles.
- Added packaging metadata for publishable VS Code extension builds.

## 0.0.1

- Bootstrapped the VS Code extension package for UTU.
- Added language registration, syntax highlighting, diagnostics, and outline support.
- Added compile commands and a build step that snapshots the current compiler into `dist/compiler.mjs`.
