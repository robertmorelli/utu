# Stage -1 eviction report

## Workstreams

- W0: Already merged into main before this branch. The planned file moves and run-differential crash fix are present.
- W1: Done. The JavaScript bootstrap fallback and `--stage-1` mode are removed. `UTU_STAGE0` selects a Wasm compiler, and stage 0 now records provenance with `--verify` and `--verify-chain`.
- W2: Done. Added compiler query exports and the analysis target.
- W4: Self-hosted viewers in progress in an isolated worktree.
- W6: Done. Formatter shape now uses the self-hosted parser; the Wutu CLI and browser app builder no longer use stage -1.
- W8b: Source warnings, vec/mem, stdlib, templates, streams, and WAT assembly tests now use the self-hosted compiler.
- W8d: Foundry, JPL, control-flow and loop benchmarks, Wutu site builders, engine comparison modules, and bundle smoke test use the self-hosted compiler.
- W8a: Harness and runner migrated; suite triage continues in an isolated worktree.
- W9: Editor grammar moved to `editors/tree-sitter-utu/`; build and grammar test pass.
- W3 and W4: In progress in isolated worktrees.
- W5, W7, W8c, W10 and remaining W8a/W8b/W8d: Pending.

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
- Run differentials at none, size, speed: Pass against stage -1 baselines. Each level: 976 builds, 876 same, 100 intended, 0 unexpected differences, 0 rejected, 0 unsupported, 0 unrecorded.
- Diagnostics and resolve differentials: Diagnostics pass (1,258 builds, 0 unexpected differences, 183 intended). Resolve is red: the absent untracked `hand_written_bindings/` fixture causes a crash; with a temporary symlink to the main checkout fixture, it reports 13 differences and 25 diagnostics against an older baseline. The symlink was removed after testing.
- Baseline handoff re-record: Pending.
- Test suites and packaging: Pending. Bundle smoke test and source warning test pass.
- X-Ray, IR, and graph replacements: Owner approved the four view removals in `.STAGE1-PLAN.md`; replacement views pending.

## Measurements

- Before any `selfhost/` change on this branch: stage 2 and stage 3 both 510,153 bytes; bootstrap stage 1/2/3 took 173/214/196 ms.
- W2 change: `dist/utu.wasm` 510,153 → 512,209 bytes; `examples/closures.utu` build time 14 → 14 ms, output 424 → 424 bytes. Stage 2 and 3 remain identical.

## Remaining work

Finish remaining W3–W8 work, resolve the baseline differences, satisfy every gate, then perform W10 deletion. No stage -1 source has been deleted. No stage -1 source has been deleted.
