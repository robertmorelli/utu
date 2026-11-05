# The self-hosted compiler and stage 0

utu's compiler is written in utu (`selfhost/*.utu`, see selfhost/README.md)
and ships as `dist/utu.wasm`, driven by `src/selfhost/*.js`. It builds
itself. How it got here (Plan A, the JavaScript compiler made fast; Plan B,
its port to utu) is in docs/history/self-hosting-plan.md. The JavaScript
compiler, stage -1, is deleted; the tag `stage-1-final` is its last commit.

## The bootstrap

`stage0/utu.wasm` (with `stage0/utu.host.json`) is a checked-in build of
the compiler. `bun run build` uses it to build stage 1 from `selfhost/`;
stage 1 builds stage 2; stage 2 builds stage 3; stages 2 and 3 must be
identical, Wasm and host spec (`scripts/selfhost-bootstrap.mjs`, part of
`bun run test`). Stage 2 is `dist/utu.wasm`. There is no JavaScript
fallback. For recovery, `UTU_STAGE0=/path/to/utu.wasm` selects another
compiler (a development `dist/utu.wasm`, or an older stage 0 from git
history) and its adjacent `.host.json`.

## Stage 0

`stage0/stage0.json` records where stage 0 came from: its source commit and
`selfhost/` tree, the sources' hash, its own hash and size, the hash of the
stage 0 that built it, the Node version, the date, and why it was
refreshed.

- `node scripts/stage0.mjs --verify` (in `bun run test`) rebuilds the
  recorded commit's `selfhost/` (read from git, nothing written) with the
  checked-in stage 0 and requires the same bytes, spec included: stage 0 is
  reproducible from what it records about itself.
- `--verify-chain` walks `git log -- stage0/` and rebuilds each recorded
  refresh with the stage 0 before it, a trust chain back through history
  (it begins with the first refresh that recorded provenance).
- `node scripts/stage0.mjs --reason "…"` refreshes it: it refuses unless the
  compiler's sources are committed, bootstraps, requires the fixed point,
  writes stage 2 and `stage0.json`, and prints the commit message
  (`stage0: refresh to <commit> (<reason>)`). Only this script writes
  `stage0/`.

When to refresh:

- **Required** when `selfhost/` needs something stage 0 lacks (a language
  feature, a compiler fix, a change to `lib.utu`'s host interface): the
  bootstrap fails. In separate commits, as Zig does: (1) add the feature to
  the compiler without using it in `selfhost/`; (2) refresh stage 0 from
  commit 1; (3) start using it.
- **Optional** when stage 0 is more than about 200 commits behind, or the
  bootstrap gets noticeably slower. Never refresh in a commit that also
  changes `selfhost/`.
- The driver (`src/selfhost/compiler.js`) must work with an older stage 0's
  exports by feature detection (as `set_move_limit?.` does). If it cannot,
  that is a required refresh.

## Keeping it honest

`bun run test` holds the compiler to its own goldens (baselines/README.md):
what every program does when run at every optimization level, its
diagnostics, its wasm fingerprints, its sizes (never more than a few bytes
larger, and smaller than stage -1's builds in sum), and the editor's
answers at every name. The lexer and parser are held to the editors'
grammar, tree-sitter-utu (`editors/tree-sitter-utu`), on every source and on
mutants. Re-record a golden only for a deliberate change, and say so in the
commit.

Until the handoff ("baselines: recorded by the self-hosted compiler"),
those goldens were stage -1's, and every program behaved, diagnosed and
resolved names as stage -1 did, or differed on purpose with the reason
written down.

## What stays in JavaScript

- The TypeScript `.d.ts` linker (`tools/dts`), which uses TypeScript's own
  compiler; the compiler reads the JSON ABI it produces.
- The hosts: the CLI (`cli/`), the language server and the VS Code
  extension, the web playground, and file and process I/O, all through
  `src/selfhost/`.
