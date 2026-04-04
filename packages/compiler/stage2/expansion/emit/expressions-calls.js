import {
    BUILTIN_METHOD_RETURN_INFO,
    childOfType,
    hasAnon,
    kids,
} from '../core.js';
import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class ExpressionsCallsMixin {
    emitCallExpr(node, ctx) {
        const callee = kids(node)[0];
        const argNodes = kids(childOfType(node, 'arg_list'));
        const args = argNodes.map((arg) => this.emitExpr(arg, ctx));

        if (callee?.type === 'field_expr') {
            const moduleValue = this.resolveModuleField(callee, ctx);
            if (moduleValue) return `${moduleValue}(${args.join(', ')})`;
            const method = this.resolveMethodCall(callee, ctx, argNodes.length + 1);
            if (method) return `${method.callee}(${[this.emitExpr(kids(callee)[0], ctx), ...args].join(', ')})`;
        }

        if (callee?.type === 'type_member_expr') {
            const protocolCall = this.resolveProtocolTypeMemberCall(callee, argNodes, ctx);
            if (protocolCall) return `${protocolCall.callee}(${args.join(', ')})`;
            return `${this.resolveTypeMemberExpr(callee, ctx)}(${args.join(', ')})`;
        }

        return `${this.emitExpr(callee, ctx)}(${args.join(', ')})`;
    }

    emitFieldExpr(node, ctx) {
        const moduleValue = this.resolveModuleField(node, ctx);
        if (moduleValue) return moduleValue;
        return `${this.emitExpr(kids(node)[0], ctx)}.${kids(node)[1].text}`;
    }

    resolveMethodCall(node, ctx, totalArgCount = 1) {
        const [baseNode, memberNode] = kids(node);
        const info = this.inferExprInfo(baseNode, ctx);
        if (!info?.text || !memberNode) return null;
        const builtin = this.resolveBuiltinMethodDispatch(info, memberNode.text);
        if (builtin) return builtin;
        if (!info.owner) return null;
        const direct = this.resolveAssociatedEntryFromInfo(info, memberNode.text, ctx);
        return direct
            ?? this.resolveProtocolDispatchFromInfo(info, memberNode.text, totalArgCount)
            ?? null;
    }

    resolveBuiltinMethodDispatch(info, memberName) {
        if (!info?.text?.startsWith('array[')) return null;
        const builtinKey = `array.${memberName}`;
        if (!BUILTIN_METHOD_RETURN_INFO.has(builtinKey)) return null;
        return {
            callee: builtinKey,
            returnInfo: BUILTIN_METHOD_RETURN_INFO.get(builtinKey),
        };
    }

    resolveModuleField(node, ctx) {
        const [baseNode, memberNode] = kids(node);
        if (baseNode?.type !== 'identifier' || !memberNode || this.isLocalValue(ctx, baseNode.text)) return null;
        const namespace = this.resolveMaybeNamespaceName(baseNode.text, ctx);
        return this.resolveNamespaceValue(namespace, memberNode.text);
    }

    resolveTypeMemberExpr(node, ctx) {
        const memberNode = childOfType(node, 'identifier');
        const ownerNode = kids(node).find((child) => child !== memberNode);
        if (!memberNode || !ownerNode) return undefined;
        if (memberNode.text === 'null') {
            if (['type_ident', 'qualified_type_ref', 'inline_module_type_path', 'instantiated_module_ref'].includes(ownerNode.type))
                return `ref.null ${this.emitType(ownerNode, ctx)}`;
            return undefined;
        }
        if (['qualified_type_ref', 'inline_module_type_path', 'instantiated_module_ref'].includes(ownerNode.type)) {
            const namespace = this.resolveNamespaceFromModuleRef(ownerNode, ctx);
            const ownerName = childOfType(ownerNode, 'type_ident')?.text ?? namespace.promotedTypeName;
            return this.resolveNamespaceAssoc(namespace, ownerName, memberNode.text)?.callee;
        }
        return this.resolveAssociatedEntry(ownerNode.text, memberNode.text, ctx)?.callee;
    }

    emitNamespaceCallExpr(node, ctx) {
        const namespace = node.children[0]?.text ?? 'builtin';
        const methodNode = childOfType(node, 'identifier');
        const argsNode = childOfType(node, 'arg_list');
        return `${namespace}.${methodNode.text}${hasAnon(node, '(') ? `(${kids(argsNode).map((arg) => this.emitExpr(arg, ctx)).join(', ')})` : ''}`;
    }

    emitPromotedModuleCall(node, ctx) {
        const memberNode = childOfType(node, 'identifier');
        const argsNode = childOfType(node, 'arg_list');
        const namespace = this.resolveNamespaceFromModuleRef(node, ctx);
        const callee = this.resolveNamespaceValue(namespace, memberNode.text);
        return `${callee}(${kids(argsNode).map((arg) => this.emitExpr(arg, ctx)).join(', ')})`;
    }
}

installMixin(ModuleExpander, ExpressionsCallsMixin);
