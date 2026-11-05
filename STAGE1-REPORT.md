# Stage -1 eviction report

## Workstreams

- W0: Already merged into main before this branch. The planned file moves and run-differential crash fix are present.
- W1: Done. The JavaScript bootstrap fallback and `--stage-1` mode are removed. `UTU_STAGE0` selects a Wasm compiler, and stage 0 now records provenance with `--verify` and `--verify-chain`.
- W2: Compiler query tables in progress in an isolated worktree.
- W4: Self-hosted viewers in progress in an isolated worktree.
- W6: Formatter and Wutu tooling in progress in an isolated worktree.
- W8b: Source warning test now uses the self-hosted compiler.
- W8d: Foundry, JPL, control-flow benchmark helper, and bundle smoke test use the self-hosted compiler.
- W3, W5, W7, W8a, W8c, W9, W10 and the rest of W8b/W8d: Pending.

## Commits

- `763a83c` Bootstrap: remove the stage -1 fallback and record stage 0 provenance.
- `ba902e7` Stage 0: first refresh under the new policy.
- `20b2cc0` Tools: migrate Foundry, JPL, and control-flow benchmarks.
- `adb3226` Tests: migrate source warning detection.
- `e5d8d69` Stage 0: record the selected recovery compiler hash.
- `7942fbb` Tests: smoke test the bundled self-hosted API.

## Gates before W10

- Imports of stage -1: Pending; 185 text matches remained before consumer migration (including references in docs and other non-runtime files).
- Bootstrap without fallback and stage0 verification: Pass. `bun run build` passed with identical stage 2/3 (510,153 bytes), `stage0.mjs --verify` passed, and the first `--verify-chain` link passed.
- Run differentials at none, size, speed: Pending.
- Diagnostics and resolve differentials: Pending.
- Baseline handoff re-record: Pending.
- Test suites and packaging: Pending. Bundle smoke test and source warning test pass.
- X-Ray, IR, and graph replacements: Owner approved the four view removals in `.STAGE1-PLAN.md`; replacement views pending.

## Measurements

- Before any `selfhost/` change on this branch: stage 2 and stage 3 both 510,153 bytes; bootstrap stage 1/2/3 took 173/214/196 ms.
- `closures.utu` build before/after: Pending. W2 measured 14 ms and 424 bytes before changes in its isolated worktree.

## Remaining work

Finish W2–W9, satisfy every gate, then perform W10 deletion. No stage -1 source has been deleted.
