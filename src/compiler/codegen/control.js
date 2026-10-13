// codegen/control.js — branching IR → wasm
//
// Lowering targets, per spec discussion:
//
//   ir-if         →  wasm `if/else`
//   ir-while      →  wasm `loop` + `br_if`
//   ir-for        →  wasm locals + `loop` + range comparison
//   ir-return     →  wasm `return`
//   ir-break      →  wasm `br` to the enclosing while-block
//   ir-continue   →  wasm `br` to the loop's next-iteration label
//   ir-loop-match →  wasm `loop` + `br_table`, state in a local
//   ir-match      →  wasm `br_table`           (literal scalar dispatch)
//   ir-alt[tag]   →  wasm `br_table`           (enum-tag dispatch)
//   ir-alt[rec]   →  wasm `br_on_cast` chain   (subtype dispatch)
//   ir-promote    →  wasm `br_on_null`         (nullable unwrap)
//
// What runs today: if / while / return / break / match / promote.
// Supported rec-alt is lowered earlier to ordinary control-flow IR, so any
// ir-alt reaching this file is a residual unsupported case.

import { wasm } from './types.js';
import { nextLabel } from './labels.js';
import { emitDeferred } from './bindings.js';
import { childOf, childrenOf } from '../ir-helpers.js';

/** Deferred code of blocks opened inside the loop at `depth` (default: innermost), which a jump leaves. */
function loopDeferred(ctx, emitExpr, depth = ctx.loops?.length ?? 0) {
  return emitDeferred(ctx, (ctx.defers ?? []).filter(frame => frame.loopDepth >= depth), emitExpr);
}

/** Wrap a branch so the deferred statements run first; the branch stays last. */
function afterDeferred(m, deferred, exit) {
  return deferred.length ? m.block(null, [...deferred, exit], wasm.unreachable) : exit;
}

// ── if / else ────────────────────────────────────────────────────────────────
//
// IR:  <ir-if><cond/><then-block/>[<else-block-or-if/>]</ir-if>
// Wasm: (if (result T) cond then else)
export function emitIf(node, ctx, emitExpr) {
  const [cond, thenBlock, elseBranch] = [...node.children];
  const m = ctx.module;
  let thenExpr = emitExpr(thenBlock, ctx);
  let elseExpr = elseBranch ? emitExpr(elseBranch, ctx) : undefined;
  // Branches whose values cannot meet (a value vs. none, or unrelated scalars)
  // are statements: their values are discarded rather than merged.
  const type = expr => wasm.getExpressionType(expr);
  const valued = expr => ![wasm.none, wasm.unreachable].includes(type(expr));
  const scalar = expr => [wasm.i32, wasm.i64, wasm.f32, wasm.f64, wasm.v128].includes(type(expr));
  const discard = expr => valued(expr) ? m.drop(expr) : expr;
  if (!elseExpr) thenExpr = discard(thenExpr);
  else if (valued(thenExpr) !== valued(elseExpr) && type(thenExpr) !== wasm.unreachable && type(elseExpr) !== wasm.unreachable
    || valued(thenExpr) && valued(elseExpr) && type(thenExpr) !== type(elseExpr) && (scalar(thenExpr) || scalar(elseExpr))) {
    thenExpr = discard(thenExpr); elseExpr = discard(elseExpr);
  }
  return m.if(emitExpr(cond, ctx), thenExpr, elseExpr);
}

// ── try / catch ─────────────────────────────────────────────────────────────
//
// IR:   <ir-try><body/><handler/></ir-try>, the handler optionally starting
//       with `let e = <ir-caught/>`
// Wasm: (try (do body) (catch $js_tag handler)), where $js_tag is the host's
//       WebAssembly.JSTag imported as utu.js_tag and <ir-caught/> is its pop.
export const JS_TAG = '__utu_js_tag';
const tagged = new WeakSet();

export function emitTry(node, ctx, emitExpr) {
  const m = ctx.module;
  if (!tagged.has(m)) {
    m.addTagImport(JS_TAG, 'utu', 'js_tag', wasm.externref, wasm.none);
    tagged.add(m);
  }
  const [body, handler] = [...node.children];
  let bodyExpr = emitExpr(body, ctx);
  let handlerExpr = emitExpr(handler, ctx);
  // An unnamed exception is still on the stack and must be popped.
  if (!handler.querySelector(':scope > ir-let > ir-caught')) {
    handlerExpr = m.block(null, [m.drop(emitCaught(m)), handlerExpr], wasm.getExpressionType(handlerExpr));
  }
  const type = expr => wasm.getExpressionType(expr);
  if (ctx.typeOf(node) === 'void' || !ctx.typeOf(node)) {
    if (![wasm.none, wasm.unreachable].includes(type(bodyExpr))) bodyExpr = m.drop(bodyExpr);
    if (![wasm.none, wasm.unreachable].includes(type(handlerExpr))) handlerExpr = m.drop(handlerExpr);
  }
  return m.try(null, bodyExpr, [JS_TAG], [handlerExpr], null);
}

