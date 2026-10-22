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

After the first round of the redesign (did-you-mean, where an expected
type came from, other places a mistake is about, other languages' habits in
the parser, fewer follow-on errors), the messages read:

| verdict | messages |
|---|---:|
| good | 352 |
| unclear | 138 |
| misleading | 53 |
| wrong location | 9 |
| wrong | 7 |
| wrong kind | 5 |
| duplicate | 2 |

Counted by hand: each of the 157 programs whose errors, fixes, notes, or
marks changed was judged again against its redesign; the rest keep the
audit's verdict (accepted, missing, and crash cases are left out: other
work fixed many of them). 93 programs now mark a second place (3 before),
45 carry a fix (none before; 44 of them the redesign's), and 19 print more
than one error for one mistake (38 before).

Types are in the best shape (76 of 99 good); runtime errors in the worst (10
of 70): no trap says where in the utu source it happened, and `assert`,
`fatal`, and `--safe` bounds checks all print `unreachable`.

### Bugs found along the way

Wrong behavior, not wording. All fixed (3ac93b8, and the literal check after it):

- **Narrow integers.** `U8`, `I8`, `U16`, `I16` are storage types only: the
  element of a mem or vec, or an int enum's base, read as I32. As a value's
  type (local, parameter, field, `Array[U8]`) they now report `storage-type`;
  before, they compiled to `unreachable`.
- **Literals past 64 bits** (`99999999999999999999`) wrapped; now
  `integer-out-of-range`.
- **`?.` swallowed statements.** A statement with `?.` anywhere in it ran only
  when the value was present, and the search reached into nested blocks, so
  `if c { a?.f(); } else { … }` skipped the whole `if`, `else` too, and
  `let s = a?.b;` left a `Str` holding null. Now only expression and
  assignment statements are guarded, each block's on its own; in a `let` or a
  condition it is an error.
- **Accepted, now rejected:** unknown string escapes (`\d`, `\0`; `` \` ``
  `\$` `\'` stay, for templates); `return 1;` in a `void` function; duplicate
  `alt` arms, closure parameters, tuple names, captures, and methods; a mem
  initialized with a number or `@es`; `&{…}` in an untyped array literal;
  `min_by`/`max_by` with an index name (`reduce` keeps its index).
- **The lazy-module signature check** ran only when the stub was first made,
  sometimes inside `type_only`, which drops diagnostics; now at every call.
- **Crashes:** a trap in `@comptime` is now a `comptime-trap` diagnostic at the
  mem; `build -o` to an unwritable place is a `write-failed` error; the CLI on
  a directory was already handled.
- **The parsers agree on `using X lazy`**, and the catalog is back in the
  syntax differential (602 programs, all alike).
- **Buffer past its length:** checked by default (`-O small`, `fast`, `debug`
  trap); only `smallUnsafe` and `fastUnsafe` read the stale slot, by design.
- **Already fixed before:** the five kinds with no message, `sort`'s
  "expects -1 value binding(s)".

Still accepted, open: a Str passed where a host `Node` is expected
(`platform/49`); `@es` and `@ir` bodies that do not parse (`platform/28`,
`40`); Wutu CSS mistakes (`platform/81`, `90`, `99`). Accepted by choice, so
far: shadowing a parameter or outer local, assigning to a parameter or loop
capture, a non-nullable recursive variant, comparing a non-nullable to null,
and code after `return` or `break` (`names/50`, `51`, `76`, `84`, `85`;
`control/11`, `74`, `75`).

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

In order of how many messages each change improves (`selfhost/hints.utu`
now holds the first round of 1 to 5 and 8: the did-you-mean helper and its
table of other languages' names, the reasons a type is expected (`want`),
the parser's habits, and finer codes):

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
