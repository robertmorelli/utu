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
equivalent hand-written loop compiles to. There is no loop restructuring,
so `-Oz` binaries are 10-25% larger than Binaryen's were.

Before those rewrites, and again after them (a value moved into place may
meet a constant), constants are folded (`selfhost/optimize.utu`, in every
build but debug): an `i32` or `i64` operation of constants is its value,
computed as wasm does (wrapping, shift counts mod the width; a division or
remainder only by a positive constant, so a trap stays a trap); `(x + 3) + 4`
is `x + 7` and `(14 - x) + 4` is `18 - x`; `x + 0`, `x * 1`, `x & -1` and
the like are x, and `x * 0`, `x & 0` are 0 when x has no effects; a global
never assigned is its value; an `if`, `select` or `br_if` on a constant
takes its one way. Floats are not folded.

## Inlining that shrinks

At `-O small` (and `smallUnsafe`) a call becomes its callee's body where
the body encodes to no more bytes than the call (`selfhost/inline.utu`).
Sizes are bounds (a copy's the most it can take, the call's the least), so
no copy grows the module. Those callees have no locals, loops, `return`s or
`try`, and no local is added: a parameter the body reads first is its
argument, already on the stack; one passed a local reads that local; one
passed a constant reads it in place.

Then every function called from one place, and used nowhere else, moves
there whatever its body holds, as `wasm-opt -Oz` does: its header, its type's
use and the call go. Its parameters and locals become the caller's (the
arguments, in order, set the parameters; one never assigned reads a local or
small constant argument in place), its labels follow the caller's, and a
`return` leaves a block around it. Moves chain, callers first, in one pass.
The merged locals pack: a local set before it is read in a loop does not
hold its slot through the loop, and a local stored once with a small
constant is that constant. DeltaBlue goes from 54 functions to 39 (Binaryen:
36), the compiler from 2601 to 1426, 2.7% fewer bytes; DeltaBlue runs 11%
faster and Richards 17%.

An exported function, or one used as a value, stays (its calls inline only
where each alone shrinks); recursive calls and calls a lowering made stay
calls. A trap in a copy or a moved body still names the callee's line,
`(inlined into main)`. Copies at several calls, each bigger than the call,
are not made: they shifted V8's own inlining (DeltaBlue 6% slower).

## Inlining for speed

At `-O fast` (and `fastUnsafe`) a call becomes its callee's body when the
callee is small (300 IR nodes, after its own calls are inlined), when the
call is inside a loop (2000), or when it is the callee's only call (2000).
The callee's parameters and locals become the caller's. Bigger copies at
calls outside loops made DeltaBlue's module twice the size for no speed.

A `for` over a range is unrolled four ways only when its body, with each
direct call counted as its callee's body (as inlining will paste it into
every copy), is at most 48 IR nodes: a loop around a call to a function
with its own loop is not unrolled. DeltaBlue's module went from 45 KB to
11 KB at the same speed.

## Structs returned as their fields

At `-O small` and `-O fast` (and their unsafe forms), a function that
returns a struct it makes returns the struct's fields instead, as Wasm
multi-value results (`selfhost/inline.utu`). Every return must be a
`struct.new` of the result type, a call to another such function, or a local
that holds one and is read only for its fields; generic instances
(`Pair[I32]`, a `Result[T, E]`) count like any struct. The function gets a
twin returning the fields, and becomes a wrapper making the struct from
them, kept only for `fun` values, exports, and tail calls. Direct calls call
the twin:

- a result held in a local read only for its fields is those fields, in
  locals: nothing is allocated;
- a dropped result is the fields, dropped;
- elsewhere (stored, passed on, captured, compared by reference, returned
  from a function that does not return fields) the call makes the struct
  from the fields.

Structs are references, but nothing outside the function ever held this
one, so making it at the call cannot be seen: an alias made after the call
aliases the struct made there. A function that keeps the struct (stores it,
passes it on) before returning it is left as it is. A function returns
fields only where some direct call gains by it; at `-O small`, only where
calls that allocate nothing outnumber calls that make the struct and no
wrapper is kept, so the module does not grow. A point stepped and a
`divmod` pair returned in a hot loop (both recursive, so never inlined) run
about 15% faster and the module is 14% smaller; the programs in
benchmarks/ have no such calls and build as before.

## Checks

- `scripts/run-differential.mjs`: every program's behavior when run (each
  zero-argument export and test), recorded with Binaryen at `-O0`, `-Oz`,
  and `-O3`. The backend matches all 948 builds at every level.
- `scripts/wasm-fingerprints.mjs`: the bytes of every build, re-recorded
  when the backend replaced Binaryen.
- The suite, which runs programs and inspects their text.

## Size blame

`utu build app.utu --blame` writes `app.blame.json` and `app.blame.html` beside the module and prints the top of each list: sections, declarations, lines, functions, files, shared helpers, inlined callees, and the buckets with no source. Every byte is blamed once (the tests check the records tile the file): code by the source map, with locals and body sizes on the function, inlined copies on the callee's line and their call; a compiler helper (`array.slice`, `mem.push`, `Tag.from_i32`, …) split among its calls; types, imports, globals, data and exports on the declaration that made them (else where first needed, a string constant on its literal); headers, counts and custom sections in named buckets. `@es` glue is blamed per binding, before bundling. Brotli shares are estimates (one stream flushed per 2 KB chunk, scaled to the real total). Asking for blame changes nothing built. `node scripts/blame-compiler.mjs` blames the compiler itself, checking the rebuild equals `dist/utu.wasm`. Implementation: `selfhost/blame.utu`, `src/selfhost/blame.js`.
