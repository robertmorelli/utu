# The utu compiler, in utu

A new compiler, written in utu from the start: flat data in mems, no DOM, no
string-typed facts. The JavaScript compiler (tagged `stage0`) is the
reference: every piece here is checked against what it does, and the
finished compiler must reproduce `baselines/` exactly. The plan is in
docs/self-hosting.md (Plan B).

| piece | file | checked by |
|---|---|---|
| lexer | `lex.utu` | `scripts/selfhost-lexer-differential.mjs` |
| parser | `parse.utu` | `scripts/selfhost-parser-differential.mjs` |
| sources (files, imports) | `source.utu` | all of them |
| names | `resolve.utu` | `scripts/selfhost-resolve-differential.mjs` |
| checking and code | `check.utu` and the rest | `scripts/selfhost-run-differential.mjs` |
| diagnostics | `diag.utu` | `scripts/selfhost-diagnostics-differential.mjs` |
| host declarations | `abi.utu`, `foreign.utu` | the run and diagnostics differentials |
| DSLs (`@json`, `@stored`, Wutu, `@utu`, `@css`) | `dsl.utu`, `json.utu`, `stored.utu`, `wutu_parse.utu`, `wutu.utu` | the run and diagnostics differentials |
| host interface | `lib.utu` | all of them |

## Building

The compiler keeps its data in mems, and a mem is a top-level declaration
of one program (an imported file brings only its modules). So the files
are one program: `scripts/selfhost.mjs` joins those listed in `files.txt`,
in order, and compiles the result as one file. Errors name the file and
line they came from. `node scripts/selfhost.mjs --out=utu.wasm` writes the
module.

`bun run build` ships it: stage 0 builds this compiler, which builds
itself, and that build (checked to build itself to the same bytes) is
`dist/utu.wasm`, with `utu.host.json` (what it needs from its host) and
`utu.sources` (the hash of these files, so a stale build is refused).
`src/selfhost/` drives it from JavaScript; `cli/utu.mjs` is its command
line.

## Lexer

A state machine, built during compilation into a const mem: lexing is one
table load per byte in a `loop match`, writing each token's kind and byte
span into three mems (`tok_kind`, `tok_start`, `tok_end`). The host writes
the source into `src` and reads the tokens out.

Words are not classified: whether a word is a keyword, an identifier, or a
type name is the parser's decision, as is joining `std` `:` `Str` into a
platform path. Comments are tokens.

The grammar's few context-dependent tokens are decided by the token before
them. `-o`, `?.`, and compound assignments (`&=`, `<<=`, …) only follow a
finished expression (`x -o in` pipes to `in`; `type &= …` declares the self
type), so the machine has two start states, and the state a token ends in
picks the next one; words that begin an expression are paths through the
word states with their own end states. The keyword operators (`and`,
`orelse`, …) and `else` are keywords only after an expression (`assert or
>>>= 1` names `or`), a word after `.` or `?.` is always a name (`Box.new -o
f`), and after `type`, `&=` is `&` and `=` (`type &= …` declares the self
type; a variable named `type` assigned with `&=` is the one source this
lexes differently). Where the grammar's longest match
needs a step back (`1..2`, `1.5e+x`, `0x` with no digits, `?.{I32}`,
`|x|=>`), the table says so and the token ends a byte or two earlier. DSL
bodies (`/\ … \/`) nest, so they are scanned by a loop.

The differential compares the tokens with the leaves of stage 0's syntax
tree, for every `.utu` source in the repository and, with `--fuzz=N`, N
mutants of each (characters deleted, duplicated, swapped, or keywords and
operators inserted); sources stage 0 rejects must still lex to an end or an
error. At `--fuzz=1000`, all 340,963 sources stage 0 accepts lex
identically. On a 24,000-line program it lexes 0.77 MB (343,636 tokens) in
2 ms, 380 MB/s.

## Parser

Recursive descent over the tokens (comments skipped), stage 0's parser
function by function, building a tree of named nodes in mems: kind, first
token, the token after the last, first child, next sibling. Spans are in
the lexer's tokens, comments included. A node is made
from the nodes made since it began, which wait on a stack; giving up on a
parse truncates the mems. Keywords are compared as ids: every keyword and
every word token is interned in the source mem. A source it does not
accept fails with a thrown error, as in stage 0, which hands those to
tree-sitter for error recovery.

Once the tree is built, each comment becomes a node in the smallest node
whose first and last tokens surround it, among its children in order, as
stage 0 attaches them (the formatter needs them). Comments come in source
order, so one walk down the tree places them all.

