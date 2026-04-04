import { childOfType, kids } from '../core.js';
import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class CollectNamespacesOpenMixin {
    applyConstruct(node, ctx) {
        const named = kids(node);
        const aliasNode = named[0]?.type === 'identifier' && ['module_ref', 'instantiated_module_ref'].includes(named[1]?.type) ? named[0] : null;
        const moduleRef = childOfType(node, 'module_ref') ?? childOfType(node, 'instantiated_module_ref');
        const namespace = this.resolveNamespaceFromModuleRef(moduleRef, ctx);

        if (aliasNode) {
            ctx.aliases.set(aliasNode.text, namespace);
            return;
        }
        for (const name of namespace.exportedValues) {
            if (this.topLevelValueNames.has(name) || ctx.openValues.has(name)) {
                throw new Error(`open construct ${namespace.displayText} would collide on value "${name}"`);
            }
            ctx.openValues.set(name, namespace);
        }

        for (const name of namespace.exportedTypes) {
            if (this.topLevelTypeNames.has(name) || ctx.openTypes.has(name)) {
                throw new Error(`open construct ${namespace.displayText} would collide on type "${name}"`);
            }
            ctx.openTypes.set(name, namespace);
        }
    }

    resolveNamespaceFromModuleRef(node, ctx) {
        const { name, argNodes } = this.getModuleRef(node);
        if (argNodes.length === 0 && ctx.aliases.has(name)) return ctx.aliases.get(name);
        const template = ctx.moduleBindings.get(name) ?? this.moduleTemplates.get(name);
        const argTexts = argNodes.map((typeNode) => this.emitType(typeNode, ctx));
        return this.ensureNamespace(template, argTexts, ctx);
    }

    resolveMaybeNamespaceName(name, ctx) {
        if (ctx.aliases.has(name)) return ctx.aliases.get(name);
        const template = ctx.moduleBindings.get(name) ?? this.moduleTemplates.get(name);
        return template && template.typeParams.length === 0 ? this.ensureNamespace(template, [], ctx) : null;
    }
}

installMixin(ModuleExpander, CollectNamespacesOpenMixin);
