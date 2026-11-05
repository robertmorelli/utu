# Stage -1 eviction report

## Workstreams

- W0: Already merged into main before this branch. The planned file moves and run-differential crash fix are present.
- W1: Bootstrap fallback removed; stage 0 refresh and provenance verification in progress.
- W2–W10: Pending.

## Commits

- Pending.

## Gates before W10

- Imports of stage -1: Pending.
- Bootstrap without fallback and stage0 verification: Bootstrap passes; provenance refresh pending.
- Run differentials at none, size, speed: Pending.
- Diagnostics and resolve differentials: Pending.
- Baseline handoff re-record: Pending.
- Test suites and packaging: Pending.
- X-Ray, IR, and graph replacements: Owner approved the four view removals in `.STAGE1-PLAN.md`; replacements pending.

## Measurements

- Before any `selfhost/` change on this branch: stage 2 and stage 3 both 510,153 bytes; bootstrap stage 1/2/3 took 173/214/196 ms.
- `closures.utu` build before/after: Pending; no `selfhost/` change yet.

## Remaining work

Complete W1 refresh, then W2–W9, satisfy all gates, and perform W10 deletion.
