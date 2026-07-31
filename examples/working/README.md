# Guaranteed working examples

Every `.utu` file in this directory is compiled and executed by the automated
test suite in both compiler debug modes. They are safe starting points for the
VS Code extension:

- `hello.utu` — minimal `export main`
- `arrays_and_for.utu` — WasmGC arrays, `len()`, mutation, and range loops
- `structs.utu` — nominal structs and field access
- `strings.utu` — host strings and concatenation
- `closures.utu` — a captured lexical closure

Build and install the extension, open one of these files, then run **UTU: Run
Main**.

Other directories contain historical, diagnostic, compiler-surface, and
migration fixtures; they are not all promised to be runnable applications.
