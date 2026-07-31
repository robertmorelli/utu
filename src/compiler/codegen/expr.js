// codegen/expr.js — IR expression dispatcher

import { emitRefIntrinsic, emitScalarIntrinsic, matchScalarIntrinsic } from './intrinsics.js';
import {
  emitIf, emitWhile, emitFor, emitReturn, emitBreak,
  emitMatch, emitAlt, emitPromote, emitAssert, emitFatal,
} from './control.js';
import { emitStructInit, emitFieldGet, emitNullRef } from './structs.js';
import { emitLit } from './literals.js';
import {
  emitAssign, emitBlock, emitIdent, emitLet,
  emitRefCast, emitRefIsNull, emitRefTest,
} from './bindings.js';
import { emitCall, emitOrElse } from './calls.js';
import { emitAwait, emitClosureDecay, emitMakeClosure } from './closures.js';
import { emitStringIntrinsic } from './strings.js';
import { emitArrayIntrinsic } from './arrays.js';

export function emitExpr(node, ctx) {
  if (!node) return ctx.module.nop();

  let expr;
  if (ctx.scalarKinds && matchScalarIntrinsic(node.localName, ctx.scalarKinds)) {
    expr = emitScalarIntrinsic(node, ctx, emitExpr);
    return withDebugLocation(node, expr, ctx);
  }
  const refIntrinsic = emitRefIntrinsic(node, ctx, emitExpr);
  if (refIntrinsic) return withDebugLocation(node, refIntrinsic, ctx);
  const stringIntrinsic = emitStringIntrinsic(node, [...node.children], ctx, emitExpr);
  if (stringIntrinsic) return withDebugLocation(node, stringIntrinsic, ctx);
  const arrayIntrinsic = emitArrayIntrinsic(node, [...node.children], ctx, emitExpr);
  if (arrayIntrinsic) return withDebugLocation(node, arrayIntrinsic, ctx);

  switch (node.localName) {
    case 'ir-lit':           expr = emitLit(node, ctx); break;
    case 'ir-ident':         expr = emitIdent(node, ctx, emitExpr); break;
    case 'ir-paren':         expr = emitExpr(node.children[0], ctx); break;
    case 'ir-block':         expr = emitBlock(node, ctx, emitExpr); break;
    case 'ir-let':           expr = emitLet(node, ctx, emitExpr); break;
    case 'ir-assign':        expr = emitAssign(node, ctx, emitExpr); break;
    case 'ir-call':          expr = emitCall(node, ctx, emitExpr); break;
    case 'ir-else':          expr = emitOrElse(node, ctx, emitExpr); break;
    case 'ir-binary':
    case 'ir-unary':
      throw new Error(`codegen: residual <${node.localName}> reached backend — operator lowering should have rewritten it`);
    case 'ir-make-closure':  expr = emitMakeClosure(node, ctx, emitExpr); break;
    case 'ir-closure-decay': expr = emitClosureDecay(node, ctx, emitExpr); break;
    case 'ir-await':         expr = emitAwait(node, ctx, emitExpr); break;
    case 'ir-assert':        expr = emitAssert(node, ctx, emitExpr); break;
    case 'ir-fatal':         expr = emitFatal(node, ctx); break;
    case 'ir-if':            expr = emitIf(node, ctx, emitExpr); break;
    case 'ir-while':         expr = emitWhile(node, ctx, emitExpr); break;
    case 'ir-for':           expr = emitFor(node, ctx, emitExpr); break;
    case 'ir-return':        expr = emitReturn(node, ctx, emitExpr); break;
    case 'ir-break':         expr = emitBreak(node, ctx, emitExpr); break;
    case 'ir-match':         expr = emitMatch(node, ctx, emitExpr); break;
    case 'ir-alt':           expr = emitAlt(node, ctx, emitExpr); break;
    case 'ir-promote':       expr = emitPromote(node, ctx, emitExpr); break;
    case 'ir-struct-init':   expr = emitStructInit(node, ctx, emitExpr); break;
    case 'ir-field-access':  expr = emitFieldGet(node, ctx, emitExpr); break;
    case 'ir-null-ref':      expr = emitNullRef(node, ctx); break;
    case 'ir-ref-test':      expr = emitRefTest(node, ctx, emitExpr); break;
    case 'ir-ref-cast':      expr = emitRefCast(node, ctx, emitExpr); break;
    case 'ir-ref-is-null':   expr = emitRefIsNull(node, ctx, emitExpr); break;
    default:
      throw new Error(`codegen: emitExpr — unhandled IR node <${node.localName}>`);
  }
  return withDebugLocation(node, expr, ctx);
}

function withDebugLocation(node, expr, ctx) {
  if (ctx.debug && expr) ctx.debugExprs?.push({ node, expr });
  return expr;
}
