import { stamp, el } from './parse-helpers.js';
// parse-exprs.js — expression walker registry

import {
  walkArgList, walkAssignExpr, walkBinaryExpr, walkCallExpr, walkElseExpr,
  walkFieldExpr, walkOptionalFieldExpr, walkIdentifier, walkIndexExpr, walkLiteral, walkModCallExpr,
  walkNullExpr, walkParenExpr, walkPipeExpr, walkRangeExpr, walkSliceExpr, walkTypeMemberExpr,
  walkUnaryExpr,
} from './parse-exprs-basic.js';
import {
  walkAltArm, walkAltExpr, walkBlock, walkBlockExpr, walkCapture,
  walkDefaultArm, walkForExpr, walkForSource, walkIfExpr, walkMatchArm,
  walkLoopMatchExpr, walkMatchExpr, walkPromoteExpr, walkTryExpr, walkWhileExpr,
} from './parse-exprs-control.js';
import {
  walkAssertExpr, walkAwaitExpr, walkBindExpr, walkBreakExpr, walkContinueExpr, walkDeferExpr, walkYieldExpr, walkClosureExpr, walkDslExpr,
  walkFatalExpr, walkPruneExpr, walkFieldInit, walkReturnExpr, walkStructInit, walkTupleExpr, walkArrayExpr,
} from './parse-exprs-statements.js';

export const walkers = {
  iterator_expr(n, doc, source, dispatch) {
    const node = stamp(el('ir-iterator', doc), n);
    node.setAttribute('op', n.childForFieldName('op').text);
    for (const child of n.namedChildren) {
      if (child === n.childForFieldName('op')) continue;
      const value = dispatch(child, doc, source);
      if (value) {
        for (const role of ['element', 'key', 'param']) {
          if (child.id === n.childForFieldName(role)?.id) value.setAttribute('iterator-role', role);
        }
        node.appendChild(value);
      }
    }
    return node;
  },
  'literal':                     walkLiteral,
  'identifier':                  walkIdentifier,
  'paren_expr':                  walkParenExpr,
  'range_expr':                  walkRangeExpr,
  'unary_expr':                  walkUnaryExpr,
  'binary_expr':                 walkBinaryExpr,
  'assign_expr':                 walkAssignExpr,
  'else_expr':                   walkElseExpr,
  'pipe_expr':                   walkPipeExpr,
  'new_expr': (n, doc, source, dispatch) => {
    const node = walkCallExpr(n, doc, source, dispatch);
    node.setAttribute('construct', 'true');
    return node;
  },
  'call_expr':                   walkCallExpr,
  'type_member_expr':            walkTypeMemberExpr,
  'promoted_module_call_expr':   walkModCallExpr,
  'field_expr':                  walkFieldExpr,
  'optional_field_expr':         walkOptionalFieldExpr,
  'index_expr':                  walkIndexExpr,
  'slice_expr':                  walkSliceExpr,
  'null_expr':                   walkNullExpr,
  'if_expr':                     walkIfExpr,
  'try_expr':                    walkTryExpr,
  'while_expr':                  walkWhileExpr,
  'for_expr':                    walkForExpr,
  'match_expr':                  walkMatchExpr,
  'alt_expr':                    walkAltExpr,
  'promote_expr':                walkPromoteExpr,
  'block_expr':                  walkBlockExpr,
  'block':                       walkBlock,
  'bind_expr':                   walkBindExpr,
  'return_expr':                 walkReturnExpr,
  'break_expr':                  walkBreakExpr,
  'continue_expr':               walkContinueExpr,
  'defer_expr':                  walkDeferExpr,
  'yield_expr':                  walkYieldExpr,
  'fatal_expr':                  walkFatalExpr,
  'prune_expr':                  walkPruneExpr,
  'assert_expr':                 walkAssertExpr,
  'tuple_expr':                  walkTupleExpr,
  'array_expr':                  walkArrayExpr,
  'struct_init':                 (n, doc, source, dispatch) => walkStructInit(n, doc, source, dispatch, false),
  'implicit_struct_init':        (n, doc, source, dispatch) => walkStructInit(n, doc, source, dispatch, true),
  'closure_expr':                walkClosureExpr,
  'await_expr':                  walkAwaitExpr,
  'dsl_expr':                    walkDslExpr,
  'match_arm':                   walkMatchArm,
  'loop_match_expr':             walkLoopMatchExpr,
  'match_default':               walkDefaultArm,
  'alt_arm':                     walkAltArm,
  'alt_default':                 walkDefaultArm,
  'for_source':                  walkForSource,
  'capture':                     walkCapture,
  'field_init':                  walkFieldInit,
  'arg_list':                    walkArgList,
};