The differential checks that both parsers accept the same sources, and that
for each accepted one the named nodes, comments included, are the same, in
preorder, with the same spans and depths. At `--fuzz=2000`, on four seeds,
all 1,226,613 sources agree each time. On the 24,000-line program it lexes
and parses (275,791 nodes) in 26 ms; stage 0 takes 147 ms. With a comment
on every line, 28 ms.

## Sources

A program is files: the entry, what it imports, and the standard library's
prelude. They share `src`, the token mems, and the node mems, one after
another, so a token or node id names one place in the program and a word
id one name in every file (keywords are interned first, so a keyword's id
is its `Kw`).

The compiler reads no files. The host adds each one (`file_add`, then
writes its bytes at `file_offset`), parses it, reads the paths of the
imports it names (`import_*`), and binds each to the file it adds for it,
or marks it foreign (host declarations: `std:JS`, `npm:…`).
`loadProgram` in `scripts/selfhost.mjs` is that host.

## Names

Every declaration gets an id (`decl_*`: kind, word, node, owner), and every
name node that refers to one records it (`node_decl`). Lexical scopes are a
stack of bindings: `word_top[word]` is the innermost binding of a word, and
each binding remembers the one it hides, so a lookup is one load and
leaving a scope pops back to a mark. Members (a module's types, functions,
and globals; fields; variants; methods and operators of a type) are one
hash table keyed by owner, word, and space; methods are registered before
any body is resolved.

The program scope holds every module of every file (the prelude's first,
so anything else hides them), every alias (`using M[A] |Alias|`), the
members of opened instances (`using M[A];`), and the entry file's own
declarations, with an enum's variants beside it. A module adds its type
parameters and members; functions, blocks, loops, iterator stages, arms,
catches, and closures add theirs. Names only a type settles (`x.field`,
`x.method()`) are left to type checking.

The differential compares every identifier and type name in every
program's own files with stage 0's go-to-definition, recorded in
`baselines/definitions.json.gz`: all 27,520 that resolution settles agree.
Where stage 0 answers for a node its lowerings made rather than for the
name (an iterator capture is a `let` spanning the pipeline, a module name
in a path answers for the path), the script says how it compares. On the
96,000-line program, loading, parsing, and resolving 1.1 million nodes
takes 115 ms; resolving alone, 12.

## Self-hosting

The compiler compiles itself. `scripts/selfhost-bootstrap.mjs` builds stage 1
(this source, built by stage 0, the JavaScript compiler), stage 2 (built by
stage 1), and stage 3 (built by stage 2), and checks that stages 2 and 3 are
the same bytes. Stage 0 takes 3.9 s to build the compiler; stage 2 builds it
in 38 ms. Every differential runs on any stage (`UTU_STAGE=2 node
scripts/selfhost-…`), and stage 2 agrees with stage 1 everywhere.

## Checking and code

The tree is never rewritten. Everything after names reads it and writes new
tables.

