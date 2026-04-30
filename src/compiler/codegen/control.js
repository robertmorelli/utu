// codegen/control.js — branching IR → wasm
//
// Lowering targets, per spec discussion:
//
//   ir-if         →  wasm `if/else`
//   ir-while      →  wasm `loop` + `br_if`
//   ir-return     →  wasm `return`
//   ir-break      →  wasm `br` to the enclosing while-block
//   ir-match      →  wasm `br_table`           (literal scalar dispatch)
//   ir-alt[tag]   →  wasm `br_table`           (enum-tag dispatch)
//   ir-alt[rec]   →  wasm `br_on_cast` chain   (subtype dispatch)
//   ir-promote    →  wasm `br_on_null`         (nullable unwrap)
//
// What runs today: if / while / return / break / match / promote.
// Supported rec-alt is lowered earlier to ordinary control-flow IR, so any
// ir-alt reaching this file is a residual unsupported case.

import { binaryen } from './types.js';
import { emitNullLiteral, isNullLiteral } from './null-literals.js';

// ── if / else ────────────────────────────────────────────────────────────────
//
// IR:  <ir-if><cond/><then-block/>[<else-block-or-if/>]</ir-if>
// Wasm: (if (result T) cond then else)
export function emitIf(node, ctx, emitExpr) {
  const [cond, thenBlock, elseBranch] = [...node.children];
  return ctx.module.if(
    emitExpr(cond, ctx),
    emitExpr(thenBlock, ctx),
    elseBranch ? emitExpr(elseBranch, ctx) : undefined,
  );
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
  const [cond, body] = [...node.children];
  const m   = ctx.module;
  const brk = '__while_brk';
  const cnt = '__while_cnt';

  // Push the labels so a nested ir-break can find them.
  ctx.loops ??= [];
  ctx.loops.push({ brk, cnt });
  try {
    const exitIfFalse = m.br(brk, m.i32.eqz(emitExpr(cond, ctx)));
    const bodyExpr    = emitExpr(body, ctx);
    const loop = m.loop(cnt, m.block(null, [exitIfFalse, bodyExpr, m.br(cnt)], binaryen.none));
    return m.block(brk, [loop], binaryen.none);
  } finally {
    ctx.loops.pop();
  }
}

// ── return / break ──────────────────────────────────────────────────────────

export function emitReturn(node, ctx, emitExpr) {
  const child = node.children[0];
  if (child && isNullLiteral(child) && ctx.currentReturnType?.startsWith('?')) {
    return ctx.module.return(emitNullLiteral(child, ctx, ctx.currentReturnType));
  }
  return ctx.module.return(child ? emitExpr(child, ctx) : undefined);
}

export function emitBreak(node, ctx, emitExpr) {
  const top   = ctx.loops?.[ctx.loops.length - 1];
  const label = top?.brk ?? '__while_brk';
  const child = node.children[0];
  return ctx.module.br(label, undefined, child ? emitExpr(child, ctx) : undefined);
}

// ── match ───────────────────────────────────────────────────────────────────
//
// IR:  <ir-match data-type="T">
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
  const arms    = [...node.querySelectorAll(':scope > ir-match-arm')];
  const defArm  = node.querySelector(':scope > ir-default-arm');
  const retType = ctx.toType(node.dataset.type ?? 'void');

  if (arms.length === 0) {
    return defArm ? emitExpr(armBody(defArm), ctx) : m.unreachable();
  }

  // Sort arms by pattern value; check density.
  const scrutTypeName = scrut.dataset.type ?? '';
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
    const armBlock = m.block(labels[i], [chain], binaryen.none);
    const body     = emitExpr(armBody(sorted[i].arm), ctx);
    const brOut    = retType === binaryen.none ? brAndUnreachable(m, RESULT) : m.br(RESULT, undefined, body);
    chain = m.block(null,
      retType === binaryen.none ? [armBlock, body, brOut] : [armBlock, brOut],
      binaryen.unreachable);
  }

  // Wrap with $default block + default body.
  const defBlock = m.block(DEFAULT, [chain], binaryen.none);
  const defBody  = defArm ? emitExpr(armBody(defArm), ctx) : null;
  const tail = defBody == null
    ? [defBlock, m.unreachable()]
    : retType === binaryen.none
      ? [defBlock, defBody, brAndUnreachable(m, RESULT)]
      : [defBlock, m.br(RESULT, undefined, defBody)];

  return m.block(RESULT, [m.block(null, tail, binaryen.unreachable)], retType);
}

// if/else fallback for sparse patterns.
function emitMatchChain(m, ctx, scrut, sorted, defArm, retType, emitExpr) {
  // Cache the scrutinee in a local so each comparison reads it without re-running side effects.
  const scrutTypeName = scrut.dataset.type;
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
    if (ns === 'i64') return m.i64.const(Number(BigInt.asIntN(32, n)), Number(BigInt.asIntN(32, n >> 32n)));
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
// instruction at the bottom differs.  Once binaryen exposes br_on_cast /
// br_on_null bindings (or we drop down to raw expression refs), the work is
// largely a copy-paste of the table layout above.

export function emitAlt(node, ctx, emitExpr) {
  const scrutinee = node.firstElementChild;
  const scrutType = scrutinee?.dataset.type ?? '';
  throw new Error(
    `codegen: residual ir-alt over <${scrutType}> reached backend — ` +
    `supported rec-alt should have been lowered earlier; remaining cases are bound rec-alt or tag-alt`
  );
}

export function emitPromote(node, ctx, emitExpr) {
  const scrutinee = node.firstElementChild;
  const scrutType = scrutinee?.dataset.type ?? '';
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
  if (s == null) return 0n;
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const value = BigInt(body);
  return neg ? -value : value;
}

function comparePattern(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// For a void-typed match, arms drop their value and fall through to br $result
// without a payload — but the wasm validator still wants the post-br code to be
// typed `unreachable`, hence this helper.
function brAndUnreachable(m, label) {
  return m.br(label);
}
