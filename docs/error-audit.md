# Error message audit

Every way a utu program can go wrong that we could find, what utu says about
it today, what it should say, and what the compiler needs in order to say it.

## The catalog

`examples/error_demo/` holds 616 small programs, one mistake each, in seven
folders:

| folder | what goes wrong | programs |
|---|---|---:|
| `syntax/` | the parser and lexer: every "expected …" path, escapes, literals, declaration forms | 95 |
| `names/` | unknown and duplicate names, imports, modules, variants, immutability | 91 |
| `types/` | type mismatches in every position, operators, methods, arity, fields, protocols | 99 |
| `control/` | nullability, `alt`/`match` exhaustiveness, `break`/`continue`/`defer`, missing values | 83 |
| `iterators/` | pipelines, `for` sources, generators, `yield`, `prune`, `await` | 79 |
| `platform/` | mems, vecs, `@es`/TypeScript bindings, `@json`, `@stored`, CSS, Wutu, `@ir`, `@wat`, `@comptime`, `@embed` | 99 |
| `runtime/` | traps and test failures from programs that compile, and CLI misuse (`runtime/README.md`) | 70 |

Each file starts with `// What:` (the mistake) and `// Expect:` (what a good
compiler would say). `examples/error_demo/messages.txt` records what the CLI
prints for every one of them, and `node scripts/test-error-messages.mjs`
(part of `bun run test`) fails when any of that changes; `--record` accepts a
change made on purpose.

## What utu says today

| verdict | messages |
|---|---:|
| good | 298 |
| unclear | 176 |
| misleading | 64 |
| accepted (compiles, but should not) | 30 |
| wrong location | 12 |
| wrong | 9 |
| missing (no diagnostic at all) | 9 |
| crash | 6 |
| wrong kind | 5 |
| duplicate | 2 |

Types are in the best shape (76 of 99 good); runtime errors in the worst (10
of 70): no trap says where in the utu source it happened, and `assert`,
`fatal`, and `--safe` bounds checks all print `unreachable`.

### Bugs found along the way

These are wrong behavior, not wording:

- **Narrow integers.** `U8`, `U16`, `I8`, and `I16` have no std module, so a
  method call on one (`b.to_i32()`) compiles to `unreachable` instead of
  reporting an unknown method. Literals are not range-checked (`let x: U8 =
  300` compiles and traps), and a `match` over them with no default arm is
  accepted and traps when nothing matches. An `I64` literal past 2^63 wraps.
- **Accepted when it should not be.** Unknown string escapes (`\d`, `\0`)
  become the next character; `?.` inside a `let` or an `if` condition is
  silently skipped; `return 1;` in a `void` function drops the value;
  duplicate `alt` arms, closure parameters, tuple names, loop captures, and
  methods are not reported; `mem m: U8 = 5;` drops its initializer;
  `&{…}` in an untyped array literal traps at run time; `min_by` accepts an
  index binding.
- **A check that never runs.** The lazy-module parameter check in
  `lazy_stub` (`selfhost/check.utu`) runs inside `type_only`, whose
  diagnostics are discarded, and the stub is cached, so it never reports.
- **No message at all.** `AltNotEnum`, `IteratorSource`,
  `IteratorTerminalInside`, `ClosureParamType`, and `ImplicitStructInit` have
  no case in `diag_text`, so the user sees the bare kind name; a `sort` with
  the wrong number of names says "expects -1 value binding(s)".
- **Crashes.** A trap in a `@comptime` initializer crashes `utu check` with a
  JavaScript stack; so do the CLI on a directory and `build -o` to a path it
  cannot write.
- **The two parsers disagree on `using X lazy from …`**: tree-sitter labels
  `lazy` as a field and the self-hosted parser does not (found by the syntax
  differential on `names/88`–`90`; the catalog is kept out of that
  differential, so this is not checked there until it is fixed).
- **Buffer reads past their length** return a stale value unless `--safe`, so
  a wrong test can pass under `utu test`.

## The redesign

`examples/error_demo/redesign.json` gives, for every program, the diagnostic
utu should print, as data: a title, marks on the source (the error, where the
requirement came from, where the value came from, related context), notes, a
fix, and for traps the utu call stack. `node scripts/show-diagnostics.mjs
[filter] [--today] [--light] [--list]` draws them in the terminal as they
would look; `--today` shows the current output above each.

The design: the title states the situation in the user's terms ("store_count
wants an I64, but local_count is an I32"); marks are tinted highlights over
the code, not underlines, colored by role and labeled below; a name keeps its
color through the title, labels, and notes; a fix is shown as the corrected
line with the edit highlighted; one mistake gives one message.

### Feasibility

Every redesign was audited for whether a compiler could produce it. A claim
is rated by what it needs where the error is raised: data at hand (159),
data recorded or computed locally (413), or new infrastructure such as trap
source maps (44). Nothing that needs reading the user's mind is left.

A fix is kept only if a named mechanism finds exactly that edit, and every
kept fix was applied to its program and checked. Of 397 fixes first
proposed, 189 remain (159 mechanical, 30 heuristic with the alternatives in a
note); the rest invented names or values, rewrote logic, or chose between
equally good edits.

| mechanism | fixes |
|---|---:|
| a fixed rewrite of a malformed utu construct | 50 |
| did-you-mean (edit distance over the names in scope) | 38 |
| other languages' spellings (`&&` → `and`, `length` → `len`) | 24 |
| adding `?` or `orelse fatal` (heuristic) | 24 |
| inserting the one expected token | 17 |
| deleting the unexpected token | 12 |
| listing the missing `alt` arms, with `fatal` bodies | 9 |
| a numeric conversion (`.to_i64()`) | 8 |
| an annotation, a CLI correction, removing a duplicate | 7 |

## What the compiler needs

In order of how many messages each change improves:

1. **Diagnostics with more than one place.** The record in `report3`
   (`selfhost/resolve.utu`) holds one node and three numbers. Related spans
   with labels, notes, and a one-line fix are needed by 360 of the 616
   redesigns; the "first declared here" nodes are usually already in hand
   where the error is raised.
2. **Where an expected type came from.** `coerce` in `selfhost/check.utu`
   knows the two types but not the parameter, annotation, field, return
   type, or first arm that set the expectation. Stage 0's type graph
   (`src/compiler/type-graph.js`) already tracks this (`edge.site`,
   `actualOrigin`).
3. **One did-you-mean helper**: edit distance over names in scope, members,
   variants, std modules, and CLI commands, with a small table of other
   languages' names.
4. **No follow-on errors**: an unresolved name or a failed pipeline stage
   yields the error type, which reports nothing further.
5. **Real messages**: text for the five kinds that have none, real errors
   where plain mistakes now say "not supported yet", and the kinds now folded
   into `type-mismatch` split out.
6. **The missing checks** listed under "Bugs found".
7. **Traps in utu terms**: function names in the Wasm (`encode_names`
   exists; the CLI never asks for it), a table from trap sites to utu spans,
   and a trap import carrying the message and the values (index, length,
   both sides of an assert).
8. **The parser**: point just after the previous token for a missing `;` or
   `:`, list every expected token, find the brace left open, and recognise
   other languages' habits (`->`, `elif`, `for x in`, `Array<I32>`).
9. **The CLI**: validate flags and arguments, and report file-system errors
   instead of printing stacks.