export function emitCaught(m) {
  return m.pop(wasm.externref);
}

/** A loop body is a statement: whatever value its last expression has is dropped. */
function discardValue(m, expr) {
  const type = wasm.getExpressionType(expr);
  return type === wasm.none || type === wasm.unreachable ? expr : m.drop(expr);
}

// ── while ───────────────────────────────────────────────────────────────────
//
// IR:  <ir-while><cond/><body/></ir-while>
// Wasm:
//   (block $brk
//     (loop $cnt
//       (br_if $brk (i32.eqz cond))
//       body
//       (br $cnt)))
export function emitWhile(node, ctx, emitExpr) {
  if (!node.attr('data-loop-label')) {
    const counted = countedWhile(node, ctx);
    if (counted) return emitUnrolledWhile(counted, ctx, emitExpr);
  }
  const [cond, body] = [...node.children];
  const m = ctx.module;
  const label = nextLabel(ctx);
  const brk = `__while_brk_${label}`;
  const cnt = `__while_cnt_${label}`;

  // Push the labels so a nested ir-break / ir-continue can find them. In a
  // while loop, the next iteration starts by re-testing the condition.
  ctx.loops ??= [];
  // A compiler-generated loop may carry a label for targeted breaks (generators).
  ctx.loops.push({ brk, cnt, next: cnt, label: node.attr('data-loop-label') ?? null });
  try {
    const exitIfFalse = m.br(brk, m.i32.eqz(emitExpr(cond, ctx)));
    const bodyExpr    = discardValue(m, emitExpr(body, ctx));
    const loop = m.loop(cnt, m.block(null, [exitIfFalse, bodyExpr, m.br(cnt)], wasm.none));
    return m.block(brk, [loop], wasm.none);
  } finally {
    ctx.loops.pop();
  }
}

export function emitFor(node, ctx, emitExpr) {
  const sources = [...childrenOf(node, 'ir-for-source')];
  const capture = childOf(node, 'ir-capture');
  const body = childOf(node, 'ir-block');
  const names = (capture?.getAttribute('names') ?? '').split(',').filter(Boolean);
  if (!sources.length || (names.length && names.length !== sources.length) || !body) {
    throw new Error('codegen: for requires either no captures or one capture for each range source');
  }

  const m = ctx.module;
  const ranges = sources.map((source, index) => {
    const [start, end] = [...source.children];
    const typeName = ctx.typeOf(start) ?? ctx.typeOf(end);
    if (!['I32', 'U32', 'I64', 'U64'].includes(typeName)) {
      throw new Error(`codegen: for range type ${JSON.stringify(typeName)} is not supported (expected an integer scalar)`);
    }
    const type = ctx.toType(typeName);
    const cursorIndex = ctx.addLocal(typeName);
    const endIndex = ctx.addLocal(typeName);
    if (capture && names[index]) ctx.locals.set(`${capture.id}:${names[index]}`, { index: cursorIndex, type });
    if (capture && sources.length === 1) ctx.locals.set(capture.id, { index: cursorIndex, type });
    return {
      source, start, end, typeName, type, cursorIndex, endIndex,
      width: typeName.endsWith('64') ? 'i64' : 'i32',
      unsigned: typeName.startsWith('U'),
      inclusive: source.getAttribute('op') === '...',
    };
  });

  const label = nextLabel(ctx);
  const brk = `__for_brk_${label}`;
  const cnt = `__for_cnt_${label}`;
  // `continue` leaves the body but still runs the bound checks and increments.
  const next = `__for_next_${label}`;
  const cursor = range => m.local.get(range.cursorIndex, range.type);
  const bound = range => m.local.get(range.endIndex, range.type);
  const condition = range => {
    const compare = range.inclusive
      ? (range.unsigned ? 'le_u' : 'le_s')
      : (range.unsigned ? 'lt_u' : 'lt_s');
    return m[range.width][compare](cursor(range), bound(range));
  };

  if (shouldUnroll(node, ranges, body, ctx)) return emitUnrolledFor(ranges[0], body, { brk, cnt, label }, ctx, emitExpr);

  ctx.loops ??= [];
  ctx.loops.push({ brk, cnt, next });
  try {
    const bodyExpr = m.block(next, [discardValue(m, emitExpr(body, ctx))], wasm.none);
    const exits = ranges.map(range => m.br(brk, m.i32.eqz(condition(range))));
    // A zip loop ends when any inclusive source reaches its bound. Exiting
    // before increment also prevents MAX_VALUE from wrapping forever.
    const inclusiveExits = ranges.filter(range => range.inclusive)
      .map(range => m.br(brk, m[range.width].eq(cursor(range), bound(range))));
    const increments = ranges.map(range => m.local.set(range.cursorIndex,
      m[range.width].add(cursor(range), m[range.width].const(range.width === 'i64' ? 1n : 1))));
    const loop = m.loop(cnt, m.block(null, [
      ...exits,
      bodyExpr,
      ...inclusiveExits,
      ...increments,
      m.br(cnt),
    ], wasm.none));
    return m.block(brk, [
      ...ranges.flatMap(range => [
        m.local.set(range.cursorIndex, emitExpr(range.start, ctx)),
        m.local.set(range.endIndex, emitExpr(range.end, ctx)),
      ]),
      loop,
    ], wasm.none);
  } finally {
    ctx.loops.pop();
  }
}

