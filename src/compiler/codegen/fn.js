// codegen/fn.js — emit a single ir-fn into the binaryen Module
//
// emitFn(fn, ctx) reads:
//   • params from <ir-param-list>
//   • return type from the fn's first non-(name|self|param-list|block) child
//   • body from <ir-block>
//
// Locals (ir-let) are appended to a per-fn list as they're encountered, so the
// binaryen function gets the right `varTypes` array.  Each binding (param or
// let) is registered in `locals` keyed by node id, matching the data-binding-id
// stamped by resolveBindings.
//
// Type resolution goes through `ctx.toType` (built by codegen/index.js) so
// struct names resolve to ref types alongside scalars.

import { binaryen, fnReturnType, declaredTypeStr } from './types.js';
import { emitExpr } from './expr.js';
import { noteFunction } from './explainability.js';

/**
 * @param {Element} fn   ir-fn (already analysed)
 * @param {object}  ctx  shared codegen context (module, fnById, structTypes, toType)
 * @returns {{ name:string, retType:number }}
 */
export function emitFn(fn, ctx) {
  const m = ctx.module;
  const name = fn.getAttribute('name');
  if (!name) throw new Error('codegen: ir-fn missing name attribute');

  // ── Params: positionally allocated to local slots 0..N-1 ──────────────────
  const paramNodes = [...fn.querySelectorAll(':scope > ir-param-list > ir-param')];
  const paramTypes = [];
  const locals     = new Map(); // bindingId → { index, type }
  const selfParam = fn.querySelector(':scope > ir-self-param');

  if (selfParam) {
    const recvType = fn.querySelector(':scope > ir-fn-name')?.getAttribute('receiver');
    if (!recvType) throw new Error(`codegen: ir-self-param in "${name}" has no receiver type`);
    const tId = ctx.toType(recvType);
    locals.set(selfParam.id, { index: paramTypes.length, type: tId });
    paramTypes.push(tId);
  }

  for (const p of paramNodes) {
    const tStr = declaredTypeStr(p);
    if (!tStr) throw new Error(`codegen: ir-param "${p.getAttribute('name')}" has no type annotation`);
    const tId = ctx.toType(tStr);
    locals.set(p.id, { index: paramTypes.length, type: tId });
    paramTypes.push(tId);
  }

  // ── Return + locals ──────────────────────────────────────────────────────
  const retType = ctx.toType(fnReturnType(fn));
  const varTypes = [];

  // Per-fn ctx: lets call back via addLocal(typeStr) to grab a fresh slot.
  const fnCtx = {
    ...ctx,
    locals,
    currentReturnType: fnReturnType(fn),
    debugExprs: [],
    addLocal(typeStr) {
      const tId = ctx.toType(typeStr);
      const idx = paramTypes.length + varTypes.length;
      varTypes.push(tId);
      return idx;
    },
  };

  // ── Body ──────────────────────────────────────────────────────────────────
  const body = fn.querySelector(':scope > ir-block');
  const bodyExpr = body ? emitExpr(body, fnCtx) : m.nop();

  const funcRef = m.addFunction(
    name,
    binaryen.createType(paramTypes),
    retType,
    varTypes,
    bodyExpr,
  );

  applyDebugLocations(fnCtx, funcRef);

  noteFunction(ctx.artifacts, fn, name, retType);

  return { name, retType };
}

function applyDebugLocations(ctx, funcRef) {
  if (!ctx.debug || !funcRef) return;
  for (const { node, expr } of ctx.debugExprs) {
    const fileIndex = ctx.debug.fileIndex(node.dataset.sourceFile);
    const line = Number(node.dataset.row);
    const col = Number(node.dataset.col);
    if (fileIndex == null || !Number.isFinite(line) || !Number.isFinite(col)) continue;
    ctx.module.setDebugLocation(funcRef, expr, fileIndex, line, col);
  }
}
