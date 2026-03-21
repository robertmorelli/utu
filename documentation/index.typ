= Utu Documentation

This Typst document set organizes the language specification into
topic-oriented reference pages. The organization below keeps full coverage of
the March 2026 draft while making it easier to evolve the docs chapter by
chapter.

The chapters are:

- overview and type system
- strings and memory
- control flow, functions, imports, and dispatch
- builtins and required Wasm instructions
- grammar and compilation model
- complete example walkthrough
- codegen guide with side-by-side Utu and WAT

#pagebreak()
#include "./01-overview-and-types.typ"

#pagebreak()
#include "./02-strings-and-memory.typ"

#pagebreak()
#include "./03-control-flow-functions-and-interop.typ"

#pagebreak()
#include "./04-builtins-and-wasm.typ"

#pagebreak()
#include "./05-grammar-and-compilation.typ"

#pagebreak()
#include "./06-complete-example.typ"

#pagebreak()
#include "./07-codegen-guide.typ"