// ── for, unrolled (-O3) ─────────────────────────────────────────────────────
//
// Engines do not unroll wasm loops, and with WasmGC every array.get keeps its
// bounds check, so the loop's own compare-and-branch is a large share of a
// small body. At -O3 a counted loop with a small body runs four iterations per
// trip while at least four remain, then single steps:
//
//   (block $brk (loop $cnt
//     (br_if $brk (i >= end))
//     (if (end - i >=u 4)
//       (then step step step step (br $cnt)))   ;; each step: body, i += 1
//     step (br $cnt)))
//
// end - i is exact as an unsigned value whenever i < end. Each copy of the
// body has its own `continue` label, so continue still skips one element.
const UNROLL = 4;
const UNROLL_MAX_BODY_NODES = 64;

// Unrolling pays when loop overhead is a large share of the body. It does
// not for bodies dominated by allocation or by multiway branching (measured:
// slicing and Found-promotion bodies got slower on V8).
const UNROLL_BLOCKERS = 'ir-while, ir-for, ir-loop-match, ir-promote, ir-match, ir-alt, ir-struct-init, ir-array-lit, ir-closure';
const ALLOCATING_METHODS = new Set(['slice', 'get_slice', 'new', 'new_default', 'copy_from', 'push']);

function shouldUnroll(node, ranges, body, ctx) {
  return ctx.optimize === 'speed' && ranges.length === 1 && !ranges[0].inclusive && unrollableBody(body);
}

/** Small, non-allocating, non-looping bodies, where loop overhead matters. */
function unrollableBody(body) {
  if (body.querySelector(UNROLL_BLOCKERS)) return false;
  const allocates = [...body.querySelectorAll('ir-type-member, ir-field-access')]
    .some(callee => ALLOCATING_METHODS.has(callee.getAttribute('method') ?? callee.getAttribute('field')));
  return !allocates && body.querySelectorAll('*').length <= UNROLL_MAX_BODY_NODES;
}

// ── while, unrolled when counted (-O3) ──────────────────────────────────────
//
//   while (i < n) { …; i += 1; }
//
// where the body leaves i and n alone apart from that final increment, has no
// `continue`, and declares nothing named i or n. Then n - i iterations remain
// at the top of every trip, so the body (increment included) can run four
// times whenever n - i >= 4. i stays the real variable, so its value after the
// loop is exactly what the plain loop leaves.
const INTEGER_WIDTH = { I32: 'i32', U32: 'i32', I64: 'i64', U64: 'i64' };

