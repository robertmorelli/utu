export class ModuleExpander {
    constructor(root, source, options = {}) {
        this.root = root;
        this.source = source;
        this.uri = options.uri ?? null;
        this.loadImport = options.loadImport ?? null;
        this.parseSource = options.parseSource ?? null;

        this.moduleTemplates = new Map();
        this.moduleNames = new Set();
        this.namespaceCache = new Map();
        this.namespaceOrder = [];
        this.loadedFiles = new Map();
        this.loadingFiles = new Set();
        this.loadedFileDisposers = [];

        this.topLevelValueNames = new Set();
        this.topLevelTypeNames = new Set();
        this.topLevelAssocNames = new Map();
        this.topLevelProtocolNames = new Set();
        this.topLevelProtocolMembers = new Map();
        this.topLevelProtocolSetterMembers = new Map();
        this.topLevelProtocolImplementers = new Map();
        this.topLevelTaggedTypeProtocols = new Map();
        this.topLevelStructFieldTypes = new Map();
        this.topLevelProtocolImplsByKey = new Map();
        this.topLevelProtocolImplsByTypeMember = new Map();
        this.topLevelValueTypes = new Map();
        this.topLevelFnReturns = new Map();
        this.topLevelAssocReturns = new Map();
    }

    createRootContext() {
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

    cloneContext(ctx, overrides = {}) {
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

    pushScope(ctx) {
        return this.cloneContext(ctx, {
            localValueScopes: [...ctx.localValueScopes, new Map()],
        });
    }

    declareLocal(ctx, name, info = null) {
        const scope = ctx.localValueScopes.at(-1);
        if (scope) scope.set(name, info);
    }

    isLocalValue(ctx, name) {
        for (let index = ctx.localValueScopes.length - 1; index >= 0; index -= 1) {
            if (ctx.localValueScopes[index].has(name)) return true;
        }
        return false;
    }

    lookupLocal(ctx, name) {
        for (let index = ctx.localValueScopes.length - 1; index >= 0; index -= 1) {
            if (ctx.localValueScopes[index].has(name)) return ctx.localValueScopes[index].get(name);
        }
        return undefined;
    }
}
