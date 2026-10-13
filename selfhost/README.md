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
| host interface | `lib.utu` | all of them |

## Building

The compiler keeps its data in mems, and a mem is a top-level declaration
of one program (an imported file brings only its modules). So the files
are one program: `scripts/selfhost.mjs` joins those listed in `files.txt`,
in order, and compiles the result as one file. Errors name the file and
line they came from. `node scripts/selfhost.mjs --out=utu.wasm` writes the
module.

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