function countedWhile(node, ctx) {
  if (ctx.optimize !== 'speed') return null;
  const [cond, body] = [...node.children];
  if (cond?.localName !== 'ir-call' || cond.attr('data-operator-name') !== 'lt' || body?.localName !== 'ir-block') return null;
  const [counter, limit] = [...(childOf(cond, 'ir-arg-list')?.children ?? [])];
  if (counter?.localName !== 'ir-ident' || limit?.localName !== 'ir-ident') return null;
  const type = ctx.typeOf(counter);
  if (!INTEGER_WIDTH[type] || ctx.typeOf(limit) !== type) return null;
  const names = new Set([counter.getAttribute('name'), limit.getAttribute('name')]);
  const step = body.lastElementChild;
  const [target, value] = [...(step?.children ?? [])];
  const [base, one] = [...(value?.querySelector(':scope > ir-arg-list')?.children ?? [])];
  const increments = step?.localName === 'ir-assign' && target?.localName === 'ir-ident' && target.getAttribute('name') === counter.getAttribute('name')
    && value?.localName === 'ir-call' && value.attr('data-operator-name') === 'add'
    && base?.localName === 'ir-ident' && base.getAttribute('name') === counter.getAttribute('name')
    && one?.localName === 'ir-lit' && one.getAttribute('value') === '1';
  if (!increments || !unrollableBody(body)) return null;
  const touches = [...body.querySelectorAll('ir-assign')].some(assign => assign !== step
    && assign.firstElementChild?.localName === 'ir-ident' && names.has(assign.firstElementChild.getAttribute('name')));
  const shadows = [...body.querySelectorAll('ir-let[name]')].some(binding => names.has(binding.getAttribute('name')));
  if (touches || shadows || body.querySelector('ir-continue, ir-make-closure')) return null;
  return { cond, body, counter, limit, width: INTEGER_WIDTH[type], unsigned: type.startsWith('U') };
}

function emitUnrolledWhile(loop, ctx, emitExpr) {
  const m = ctx.module;
  const ops = m[loop.width];
  const label = nextLabel(ctx);
  const brk = `__while_brk_${label}`, cnt = `__while_cnt_${label}`;
  ctx.loops ??= [];
  ctx.loops.push({ brk, cnt, next: cnt, label: null });
  try {
    const step = () => discardValue(m, emitExpr(loop.body, ctx));
    const four = Array.from({ length: UNROLL }, step);
    const single = step();
    const remaining = ops.sub(emitExpr(loop.limit, ctx), emitExpr(loop.counter, ctx));
    const enough = ops.ge_u(remaining, ops.const(loop.width === 'i64' ? BigInt(UNROLL) : UNROLL));
    return m.block(brk, [m.loop(cnt, m.block(null, [
      m.br(brk, m.i32.eqz(emitExpr(loop.cond, ctx))),
      m.if(enough, m.block(null, [...four, m.br(cnt)], wasm.none)),
      single,
      m.br(cnt),
    ], wasm.none))], wasm.none);
  } finally {
    ctx.loops.pop();
  }
}

function emitUnrolledFor(range, body, { brk, cnt, label }, ctx, emitExpr) {
  const m = ctx.module;
  const ops = m[range.width];
  const cursor = () => m.local.get(range.cursorIndex, range.type);
  const bound = () => m.local.get(range.endIndex, range.type);
  const one = range.width === 'i64' ? 1n : 1;
  const entry = { brk, cnt, next: null };
  ctx.loops ??= [];
  ctx.loops.push(entry);
  let copy = 0;
  // One iteration: the body (its continue lands at the end of this copy), then i += 1.
  const step = () => {
    const next = `__for_next_${label}_${copy++}`;
    entry.next = next;
    return [
      m.block(next, [discardValue(m, emitExpr(body, ctx))], wasm.none),
      m.local.set(range.cursorIndex, ops.add(cursor(), ops.const(one))),
    ];
  };
  try {
    const four = Array.from({ length: UNROLL }, step).flat();
    const single = step();
    const remaining = ops.sub(bound(), cursor());
    const enough = ops.ge_u(remaining, ops.const(range.width === 'i64' ? BigInt(UNROLL) : UNROLL));
    const loop = m.loop(cnt, m.block(null, [
      m.br(brk, m.i32.eqz(ops[range.unsigned ? 'lt_u' : 'lt_s'](cursor(), bound()))),
      m.if(enough, m.block(null, [...four, m.br(cnt)], wasm.none)),
      ...single,
      m.br(cnt),
    ], wasm.none));
    return m.block(brk, [
      m.local.set(range.cursorIndex, emitExpr(range.start, ctx)),
      m.local.set(range.endIndex, emitExpr(range.end, ctx)),
      loop,
    ], wasm.none);
  } finally {
    ctx.loops.pop();
  }
}

// ── return / break ──────────────────────────────────────────────────────────

