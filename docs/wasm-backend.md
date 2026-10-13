# The wasm backend

`src/compiler/wasm/` turns the module codegen builds into wasm bytes. It
replaced Binaryen: the compiler no longer depends on it, emitting is 10-40x
faster (the foundry app at `-Oz`: 4.4 s to 0.1 s), and the whole path from
source to bytes is utu's own, so it can be ported to utu (docs/self-hosting.md).

| file | what |
|---|---|
| `types.js` | value types, heap types, rec groups; interning and subtyping |
| `module.js` | the module and its expression builders, typed as codegen expects |
| `encode.js` | the binary: what the exports reach, sections, code, source maps |
| `optimize.js` | local cleanup at `-Oz` and `-O3` |
| `text.js` | the wasm text format, for tests and the editor |
| `index.js` | `wasm`: what codegen uses, under Binaryen's names |

## Types

Every type is one object, so types compare with `===`: numeric types are
constants, references are interned by heap type and nullability, and a
tuple (a multi-value result) by its parts. Structs, arrays, and function
signatures are built with a `TypeBuilder` and canonicalized by structure,
rec group by rec group, as wasm's iso-recursive type system does: building
the same group twice gives the same types. So a function's type and the
`fun(…)` type it is called through are one type, as the engine sees them.

## Expressions

Codegen was written against Binaryen's JS API (`m.i32.add(a, b)`,
`m.block(name, children, type)`, `m.local.get(i, type)`, …) and `module.js`
keeps that interface. Codegen reads expression types back to decide what to
drop, so each expression is typed as Binaryen types it:

- an expression with an operand that does not complete is `unreachable`;
- a block takes its last child's type, or meets the values branched to it,
  and is `unreachable` when a child is and nothing branches to it;
- an `if` meets its arms; a null is typed by the bottom of its hierarchy;
  a cast keeps its operand's non-nullness.

Every expression records the labels branched to from inside it, so a block
knows its branch types without a search, and a block nothing branches to is
emitted without a label.

## Encoding

Only what the exports reach is emitted: functions, imports, globals, and
tags no exported function uses are left out, as are the types nothing uses.
(Binaryen's sweep had to be skipped for modules mixing GC, i31, and SIMD;
this one always runs.) Functions used as values are declared in an element
segment. Unnamed blocks are emitted as their contents; code after an
expression that does not complete is left out; a structured instruction
that does not complete is followed by `unreachable`. A tuple-typed local is
one wasm local per part, and `tuple.extract` keeps one scratch local per
part type. Exceptions use the legacy `try`/`catch` encoding with the host's
`WebAssembly.JSTag`.

`emitBinary` has the engine validate the bytes (`WebAssembly.validate`) and
throws with the engine's message when they are invalid. With a source map
URL, debug locations become a version 3 source map whose columns are byte
offsets in the module.

## Strings

`Str` is a JavaScript string held as `externref`. String operations call the
JS string builtins (`wasm:js-string`: `concat`, `length`, `substring`,
`charCodeAt`, `equals`, `fromCodePoint`, `fromCharCodeArray`) with exactly
the signatures engines check, and string constants are immutable
`(ref extern)` globals imported from the `'` module, so an engine given
`JS_STRING_BUILTINS_COMPILE_OPTIONS` provides them all natively. A constant
that is not valid UTF-16 cannot be an import name; it is built from its code
units. This is the shape Binaryen's string lowering produced, so hosts are
unchanged; there is no stringref mode.

## The local cleanup

At `-Oz` and `-O3`, `optimize.js` removes the copies and temporaries
lowerings leave, function by function:

- a local set once, to a parameter that is never assigned, is that
  parameter;
- a local set once to a pure value and read once in the next statement,
  outside any loop and before anything assigns what the value reads, is that
  value;
- a local never read is not stored (its value is kept when it has effects)
  and is no longer declared.

Every local codegen creates is set before it is read, which is what makes
the first two sound. With it, a consumed generator compiles to what the
equivalent hand-written loop compiles to. There is no inliner and no loop
restructuring, so `-Oz` binaries are 10-25% larger than Binaryen's were.

## Checks

- `scripts/run-differential.mjs`: every program's behavior when run (each
  zero-argument export and test), recorded with Binaryen at `-O0`, `-Oz`,
  and `-O3`. The backend matches all 948 builds at every level.
- `scripts/wasm-fingerprints.mjs`: the bytes of every build, re-recorded
  when the backend replaced Binaryen.
- The suite, which runs programs and inspects their text.
