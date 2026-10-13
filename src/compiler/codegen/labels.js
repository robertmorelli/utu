// Block and loop labels are unique within a function, so a branch names the
// one it means. Codegen contexts are copied freely (per function, per
// unrolled loop body), so a counter stored on a context can repeat; one
// counter per module cannot.
const COUNTERS = new WeakMap();

export function nextLabel(ctx) {
  const next = (COUNTERS.get(ctx.module) ?? 0) + 1;
  COUNTERS.set(ctx.module, next);
  return next;
}