export function emitReturn(node, ctx, emitExpr) {
  const m = ctx.module;
  const child = node.children[0];
  const value = child ? emitExpr(child, ctx) : undefined;
  if (!ctx.defers?.some(frame => frame.deferred.length)) return m.return(value);
  // The value is computed before deferred code runs, as in other languages.
  const type = value === undefined ? wasm.none : wasm.getExpressionType(value);
  if (value === undefined || type === wasm.none || type === wasm.unreachable) {
    return afterDeferred(m, [...(value === undefined ? [] : [value]), ...emitDeferred(ctx, ctx.defers, emitExpr)], m.return());
  }
  const slot = ctx.addLocal(ctx.typeOf(child));
  return afterDeferred(m, [m.local.set(slot, value), ...emitDeferred(ctx, ctx.defers, emitExpr)], m.return(m.local.get(slot, type)));
}

export function emitContinue(node, ctx, emitExpr) {
  const m = ctx.module;
  const state = node.firstElementChild;
  if (state) {
    // `continue v`: store the next state, then branch back to the dispatch.
    const depth = ctx.loops?.findLastIndex(loop => loop.state) ?? -1;
    if (depth < 0) throw new Error('codegen: continue with a state outside a loop match');
    const target = ctx.loops[depth];
    const deferred = loopDeferred(ctx, emitExpr, depth + 1);
    const constant = constantState(state);
    const jump = target.jump(constant == null ? emitExpr(state, ctx) : null, constant);
    // The next state is computed (and stored) before deferred code runs.
    const store = jump.length > 1 ? [jump[0]] : [];
    return afterDeferred(m, [...store, ...deferred], jump.at(-1));
  }
  const depth = ctx.loops?.findLastIndex(loop => !loop.block) ?? -1;
  if (depth < 0) throw new Error('codegen: continue outside a loop');
  return afterDeferred(m, loopDeferred(ctx, emitExpr, depth + 1), m.br(ctx.loops[depth].next));
}

