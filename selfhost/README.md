# The utu compiler, in utu

A new compiler, written in utu from the start: flat data in mems, no DOM, no
string-typed facts. The JavaScript compiler (tagged `stage0`) is the
reference: every piece here is checked against what it does, and the
finished compiler must reproduce `baselines/` exactly. The plan is in
docs/self-hosting.md (Plan B).

| piece | file | checked by |
|---|---|---|
| lexer | `syntax.utu` | `scripts/selfhost-lexer-differential.mjs` |
| parser | `syntax.utu` | `scripts/selfhost-parser-differential.mjs` |

The lexer and parser share a file because both keep their data in mems, and
a mem is a top-level declaration of one program: an imported file brings
only its modules.

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
token, the token after the last, first child, next sibling. A node is made
from the nodes made since it began, which wait on a stack; giving up on a
parse truncates the mems. Keywords are compared as ids: every keyword and
every word token is interned in the source mem. A source it does not
accept fails with a thrown error, as in stage 0, which hands those to
tree-sitter for error recovery.

The differential checks that both parsers accept the same sources, and that
for each accepted one the named nodes (comments aside) are the same, in
preorder, with the same spans and depths. At `--fuzz=2000`, on four seeds,
all 1,226,613 sources agree each time. On the 24,000-line program it lexes
and parses (275,791 nodes) in 25 ms; stage 0 takes 151 ms.

Comments are tokens but not yet nodes: stage 0 attaches each to the
smallest node whose first and last tokens surround it, which the formatter
needs.
