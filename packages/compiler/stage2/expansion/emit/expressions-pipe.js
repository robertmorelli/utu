import {
    childOfType,
    kids,
    namedChildren,
} from '../core.js';
import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class ExpressionsPipeMixin {
    emitPipeExpr(node, ctx) {
        const valueNode = kids(node)[0];
        const targetNode = childOfType(node, 'pipe_target');
        const { callee, args } = this.parsePipeTarget(targetNode, ctx);
        const value = this.emitExpr(valueNode, ctx);
        const placeholderCount = args.filter((arg) => arg.kind === 'placeholder').length;
        const finalArgs = placeholderCount === 0
            ? [value, ...args.map((arg) => this.emitExpr(arg.node, ctx))]
            : args.map((arg) => arg.kind === 'placeholder' ? value : this.emitExpr(arg.node, ctx));
        return `${callee}(${finalArgs.join(', ')})`;
    }

    parsePipeTarget(node, ctx) {
        const argsNode = childOfType(node, 'pipe_args');
        const pathParts = kids(node).filter((child) => child !== argsNode);
        const args = this.parsePipeArgs(argsNode);

        if (pathParts.length === 1) {
            const child = pathParts[0];
            if (child.type === 'identifier') return { callee: this.resolveBareValue(child.text, ctx), args };
            if (['module_ref', 'instantiated_module_ref'].includes(child.type)) {
                const { name, argNodes } = this.getModuleRef(child);
                if (argNodes.length === 0 && !ctx.aliases.has(name) && !this.moduleTemplates.has(name)) {
                    return { callee: this.resolveBareValue(name, ctx), args };
                }
            }
        }

        if (pathParts.length === 2) {
            const [first, second] = pathParts;
            if (first.type === 'type_ident') {
                return { callee: this.resolveAssociatedByOwner(first.text, second.text, ctx), args };
            }
            if (first.type === 'identifier') {
                const namespace = this.resolveMaybeNamespaceName(first.text, ctx);
                if (namespace) {
                    return { callee: this.resolveNamespaceValue(namespace, second.text), args };
                }
            }
            if (['module_ref', 'instantiated_module_ref'].includes(first.type)) {
                const namespace = this.resolveNamespaceFromModuleRef(first, ctx);
                return { callee: this.resolveNamespaceValue(namespace, second.text), args };
            }
        }

        if (pathParts.length === 3 && pathParts[0].type === 'identifier' && pathParts[1].type === 'type_ident') {
            const namespace = this.resolveMaybeNamespaceName(pathParts[0].text, ctx);
            const ownerName = pathParts[1].text;
            const memberName = pathParts[2].text;
            return { callee: namespace?.assocNames.get(`${ownerName}.${memberName}`), args };
        }

        if (pathParts.length === 3 && ['module_ref', 'instantiated_module_ref'].includes(pathParts[0].type)) {
            const namespace = this.resolveNamespaceFromModuleRef(pathParts[0], ctx);
            const ownerName = pathParts[1].text;
            const memberName = pathParts[2].text;
            return { callee: namespace.assocNames.get(`${ownerName}.${memberName}`), args };
        }

        return { callee: undefined, args };
    }


    parsePipeArgs(node) {
        if (!node) return [];
        return namedChildren(node)
            .flatMap((child) => ['pipe_args_no_placeholder', 'pipe_args_with_placeholder'].includes(child.type) ? namedChildren(child) : [child])
            .filter((child) => child.type === 'pipe_arg' || child.type === 'pipe_arg_placeholder')
            .map((child) => child.type === 'pipe_arg_placeholder'
                ? { kind: 'placeholder' }
                : { kind: 'arg', node: kids(child)[0] });
    }
}

installMixin(ModuleExpander, ExpressionsPipeMixin);