// ── loop match ──────────────────────────────────────────────────────────────
//
// IR:  <ir-loop-match><state/><ir-match-arm …/>…[<ir-default-arm/>]</ir-loop-match>
//
// Dense integer states lower to threaded dispatch, arms in source order:
//
//   (local.set $state init)
//   (block $exit
//     (loop $dispatch
//       (block $default
//         (block $a1
//           (block $a0
//             (br_table $a0 $a1 $default (state - min)))
//           a0-body (br $exit))
//         a1-body (br $exit))
//       default-body))
//
// A branch to $aK lands on aK's body. From inside arm k, every later arm's
// label and $default enclose the code, so:
//   continue <constant later arm>  → (br $aJ)                        no dispatch
//   continue <constant earlier arm>→ (local.set) (br $dispatch)
//   continue <dynamic value>       → (local.set) (br_table …) with direct
//                                    entries for later arms, $dispatch otherwise
//   break                          → (br $exit)
// Each continue site gets its own br_table, so the engine predicts each
// transition separately (threaded code, like a computed goto), as in Zig's
// labeled switch. Structured wasm can only branch forward out of blocks or
// back to a loop header, so a jump to an earlier arm goes through the
// header's dispatch: order arms so hot transitions point forward. At -O3 the
// arms are emitted twice so that most of those edges become forward too.
// Sparse or non-I32 states fall back to the central `match` dispatch.
export function emitLoopMatch(node, ctx, emitExpr) {
  const m = ctx.module;
  const scrutinee = node.firstElementChild;
  const typeName = ctx.typeOf(scrutinee);
  if (!typeName) throw new Error('codegen: loop match state has no type');
  const type = ctx.toType(typeName);
  const index = ctx.addLocal(typeName);
  const label = nextLabel(ctx);
  const exit = `__loop_match_exit_${label}`, dispatch = `__loop_match_dispatch_${label}`;
  const init = m.local.set(index, emitExpr(scrutinee, ctx));
  const arms = [...childrenOf(node, 'ir-match-arm')];
  const defaultArm = childOf(node, 'ir-default-arm');
  const ns = ctx.scalarNamespaceOf(typeName);
  const sorted = arms.map(arm => ({ arm, pattern: parseMatchLiteral(arm.getAttribute('pattern'), ns) }))
    .sort((a, b) => comparePattern(a.pattern, b.pattern));
  const min = sorted[0]?.pattern, max = sorted.at(-1)?.pattern;
  const dense = ns === 'i32' && sorted.length > 0 && typeof min === 'bigint'
    && max - min + 1n === BigInt(sorted.length) && min >= -0x80000000n && max <= 0x7fffffffn;

  const entry = { brk: exit, cnt: dispatch, next: dispatch, state: { index, type } };
  ctx.loops ??= [];
  ctx.loops.push(entry);
  try {
    if (!dense) {
      // Central dispatch: the `match` lowering, reading the state local.
      const bodies = new Set([...arms, defaultArm].filter(Boolean).map(armBody));
      const literal = (n) => (ns === 'i64' ? m.i64.const(n) : ns === 'i32' ? m.i32.const(Number(BigInt.asIntN(32, n))) : m[ns].const(Number(n)));
      entry.jump = (value, constant) => [m.local.set(index, value ?? literal(constant)), m.br(dispatch)];
      const read = (child, c) => {
        if (child === scrutinee) return m.local.get(index, type);
        const expr = emitExpr(child, c);
        return bodies.has(child) ? discardValue(m, expr) : expr;
      };
      return m.block(exit, [init, m.loop(dispatch, discardValue(m, emitMatch(node, ctx, read)))], wasm.none);
    }

    // Arms are laid out in source order, so authors can make hot transitions
    // forward edges; the tables map each state value to its arm's label.
    // At -O3 the arms are laid out twice (copy 0, then copy 1): from copy 0
    // every transition is a forward edge into one of the copies, so only
    // copy 1's backward edges share the loop head's table.
    const copies = ctx.optimize === 'speed' ? 2 : 1;
    const layout = arms.map(arm => parseMatchLiteral(arm.getAttribute('pattern'), ns));
    const labels = Array.from({ length: copies }, (_, c) => arms.map((_, i) => `__loop_match_arm_${label}_${c}_${i}`));
    const DEFAULT = `__loop_match_default_${label}`;
    const offset = (value) => (min === 0n ? value : m.i32.sub(value, m.i32.const(Number(min))));
    const positionOf = (pattern) => layout.indexOf(pattern);
    const byValue = sorted.map(entry => positionOf(entry.pattern));
    // Where control is while an arm body is emitted; null while emitting the default arm.
    let at = null;
    const direct = (target) => {
      if (target > at.arm) return labels[at.copy][target];
      if (at.copy + 1 < copies) return labels[at.copy + 1][target];
      return null;
    };
    entry.jump = (value, constant) => {
      if (constant != null && at) {
        const target = positionOf(constant);
        if (target < 0) return [m.br(DEFAULT)];
        const label = direct(target);
        if (label) return [m.br(label)];
      }
      const store = m.local.set(index, value ?? m.i32.const(Number(constant)));
      if (!at) return [store, m.br(dispatch)];
      const targets = byValue.map(position => direct(position) ?? dispatch);
      return [store, m.switch(targets, DEFAULT, offset(m.local.get(index, type)))];
    };

    let chain = m.switch(byValue.map(position => labels[0][position]), DEFAULT, offset(m.local.get(index, type)));
    for (let copy = 0; copy < copies; copy++) {
      for (let arm = 0; arm < arms.length; arm++) {
        at = { copy, arm };
        const body = discardValue(m, emitExpr(armBody(arms[arm]), ctx));
        chain = m.block(null, [m.block(labels[copy][arm], [chain], wasm.none), body, m.br(exit)], wasm.unreachable);
      }
    }
    at = null;
    const tail = defaultArm ? discardValue(m, emitExpr(armBody(defaultArm), ctx)) : m.unreachable();
    const loopBody = m.block(null, [m.block(DEFAULT, [chain], wasm.none), tail], wasm.none);
    return m.block(exit, [init, m.loop(dispatch, loopBody)], wasm.none);
  } finally {
    ctx.loops.pop();
  }
}

/** The integer a `continue` state names at compile time, if it is a literal. */
function constantState(node) {
  if (node?.localName === 'ir-lit' && node.getAttribute('kind') === 'int') {
    try { return BigInt(node.getAttribute('value')); } catch { return null; }
  }
  // `-1` arrives as a negation call around a literal.
  if (node?.localName === 'ir-call' && node.attr('data-operator-name') === 'neg') {
    const inner = constantState(childOf(node, 'ir-arg-list')?.firstElementChild);
    return inner == null ? null : -inner;
  }
  return null;
}

export function emitBreak(node, ctx, emitExpr) {
  const m = ctx.module;
  const child = node.children[0];
  // A targeted break (from generator expansion) leaves a named loop, running
  // the deferred code of every block it exits on the way.
  const target = node.attr('data-loop-target');
  const depth = target
    ? ctx.loops?.findLastIndex(loop => loop.label === target)
    : ctx.loops?.findLastIndex(loop => !loop.block) ?? -1;
  if (target && depth < 0) throw new Error(`codegen: break target ${target} is not an enclosing loop`);
  const loop = ctx.loops?.[depth];
  const exit = m.br(loop?.brk ?? '__while_brk', undefined, child ? emitExpr(child, ctx) : undefined);
  return afterDeferred(m, loopDeferred(ctx, emitExpr, depth + 1), exit);
}

