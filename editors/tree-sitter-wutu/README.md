# tree-sitter-wutu

A tree-sitter grammar for Wutu templates (the text of `@wutu/\ … \/`), for
editors: utu's grammar exposes a DSL's text as `dsl_text`, and editors inject
this grammar into it (see `editors/helix`). Structure is parsed (directives,
elements, attributes, properties, bindings, events, text, holes, if/for, CSS
declarations and rules); the utu inside is read as tokens, and a DSL inside
that utu is a `dsl_expr` whose text is injected by name again.

```sh
cd editors/tree-sitter-wutu
npx tree-sitter generate                              # src/parser.c from grammar.js
npx tree-sitter build --wasm -o tree-sitter-wutu.wasm # for scripts/test-wutu-grammar.mjs
```

`node scripts/test-wutu-grammar.mjs` parses every template in the repository.