- **Types** (`types.utu`): every type is an interned id (`ty_*`), so types
  compare as ints: a named type is a declaration and a module instance
  (`Array[I32]` is Array's promoted type in the instance `Array[I32]`);
  nullable, tuple, `fun`, and `cl` types are built from ids. Instances
  (`inst_*`) are interned the same way. A type's wasm representation comes
  from the declarations: a module's `type & = @ir/\ <ir-wasm-scalar
  type-repr="wasm-i32"/> \/` says what `I32` is.
- **Checking** (`check.utu`, with `control.utu`, `data.utu`, `enums.utu`,
  `mems.utu`, `strings.utu`, `host.utu`): monomorphization on demand. Each
  function is checked once per instance it is reached in, against the types
  its module's arguments give it, and translated as it is checked into a
  wasm-shaped IR (`w_*`): typed nodes, children built before parents.
  Expected types flow down (literals, `null`, `&{…}`, array literals read
  them); a statement is checked as Void, so its value is dropped. Every
  function of the program's own files is checked, reached or not; the
  standard library's when reached. Diagnostics are collected, and the
  error type that follows one stops cascades (it never appears without
  one).
- **Rules about declarations** (`validate.utu`): duplicates, nullable
  scalars, tuples, `fun` fields, recursive structs, integer enum values,
  distinct bases, global initializers.
- **Intrinsics** (`ir.utu`): a function whose body is `@ir/\ … \/` (std's
  operators, conversions, array and string access) is expanded where it is
  called; its XML is parsed once into a small tree.
- **Generated sources** (`gen.utu`): what is easiest to say in utu is said in
  utu. A byte mem's interner (stage 0's, so ids match) and each `@comptime`
  mem's evaluation are written as source, added as a file, and resolved and
  checked like the rest.
- **@comptime**: a build for Target.Comptime exports the generated functions
  that evaluate each expression into a mem; the host runs it and gives the
  values back, which fill the mems as data segments.
- **Encoding** (`wasm.utu`): a sweep from the exports finds the functions
  and globals reached, and a second the types they use (a generic's unused
  instances, an environment nothing captures, are left out); indices are
  assigned (imports first) and only that is encoded. Struct and array types
  live in one recursion group, so casts tell them apart; a function type of
  plain values needs no identity and is encoded on its own. A block or loop
  nothing branches to is encoded as its contents.
- **Size builds** (`optimize.utu`, the default, as stage 0's `-Oz`): host
  member operations share one import per shape (`(self,k) => self[k]`, the
  name a string constant); stage 0's local cleanup (copies, temporaries,
  unused locals) runs on every function; a `match` takes a `br_table` only
  when that is the smaller. Iterator pipelines fuse across a `collect` whose
  stages cannot tell, and a captured variable is boxed only when a write
  could be seen after the capture, both as in stage 0.
- **The host contract** (`host.utu`): what the module needs from its host
  (`@es` bodies, closures, promises, hosted mems) is a JSON spec given
  beside the module, not in it; `src/selfhost/loader.js` writes the least
  JavaScript that provides it.

## How far it is

`scripts/selfhost-run-differential.mjs` builds every program in
`examples/`, `benchmarks/`, and `baselines/corpus` (for its exports and its
tests), runs each zero-argument export and test, and compares what it does
with what stage 0's builds did (`baselines/run-differential.json`). 946 of
948 builds behave the same, and none differs; the other two differ on
purpose, where stage 0 builds a module given too few type arguments.

`scripts/selfhost-diagnostics-differential.mjs` does the same for programs
that do not build: for those programs and the negative corpus, every
diagnostic's kind, message, and span must be stage 0's
(`baselines/diagnostics.json.gz`). 1202 of 1234 builds diagnose the same,
and none differs. The others differ on purpose: a program that does not parse
is reported at the furthest token the parser reached, with what it wanted
there (`Syntax error: expected ';', got 'x'`), where stage 0 reported
tree-sitter's error recovery as `Parse error at 3:5`; and a few of stage
0's quirks are listed in the script with what this compiler does instead.

A diagnostic is recorded as a kind, a node, and up to four arguments (a
word, types, counts, declarations); `diag.utu` makes its name, message, and
span when the host asks for them. As in stage 0, a missing import or a file
that does not parse ends the build, any other mistake does not stop
checking, and a mismatch that follows from another (a local typed by a
mistaken initializer) is counted under it: `(+1 caused by this)`.

The check is behavior, not bytes: the compiler is a new design, so its
wasm differs from stage 0's, but what every program does must not. It is
smaller: of the 280 programs both compilers build, 252 are smaller at -Oz,
25 the same, and 3 larger by at most 3 bytes; 648,426 bytes in all against
stage 0's 762,646 (15% less), built in a third of the time.

## Host declarations

`using Browser from std:Browser` (std:JS, std:Web, `npm:`, `node:`) reads
the declaration ABI (docs/typescript-abi.md) the host passes as JSON text:
a document's types once, and a view of it per import (std:JS and
std:Browser share one). Nothing is parsed into a tree. A reference is an
offset into the JSON with an environment of generic bindings, so `Map<K,
V>` is Map's declaration with K and V bound, never a copy; a named
declaration is closed (it sees only its own parameters' bindings). A host
value's type is a foreign type whose identity is its canonical spelling:
a standard library type by name, so a package's `Node` is the browser's.

Operations are imports whose JavaScript is stage 0's, so a program does
what its stage 0 build did, down to the errors the host throws: member
reads and writes, calls (overloads chosen as stage 0 chooses them;
generics bound from arguments, callbacks' results, string literals for
`keyof` parameters, and the expected type), `new`, index reads and
writes, records and arrays for declaration slots, identity comparison,
the declared String and Number members of Str and F64, dynamic values read
as primitives (checked with typeof), `await` on host promises, and `alt`
narrowing with `instanceof`. A mem that `copy_in` or `view` reaches is the
host's.

## DSLs

`@json`, `@stored`, Wutu (`@wutu`), `@utu`, and `@css` expand into utu
source, as in stage 0, function by function: the text is parsed as a
generated file and grafted into the tree before names are resolved (the
expression in place of the site, the declarations first in its module or
file). Utu written in a DSL body is not copied: the expansion holds a
placeholder, which becomes a splice of the expression parsed from the body
itself, so it keeps its place in the source and its surface. Mistakes in
generated code are reported at the site (a `bind:` statement's, at the
statement), and a DSL that does not expand ends the build with its one
diagnostic, as in stage 0.