// ── match ───────────────────────────────────────────────────────────────────
//
// IR:  <ir-match data-type-name="T">
//        <scrutinee/>
//        <ir-match-arm pattern="N1"><body/></ir-match-arm>
//        ...
//        [<ir-default-arm><body/></ir-default-arm>]
//      </ir-match>
//
// Patterns are integer literals (parsed below).  Wasm shape:
//
//   (block $result T
//     (block $default
//       (block $arm_{n-1} ... (block $arm_0
//         (br_table $arm_0 ... $arm_{n-1} $default (cond - min)))
//         arm_0_body; br $result)
//       ...
//       arm_{n-1}_body; br $result)
//     default_body; br $result)
//
// We sort arms by pattern, subtract `min` so the table is dense from 0, and
// fall back to an if/else chain when patterns aren't dense (e.g. {0, 100}).
//
// The fallback isn't a workaround — wasm `br_table` only encodes a contiguous
// range, so any sparse pattern set must be expressed as comparisons regardless.
export function emitMatch(node, ctx, emitExpr) {
  const m       = ctx.module;
  const scrut   = node.children[0];
  const arms    = [...childrenOf(node, 'ir-match-arm')];
  const defArm  = childOf(node, 'ir-default-arm');
  const retType = ctx.toType(ctx.typeOf(node) ?? 'void');

  if (arms.length === 0) {
    return defArm ? emitExpr(armBody(defArm), ctx) : m.unreachable();
  }

  // Sort arms by pattern value; check density.
  const scrutTypeName = ctx.typeOf(scrut) ?? '';
  const ns = ctx.scalarNamespaceOf(scrutTypeName);
  const sorted = arms
    .map(a => ({ arm: a, pat: parseMatchLiteral(a.getAttribute('pattern'), ns) }))
    .sort((a, b) => comparePattern(a.pat, b.pat));
  const min   = sorted[0].pat;
  const max   = sorted[sorted.length - 1].pat;
  const dense = typeof min === 'bigint' && typeof max === 'bigint'
    && (max - min + 1n) === BigInt(sorted.length);
  const tableSafe = dense && ns === 'i32' && min >= BigInt(-0x80000000) && max <= BigInt(0x7fffffff);

  return tableSafe
    ? emitMatchTable(m, ctx, scrut, sorted, defArm, Number(min), retType, emitExpr)
    : emitMatchChain(m, ctx, scrut, sorted, defArm, retType, emitExpr);
}

// br_table path — see structure diagram above.
function emitMatchTable(m, ctx, scrut, sorted, defArm, min, retType, emitExpr) {
  const RESULT  = '__match_result';
  const DEFAULT = '__match_default';
  const labels  = sorted.map((_, i) => `__match_arm_${i}`);

  const cond = emitExpr(scrut, ctx);
  const idx  = min === 0 ? cond : m.i32.sub(cond, m.i32.const(min));

  // Innermost: the dispatch.
  let chain = m.switch(labels, DEFAULT, idx);

  // Wrap each arm: (block $arm_i {chain})  then  (br $result armBody)
  for (let i = 0; i < sorted.length; i++) {
    const armBlock = m.block(labels[i], [chain], wasm.none);
    const body     = emitExpr(armBody(sorted[i].arm), ctx);
    const brOut    = retType === wasm.none ? brAndUnreachable(m, RESULT) : m.br(RESULT, undefined, body);
    chain = m.block(null,
      retType === wasm.none ? [armBlock, body, brOut] : [armBlock, brOut],
      wasm.unreachable);
  }

  // Wrap with $default block + default body.
  const defBlock = m.block(DEFAULT, [chain], wasm.none);
  const defBody  = defArm ? emitExpr(armBody(defArm), ctx) : null;
  const tail = defBody == null
    ? [defBlock, m.unreachable()]
    : retType === wasm.none
      ? [defBlock, defBody, brAndUnreachable(m, RESULT)]
      : [defBlock, m.br(RESULT, undefined, defBody)];

  return m.block(RESULT, [m.block(null, tail, wasm.unreachable)], retType);
}

