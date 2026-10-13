# The utu compiler, in utu

A new compiler, written in utu from the start: flat data in mems, no DOM, no
string-typed facts. The JavaScript compiler (tagged `stage0`) is the
reference: every piece here is checked against what it does, and the
finished compiler must reproduce `baselines/` exactly. The plan is in
docs/self-hosting.md (Plan B).

| piece | file | checked by |
|---|---|---|
| lexer | `lexer.utu` | `scripts/selfhost-lexer-differential.mjs` |

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
word states with their own end states. Where the grammar's longest match
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
