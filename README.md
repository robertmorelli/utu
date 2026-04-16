# Utu

A compiler for the Utu language.  Utu targets WasmGC and is designed to be web-first — the compiler runs in a browser, a VS Code web worker, a VS Code desktop extension, or a plain Node/Bun CLI.

---

## Language

See [new_spec2.md](./new_spec2.md) for the full language spec.  Key features:

- scalar types: `i32 u32 i64 u64 m32 m64 m128 f32 f64 v128 bool`, `str`, `externref`, `i31`
- nullable references with `?T`; null construction via `T1.null`
- `struct` and `enum` with pipe-delimited members and nominal qualifiers `nom[tag]` / `nom[rec]`
- `proto` declarations with `get` / `set` / method members
- `fn` with optional `|self|`; associated forms `T.foo`, `P[T].foo`, `P.foo`
- `mod` parameterised by types or protocols; `&` is the promoted type inside a module
- `using` for cross-file imports and within-file aliases/instantiations
- `export lib { }` and `export main(...) { }`
- `if` / `while` / `for` with `...` / `..<` ranges, labeled blocks, `break`, `return`
- `match` on scalars, `alt` on enum variants, `promote` for nullable unwrap — default arm `~>`
- `let` binding, struct init, implicit struct init `&{ }`, `.{a, b}` tuples, `array[T]`
- `assert`, `fatal`, `\` null-fallback, `-o` pipe with `&` placeholder
- `test` / `bench` / `measure` declarations
- DSL escape: `` @es\| ... |/ ``

---

## Architecture

The compiler is split into phases.  Each phase reads the output of the previous and produces a richer version.

### Phase 1 — Parse → IR DOM

`src/compiler/parse.js` walks a web-tree-sitter parse tree and emits a [linkedom](https://github.com/WebReflection/linkedom) document.  The document root is `<ir-source-file>` and every language construct maps to a custom `ir-*` element (see [src/compiler/ir-tags.js](./src/compiler/ir-tags.js)).

This phase is purely structural — no semantic information is added.

### Analysis passes

Later passes run `document.querySelectorAll` with CSS selectors over the IR DOM and stamp computed facts onto nodes as `data-*` attributes (e.g. `data-type="i32"`, `data-binding-id="x3"`, `data-use-count="1"`).

### Rewrite passes

Rewrite passes use the stamped `data-*` attributes as additional filter criteria in CSS selectors, then apply `replaceWith` / `cloneNode` / DOM tree walking to transform the IR.

---

## Dependency injection

The compiler has no direct dependency on any file-system or network API.  All I/O is provided by the caller via `createCompiler(env)`.

```js
import { createCompiler, initParser } from 'utu';

// 1. Initialise the tree-sitter parser (host-specific).
//    initParser is a convenience helper; you can also do this manually.
const parser = await initParser({ wasmDir: '/path/to/wasm/' });

// 2. Provide a readFile function appropriate for the host.

// CLI (Node / Bun)
import { readFile } from 'fs/promises';
const compiler = createCompiler({ parser, readFile });

// VS Code extension (Node or web worker)
const compiler = createCompiler({
  parser,
  readFile: async (path) => {
    const uri = vscode.Uri.file(path);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  },
});

// Browser / vscode.dev (no fs)
const compiler = createCompiler({
  parser,
  readFile: (path) => fetch(path).then(r => r.text()),
});

// 3. Compile.
const ir = await compiler.compileFile('./hello.utu');
// or
const parsed = compiler.parseSource(`export main() void { fatal }`);
```

---

## Grammar

The tree-sitter grammar lives in `grammar/`.  Compile it with:

```sh
npx tree-sitter generate
```

The compiled outputs (`src/grammar.json`, `src/parser.c`, `src/node-types.json`) are checked in so the compiler can be used without the tree-sitter CLI.

---

## Development

```sh
bun install
bun run build
bun run test
```
