# utu Design Principles

These exist so that "this is utu, no matter who's asking" stays true.
If a change violates one of these, it does not land — not as a flag,
not as an opt-in, not for one host.

## 1. One bundle, same bytes everywhere

Node, Bun, browser, Worker, IDE — all run identical bytes. No
host-specific builds, no conditional exports, no "node version" vs
"web version." If it doesn't run in all of them, it doesn't ship.

## 2. The stdlib is in the bundle

Not a peer dep. Not a separate package. Not a runtime fetch. The
stdlib `.utu` sources are baked into the compiler at build time
(`scripts/build.mjs` → `platform-sources.generated.js`). There is no
"did you install the stdlib" question because there cannot be one.

## 3. Zero runtime dependencies

binaryen and tree-sitter wasm are embedded. The published package
has no `dependencies` field. `bun add utu` and you have the entire
language.

## 4. utu-lib is the only source of analysis truth

Diagnostics, hover, jump-to-def, formatting, semantic tokens — all
come from the compiler. Editors and tools are downstream consumers
that import utu and ask it questions. No parallel analyzers, ever.
A bug fix in the compiler is a bug fix everywhere simultaneously.

## 5. No "lite" or "full" variants

One entry point. One set of exports. If a caller only needs
`analyze` and the bundler tree-shakes `compile` out, fine — but we
do not engineer for that, document it, or promise it. The mental
model stays: import utu, get utu.

## 6. Tools and editors live in their own repos

This repo contains the language. VSCode extensions, docs sites,
playgrounds, conformance suites — they consume utu as a dependency
from their own repos. They are not utu.

## 7. One person should be able to ship it

Every architectural decision is filtered through: does this make
the project shippable by one maintainer? Multi-repo coordination,
parallel implementations, optional features that double the test
matrix — all fail this filter.
