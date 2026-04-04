import * as loadingFns from './stage2-import-loading.js';
import * as topLevelFns from './stage2-top-level-methods.js';
import * as symbolFns from './stage2-symbol-methods.js';
import * as namespaceFns from './stage2-namespace-methods.js';
import * as declarationFns from './stage2-declaration-emission-methods.js';
import * as typeFns from './stage2-type-methods.js';
import * as expressionFns from './stage2-expression-methods.js';

function createRootContext() {
    return {
        namespace: null,
        typeParams: new Map(),
        aliases: new Map(),
        moduleBindings: new Map(),
        openTypes: new Map(),
        openValues: new Map(),
        localValueScopes: [],
    };
}

function cloneContext(ctx, overrides = {}) {
    return {
        namespace: ctx.namespace,
        typeParams: new Map(ctx.typeParams),
        aliases: ctx.aliases,
        moduleBindings: ctx.moduleBindings,
        openTypes: ctx.openTypes,
        openValues: ctx.openValues,
        localValueScopes: ctx.localValueScopes.map((scope) => new Map(scope)),
        ...overrides,
    };
}

function pushScope(ctx) {
    return this.cloneContext(ctx, {
        localValueScopes: [...ctx.localValueScopes, new Map()],
    });
}

function declareLocal(ctx, name, info = null) {
    const scope = ctx.localValueScopes.at(-1);
    if (scope) scope.set(name, info);
}

function isLocalValue(ctx, name) {
    for (let index = ctx.localValueScopes.length - 1; index >= 0; index -= 1) {
        if (ctx.localValueScopes[index].has(name)) return true;
    }
    return false;
}

function lookupLocal(ctx, name) {
    for (let index = ctx.localValueScopes.length - 1; index >= 0; index -= 1) {
        if (ctx.localValueScopes[index].has(name)) return ctx.localValueScopes[index].get(name);
    }
    return undefined;
}

const EXPANSION_METHODS = Object.freeze({
    createRootContext,
    cloneContext,
    pushScope,
    declareLocal,
    isLocalValue,
    lookupLocal,
    ...loadingFns,
    ...topLevelFns,
    ...symbolFns,
    ...namespaceFns,
    ...declarationFns,
    ...typeFns,
    ...expressionFns,
});

export function createStage2Expander(root, source, options = {}) {
    return {
        root,
        source,
        uri: options.uri ?? null,
        loadImport: options.loadImport ?? null,
        parseSource: options.parseSource ?? null,
        moduleTemplates: new Map(),
        moduleNames: new Set(),
        namespaceCache: new Map(),
        namespaceOrder: [],
        loadedFiles: new Map(),
        loadingFiles: new Set(),
        loadedFileDisposers: [],
        topLevelValueNames: new Set(),
        topLevelTypeNames: new Set(),
        topLevelAssocNames: new Map(),
        topLevelProtocolNames: new Set(),
        topLevelProtocolMembers: new Map(),
        topLevelProtocolSetterMembers: new Map(),
        topLevelProtocolImplementers: new Map(),
        topLevelTaggedTypeProtocols: new Map(),
        topLevelStructFieldTypes: new Map(),
        topLevelProtocolImplsByKey: new Map(),
        topLevelProtocolImplsByTypeMember: new Map(),
        topLevelValueTypes: new Map(),
        topLevelFnReturns: new Map(),
        topLevelAssocReturns: new Map(),
        ...EXPANSION_METHODS,
    };
}
