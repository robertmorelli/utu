import {
    childOfType,
    findAnonBetween,
    kids,
} from '../core.js';
import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class ExpressionsCoreMixin {
    emitExpr(node, ctx) {
        switch (node.type) {
            case 'literal':
                return node.text;
            case 'identifier':
                return this.resolveBareValue(node.text, ctx);
            case 'instantiated_module_ref':
                return node.text;
            case 'promoted_module_call_expr':
                return this.emitPromotedModuleCall(node, ctx);
            case 'paren_expr':
                return `(${this.emitExpr(kids(node)[0], ctx)})`;
            case 'assert_expr':
                return `assert ${this.emitExpr(kids(node)[0], ctx)}`;
            case 'unary_expr': {
                const op = childOfType(node, 'unary_op').text;
                const exprNode = kids(node).find((child) => child.type !== 'unary_op');
                return op === 'not'
                    ? `not ${this.emitExpr(exprNode, ctx)}`
                    : `${op}${this.emitExpr(exprNode, ctx)}`;
            }
            case 'binary_expr': {
                const [left, right] = kids(node);
                return `${this.emitExpr(left, ctx)} ${findAnonBetween(node, left, right)} ${this.emitExpr(right, ctx)}`;
            }
            case 'tuple_expr':
                return `(${kids(node).map((child) => this.emitExpr(child, ctx)).join(', ')})`;
            case 'pipe_expr':
                return this.emitPipeExpr(node, ctx);
            case 'else_expr':
                return `${this.emitExpr(kids(node)[0], ctx)} \\ ${this.emitExpr(kids(node)[1], ctx)}`;
            case 'call_expr':
                return this.emitCallExpr(node, ctx);
            case 'type_member_expr':
                return this.resolveTypeMemberExpr(node, ctx);
            case 'field_expr':
                return this.emitFieldExpr(node, ctx);
            case 'index_expr':
                return `${this.emitExpr(kids(node)[0], ctx)}[${this.emitExpr(kids(node)[1], ctx)}]`;
            case 'namespace_call_expr':
                return this.emitNamespaceCallExpr(node, ctx);
            case 'ref_null_expr':
                return `ref.null ${this.emitType(kids(node)[0], ctx)}`;
            case 'if_expr':
                return this.emitIfExpr(node, ctx);
            case 'promote_expr':
                return this.emitPromoteExpr(node, ctx);
            case 'match_expr':
                return this.emitMatchExpr(node, ctx);
            case 'alt_expr':
                return this.emitAltExpr(node, ctx);
            case 'block_expr':
                return this.emitBlockExpr(node, ctx);
            case 'for_expr':
                return this.emitForExpr(node, ctx);
            case 'while_expr':
                return this.emitWhileExpr(node, ctx);
            case 'break_expr':
                return 'break';
            case 'emit_expr':
                return `emit ${this.emitExpr(kids(node)[0], ctx)}`;
            case 'bind_expr':
                return this.emitBindExpr(node, ctx);
            case 'struct_init':
                return this.emitStructInit(node, ctx);
            case 'array_init':
                return this.emitArrayInit(node, ctx);
            case 'assign_expr':
                return `${this.emitExpr(kids(node)[0], ctx)} ${findAnonBetween(node, kids(node)[0], kids(node)[1])} ${this.emitExpr(kids(node)[1], ctx)}`;
            case 'fatal_expr':
                return 'fatal';
            case 'block':
                return this.emitBlock(node, this.pushScope(ctx), true);
            default:
                return node.text;
        }
    }
}

installMixin(ModuleExpander, ExpressionsCoreMixin);