// if/else fallback for sparse patterns.
function emitMatchChain(m, ctx, scrut, sorted, defArm, retType, emitExpr) {
  // Cache the scrutinee in a local so each comparison reads it without re-running side effects.
  const scrutTypeName = ctx.typeOf(scrut);
  if (!scrutTypeName) throw new Error('codegen: match scrutinee has no type');
  const scrutType = ctx.toType(scrutTypeName);
  const slot = ctx.addLocal(scrutTypeName);
  const init = m.local.set(slot, emitExpr(scrut, ctx));

  // Pick the right arithmetic family for the scrutinee from the registry.
  const ns = ctx.scalarNamespaceOf(scrutTypeName);
  if (ns !== 'i32' && ns !== 'i64' && ns !== 'f32' && ns !== 'f64') {
    throw new Error(`codegen: match scrutinee type "${scrutTypeName}" is not a scalar match type`);
  }
  const constOf = (n) => {
    if (ns === 'i64') return m.i64.const(n);
    if (ns === 'i32') return m.i32.const(Number(BigInt.asIntN(32, n)));
    return m[ns].const(Number(n));
  };

  // Build the chain bottom-up: default first, then wrap with if-eq for each arm in reverse.
  let tail = defArm ? emitExpr(armBody(defArm), ctx) : m.unreachable();
  for (let i = sorted.length - 1; i >= 0; i--) {
    const eq = m[ns].eq(m.local.get(slot, scrutType), constOf(sorted[i].pat));
    tail = m.if(eq, emitExpr(armBody(sorted[i].arm), ctx), tail);
  }
  return m.block(null, [init, tail], retType);
}

// ── alt / promote ───────────────────────────────────────────────────────────
//
// These need WasmGC type emission first.  When that lands:
//
//   ir-alt over a nom[tag] enum (i32-tagged):
//     identical lowering to ir-match — emit br_table over the tag.
//
//   ir-alt over a nom[rec] enum (struct subtypes):
//     lowered earlier into nested ir-if + ir-ref-test.
//
//   ir-promote on ?T:
//     (block $isnull
//       (let v (br_on_null $isnull (scrut))
//         use_v
//         br $result))
//     default body
//
// All three follow the same skeleton as emitMatchTable; only the dispatch
// instruction at the bottom differs.  Once wasm exposes br_on_cast /
// br_on_null bindings (or we drop down to raw expression refs), the work is
// largely a copy-paste of the table layout above.

export function emitAlt(node, ctx, emitExpr) {
  const scrutinee = node.firstElementChild;
  const scrutType = ctx.typeOf(scrutinee) ?? '';
  throw new Error(
    `codegen: residual ir-alt over <${scrutType}> reached backend — ` +
    `supported rec-alt should have been lowered earlier; remaining cases are bound rec-alt or tag-alt`
  );
}

export function emitPromote(node, ctx, emitExpr) {
  const scrutinee = node.firstElementChild;
  const scrutType = ctx.typeOf(scrutinee) ?? '';
  throw new Error(
    `codegen: residual ir-promote over <${scrutType}> reached backend — ` +
    'supported promote should have been lowered earlier'
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function armBody(arm) {
  // Match/alt/default arms always store the body as the last element child.
  return arm.lastElementChild;
}

function parseMatchLiteral(s, ns) {
  if (ns === 'f32' || ns === 'f64') return Number(s ?? 0);
  return parseIntLiteral(s);
}

function parseIntLiteral(s) {
  if (s == null || s === 'false') return 0n;
  if (s === 'true') return 1n;
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const value = BigInt(body);
  return neg ? -value : value;
}

function comparePattern(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ── assert / fatal ────────────────────────────────────────────────────────────

/**
 * `assert cond` traps when the condition is false. Bool is represented as i32,
 * so the test is an i32.eqz on the condition.
 *
 * A trap is the right failure mode here: it is observable from the host as a
 * RuntimeError, needs no runtime support, and cannot be caught and ignored by
 * the code under test.
 */
export function emitAssert(node, ctx, emitExpr) {
  const cond = node.firstElementChild;
  if (!cond) throw new Error('codegen: ir-assert has no condition');
  return ctx.module.if(
    ctx.module.i32.eqz(emitExpr(cond, ctx)),
    ctx.module.unreachable(),
  );
}

/** `fatal` traps unconditionally. */
export function emitFatal(node, ctx) {
  return ctx.module.unreachable();
}

// For a void-typed match, arms drop their value and fall through to br $result
// without a payload — but the wasm validator still wants the post-br code to be
// typed `unreachable`, hence this helper.
function brAndUnreachable(m, label) {
  return m.br(label);
}
