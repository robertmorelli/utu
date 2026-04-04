import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class ExpressionsValuesMixin {
    resolveBareValue(name, ctx) {
        if (this.isLocalValue(ctx, name)) return name;
        if (ctx.namespace?.freeValueNames.has(name)) return ctx.namespace.freeValueNames.get(name);
        if (this.topLevelValueNames.has(name)) return name;
        if (ctx.openValues.has(name)) return ctx.openValues.get(name).freeValueNames.get(name);
        return name;
    }

    resolveValueType(name, ctx) {
        const local = this.lookupLocal(ctx, name);
        if (local !== undefined) return local;
        if (ctx.namespace?.freeValueTypes.has(name)) return ctx.namespace.freeValueTypes.get(name);
        if (this.topLevelValueTypes.has(name)) return this.topLevelValueTypes.get(name);
        if (ctx.openValues.has(name)) return ctx.openValues.get(name).freeValueTypes.get(name) ?? null;
        return null;
    }

    resolveFunctionReturn(name, ctx) {
        if (ctx.namespace?.freeFnReturns.has(name)) return ctx.namespace.freeFnReturns.get(name);
        if (this.topLevelFnReturns.has(name)) return this.topLevelFnReturns.get(name);
        if (ctx.openValues.has(name)) return ctx.openValues.get(name).freeFnReturns.get(name) ?? null;
        return null;
    }

    resolveNamespaceValueReturn(namespace, memberName) {
        return namespace?.freeFnReturns.get(memberName)
            ?? (namespace?.promotedTypeName ? namespace.assocReturns.get(`${namespace.promotedTypeName}.${memberName}`) : null)
            ?? null;
    }
}

installMixin(ModuleExpander, ExpressionsValuesMixin);
