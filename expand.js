import {
    rootNode,
    namedChildren,
    childOfType,
    childrenOfType,
    hasAnon,
    findAnonBetween,
} from './tree.js';
import { pascalCase, snakeCase, hashText } from './expand-utils.js';

const kids = namedChildren;
const MODULE_FEATURE_NODES = new Set([
    'module_decl',
    'construct_decl',
    'associated_fn_name',
    'qualified_type_ref',
    'type_member_expr',
]);

export function needsExpansion(treeOrNode) {
    return containsModuleFeature(rootNode(treeOrNode));
}

export function expandSource(treeOrNode, source) {
    const root = rootNode(treeOrNode);
    return containsModuleFeature(root) ? new ModuleExpander(root, source).expand() : source;
}

function containsModuleFeature(node) {
    if (!node) return false;
    if (MODULE_FEATURE_NODES.has(node.type)) return true;
    return (node.children ?? []).some(containsModuleFeature);
}

function moduleNameNode(node) {
    const wrapper = childOfType(node, 'module_name');
    if (wrapper) return moduleNameNode(wrapper);
    const moduleRef = childOfType(node, 'module_ref');
    if (moduleRef) return moduleNameNode(moduleRef);
    return node?.type === 'identifier' || node?.type === 'type_ident'
        ? node
        : childOfType(node, 'identifier') ?? childOfType(node, 'type_ident');
}

class ModuleExpander {
    constructor(root, source) {
        this.root = root;
        this.source = source;

        this.moduleTemplates = new Map();
        this.moduleNames = new Set();
        this.namespaceCache = new Map();
        this.namespaceOrder = [];

        this.topLevelValueNames = new Set();
        this.topLevelTypeNames = new Set();
        this.topLevelAssocNames = new Map();
        this.topLevelValueTypes = new Map();
        this.topLevelFnReturns = new Map();
        this.topLevelAssocReturns = new Map();
    }

    expand() {
        this.collectTopLevelSymbols(this.createRootContext());
        this.validateModuleNameCollisions();

        const ctx = this.createRootContext();
        const topLevelOutputs = [];

        for (const item of kids(this.root)) {
            if (item.type === 'module_decl') continue;
            if (item.type === 'construct_decl') {
                this.applyConstruct(item, ctx);
                continue;
            }
            topLevelOutputs.push(this.emitItem(item, ctx, false));
        }

        return [...this.namespaceOrder.map((ns) => ns.source), ...topLevelOutputs]
            .filter(Boolean)
            .join('\n\n');
    }

    createRootContext() {
        return {
            namespace: null,
            typeParams: new Map(),
            aliases: new Map(),
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

    sourceOf(node) {
        return this.source.slice(node.startIndex, node.endIndex);
    }

    collectTopLevelSymbols(ctx) {
        for (const item of kids(this.root)) {
            if (item.type === 'module_decl') this.collectModuleTemplate(item);
        }
        for (const item of kids(this.root)) {
            switch (item.type) {
                case 'module_decl':
                    break;
                case 'construct_decl':
                    this.applyConstruct(item, ctx);
                    break;
                case 'struct_decl':
                    this.topLevelTypeNames.add(childOfType(item, 'type_ident').text);
                    break;
                case 'type_decl': {
                    this.topLevelTypeNames.add(childOfType(item, 'type_ident').text);
                    for (const variant of childrenOfType(childOfType(item, 'variant_list'), 'variant')) {
                        this.topLevelTypeNames.add(childOfType(variant, 'type_ident').text);
                    }
                    break;
                }
                case 'fn_decl':
                    this.collectTopLevelFunction(item, ctx);
                    break;
                case 'export_decl':
                    this.collectTopLevelFunction(childOfType(item, 'fn_decl'), ctx);
                    break;
                case 'global_decl': {
                    const nameNode = childOfType(item, 'identifier');
                    if (nameNode) {
                        this.topLevelValueNames.add(nameNode.text);
                        this.topLevelValueTypes.set(nameNode.text, this.describeType(kids(item).at(-1), ctx));
                    }
                    break;
                }
                case 'import_decl':
                case 'jsgen_decl': {
                    const nameNode = childOfType(item, 'identifier');
                    if (!nameNode) break;
                    this.topLevelValueNames.add(nameNode.text);
                    const returnTypeNode = childOfType(item, 'return_type');
                    if (returnTypeNode) {
                        this.topLevelFnReturns.set(nameNode.text, this.describeReturn(returnTypeNode, ctx));
                        break;
                    }
                    this.topLevelValueTypes.set(nameNode.text, this.describeType(kids(item).at(-1), ctx));
                    break;
                }
            }
        }
    }

    collectTopLevelFunction(node, ctx) {
        const assocNode = childOfType(node, 'associated_fn_name');
        const returnInfo = this.describeReturn(childOfType(node, 'return_type'), ctx);
        if (assocNode) {
            const [ownerNode, nameNode] = kids(assocNode);
            const key = `${ownerNode.text}.${nameNode.text}`;
            if (this.topLevelAssocNames.has(key)) {
                throw new Error(`Duplicate associated function "${key}".`);
            }
            this.topLevelAssocNames.set(key, this.mangleTopLevelAssoc(ownerNode.text, nameNode.text));
            this.topLevelAssocReturns.set(key, returnInfo);
            return;
        }
        const nameNode = childOfType(node, 'identifier');
        if (nameNode) {
            this.topLevelValueNames.add(nameNode.text);
            this.topLevelFnReturns.set(nameNode.text, returnInfo);
        }
    }

    collectModuleTemplate(node) {
        const name = moduleNameNode(node).text;
        if (this.moduleTemplates.has(name)) {
            throw new Error(`Duplicate module "${name}".`);
        }
        const items = kids(node).filter((child) => !['identifier', 'type_ident', 'module_name', 'module_type_param_list'].includes(child.type));
        for (const item of items) this.validateModuleItem(item);
        this.moduleNames.add(name);
        this.moduleTemplates.set(name, {
            name,
            typeParams: childrenOfType(childOfType(node, 'module_type_param_list'), 'type_ident').map((child) => child.text),
            items,
        });
    }

    static #MODULE_ITEM_ERRORS = {
        module_decl: 'nested modules are not supported in v1.',
        construct_decl: 'construct declarations are top-level only in v1.',
        export_decl: 'export declarations are not supported inside modules in v1.',
        test_decl: 'test declarations are not supported inside modules in v1.',
        bench_decl: 'bench declarations are not supported inside modules in v1.',
    };

    validateModuleItem(node) {
        const err = ModuleExpander.#MODULE_ITEM_ERRORS[node.type];
        if (err) throw new Error(err);
    }

    validateModuleNameCollisions() {
        for (const name of this.moduleNames) {
            if (this.topLevelValueNames.has(name)) {
                throw new Error(`Module "${name}" conflicts with a top-level value name.`);
            }
        }
    }

    applyConstruct(node, ctx) {
        const named = kids(node);
        const aliasNode = named[0]?.type === 'identifier' && ['module_ref', 'instantiated_module_ref'].includes(named[1]?.type) ? named[0] : null;
        const moduleRef = childOfType(node, 'module_ref') ?? childOfType(node, 'instantiated_module_ref');
        const namespace = this.resolveNamespaceFromModuleRef(moduleRef, ctx);

        if (aliasNode) {
            const aliasName = aliasNode.text;
            if (ctx.aliases.has(aliasName) || this.moduleNames.has(aliasName) || this.topLevelValueNames.has(aliasName)) {
                throw new Error(`construct alias "${aliasName}" collides with an existing top-level name.`);
            }
            ctx.aliases.set(aliasName, namespace);
            return;
        }

        this.openNamespace(namespace, ctx);
    }

    openNamespace(namespace, ctx) {
        for (const name of namespace.exportedValues) {
            const existing = ctx.openValues.get(name);
            if (this.topLevelValueNames.has(name) || (existing && existing !== namespace)) {
                throw new Error(`construct ${namespace.displayText}; would collide on value "${name}".`);
            }
            ctx.openValues.set(name, namespace);
        }

        for (const name of namespace.exportedTypes) {
            const existing = ctx.openTypes.get(name);
            if (this.topLevelTypeNames.has(name) || (existing && existing !== namespace)) {
                throw new Error(`construct ${namespace.displayText}; would collide on type "${name}".`);
            }
            ctx.openTypes.set(name, namespace);
        }
    }

    resolveNamespaceFromModuleRef(node, ctx) {
        const { name, argNodes } = this.getModuleRef(node);
        return this.resolveNamespaceByNameAndArgs(name, argNodes, ctx);
    }

    resolveNamespaceByNameAndArgs(name, argNodes, ctx) {
        if (argNodes.length === 0 && ctx.aliases.has(name)) return ctx.aliases.get(name);

        const template = this.moduleTemplates.get(name);
        if (!template) throw new Error(`Unknown module "${name}".`);

        const argTexts = argNodes.map((typeNode) => this.emitType(typeNode, ctx));
        if (argTexts.length !== template.typeParams.length) {
            throw new Error(`Module "${name}" expects ${template.typeParams.length} type argument(s), received ${argTexts.length}.`);
        }

        return this.ensureNamespace(template, argTexts, ctx);
    }

    resolveMaybeNamespaceName(name, ctx) {
        if (ctx.aliases.has(name)) return ctx.aliases.get(name);
        const template = this.moduleTemplates.get(name);
        return template && template.typeParams.length === 0 ? this.ensureNamespace(template, [], ctx) : null;
    }

    ensureNamespace(template, argTexts, ctx) {
        const displayText = template.typeParams.length
            ? `${template.name}[${argTexts.join(', ')}]`
            : template.name;
        const key = displayText;
        if (this.namespaceCache.has(key)) return this.namespaceCache.get(key);

        const hash = hashText(key);
        const namespace = {
            key,
            hash,
            displayText,
            template,
            typeParams: new Map(template.typeParams.map((name, index) => [name, argTexts[index]])),
            typeNames: new Map(),
            freeValueNames: new Map(),
            assocNames: new Map(),
            freeValueTypes: new Map(),
            freeFnReturns: new Map(),
            assocReturns: new Map(),
            exportedTypes: [],
            exportedValues: [],
            promotedTypeName: null,
            promotedType: null,
            source: '',
        };

        this.namespaceCache.set(key, namespace);
        this.namespaceOrder.push(namespace);

        const moduleCtx = this.cloneContext(ctx, {
            namespace,
            typeParams: new Map([...ctx.typeParams, ...namespace.typeParams]),
            localValueScopes: [],
        });
        this.collectNamespaceNames(namespace, moduleCtx);
        namespace.source = namespace.template.items
            .map((item) => this.emitItem(item, moduleCtx, true))
            .filter(Boolean)
            .join('\n\n');

        return namespace;
    }

    collectNamespaceNames(namespace, ctx) {
        for (const item of namespace.template.items) {
            switch (item.type) {
                case 'struct_decl': {
                    const name = childOfType(item, 'type_ident').text;
                    this.registerNamespaceType(namespace, name);
                    break;
                }
                case 'type_decl': {
                    const name = childOfType(item, 'type_ident').text;
                    this.registerNamespaceType(namespace, name);
                    for (const variant of childrenOfType(childOfType(item, 'variant_list'), 'variant')) {
                        this.registerNamespaceType(namespace, childOfType(variant, 'type_ident').text);
                    }
                    break;
                }
                case 'fn_decl': {
                    const assocNode = childOfType(item, 'associated_fn_name');
                    if (assocNode) {
                        const [ownerNode, nameNode] = kids(assocNode);
                        const key = `${ownerNode.text}.${nameNode.text}`;
                        if (namespace.assocNames.has(key)) {
                            throw new Error(`Duplicate associated function "${key}" in module "${namespace.displayText}".`);
                        }
                        namespace.assocNames.set(key, this.mangleNamespaceAssoc(namespace, ownerNode.text, nameNode.text));
                        namespace.assocReturns.set(key, this.describeReturn(childOfType(item, 'return_type'), ctx));
                        break;
                    }
                    const nameNode = childOfType(item, 'identifier');
                    this.registerNamespaceValue(namespace, nameNode.text);
                    namespace.freeFnReturns.set(nameNode.text, this.describeReturn(childOfType(item, 'return_type'), ctx));
                    break;
                }
                case 'global_decl': {
                    const nameNode = childOfType(item, 'identifier');
                    this.registerNamespaceValue(namespace, nameNode.text);
                    namespace.freeValueTypes.set(nameNode.text, this.describeType(kids(item).at(-1), ctx));
                    break;
                }
                case 'import_decl':
                case 'jsgen_decl': {
                    const nameNode = childOfType(item, 'identifier');
                    this.registerNamespaceValue(namespace, nameNode.text);
                    const returnTypeNode = childOfType(item, 'return_type');
                    if (returnTypeNode) {
                        namespace.freeFnReturns.set(nameNode.text, this.describeReturn(returnTypeNode, ctx));
                        break;
                    }
                    namespace.freeValueTypes.set(nameNode.text, this.describeType(kids(item).at(-1), ctx));
                    break;
                }
            }
        }
    }

    registerNamespaceType(namespace, name) {
        if (namespace.typeNames.has(name)) throw new Error(`Duplicate type "${name}" in module "${namespace.displayText}".`);
        const value = this.mangleNamespaceType(namespace, name);
        namespace.typeNames.set(name, value);
        if (name === namespace.template.name) {
            namespace.promotedTypeName = name;
            namespace.promotedType = value;
        }
        namespace.exportedTypes.push(name);
    }

    registerNamespaceValue(namespace, name) {
        if (namespace.freeValueNames.has(name)) throw new Error(`Duplicate value "${name}" in module "${namespace.displayText}".`);
        namespace.freeValueNames.set(name, this.mangleNamespaceValue(namespace, name));
        namespace.exportedValues.push(name);
    }

    mangleTopLevelAssoc(owner, member) {
        return `__utu_assoc_${snakeCase(owner)}_${snakeCase(member)}`;
    }

    mangleNamespaceType(namespace, name) {
        return `Utu${namespace.hash}${pascalCase(namespace.template.name)}${pascalCase(name)}`;
    }

    mangleNamespaceValue(namespace, name) {
        return `__utu_${snakeCase(namespace.template.name)}_${namespace.hash}_${snakeCase(name)}`;
    }

    mangleNamespaceAssoc(namespace, owner, member) {
        return `__utu_${snakeCase(namespace.template.name)}_${namespace.hash}_${snakeCase(owner)}_${snakeCase(member)}`;
    }

    getModuleRef(node) {
        const instNode = node?.type === 'instantiated_module_ref' ? node : childOfType(node, 'instantiated_module_ref');
        const target = instNode ?? node;
        const argsNode = childOfType(target, 'module_type_arg_list');
        return { name: moduleNameNode(target).text, argNodes: argsNode ? kids(argsNode) : [] };
    }

    emitItem(node, ctx, inModule) {
        switch (node.type) {
            case 'module_decl':
                throw new Error('nested modules are not supported in v1.');
            case 'construct_decl':
                throw new Error('construct declarations are top-level only in v1.');
            case 'struct_decl':
                return this.emitStructDecl(node, ctx, inModule);
            case 'type_decl':
                return `${this.emitTypeDecl(node, ctx, inModule)};`;
            case 'fn_decl':
                return this.emitFnDecl(node, ctx, inModule);
            case 'global_decl':
                return `${this.emitGlobalDecl(node, ctx, inModule)};`;
            case 'import_decl':
                return `${this.emitImportDecl(node, ctx, inModule)};`;
            case 'jsgen_decl':
                return `${this.emitJsgenDecl(node, ctx, inModule)};`;
            case 'export_decl':
                if (inModule) throw new Error('export declarations are not supported inside modules in v1.');
                return `export ${this.emitFnDecl(childOfType(node, 'fn_decl'), ctx, false)}`;
            case 'test_decl':
                if (inModule) throw new Error('test declarations are not supported inside modules in v1.');
                return this.emitTestDecl(node, ctx);
            case 'bench_decl':
                if (inModule) throw new Error('bench declarations are not supported inside modules in v1.');
                return this.emitBenchDecl(node, ctx);
            default:
                throw new Error(`Unsupported item during module expansion: ${node.type}`);
        }
    }

    emitStructDecl(node, ctx, inModule) {
        const nameNode = childOfType(node, 'type_ident');
        const typeName = inModule ? ctx.namespace.typeNames.get(nameNode.text) : nameNode.text;
        const fields = childrenOfType(childOfType(node, 'field_list'), 'field').map((field) => this.emitField(field, ctx));
        const rec = hasAnon(node, 'rec') ? 'rec ' : '';
        return `${rec}struct ${typeName} {\n${fields.map((field) => `    ${field},`).join('\n')}\n}`;
    }

    emitField(node, ctx) {
        const [nameNode, typeNode] = kids(node);
        return `${hasAnon(node, 'mut') ? 'mut ' : ''}${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
    }

    emitTypeDecl(node, ctx, inModule) {
        const typeNameNode = childOfType(node, 'type_ident');
        const typeName = inModule ? ctx.namespace.typeNames.get(typeNameNode.text) : typeNameNode.text;
        const variants = childrenOfType(childOfType(node, 'variant_list'), 'variant').map((variant) => this.emitVariant(variant, ctx, inModule));
        const rec = hasAnon(node, 'rec') ? 'rec ' : '';
        return `${rec}type ${typeName} = ${variants.map((variant) => `| ${variant}`).join(' ')}`;
    }

    emitVariant(node, ctx, inModule) {
        const nameNode = childOfType(node, 'type_ident');
        const name = inModule ? ctx.namespace.typeNames.get(nameNode.text) : nameNode.text;
        const fields = childrenOfType(childOfType(node, 'field_list'), 'field').map((field) => this.emitField(field, ctx));
        return fields.length ? `${name} { ${fields.join(', ')} }` : name;
    }

    emitFnDecl(node, ctx, inModule) {
        const assocNode = childOfType(node, 'associated_fn_name');
        const name = assocNode
            ? this.emitAssociatedFnName(assocNode, ctx, inModule)
            : inModule
                ? ctx.namespace.freeValueNames.get(childOfType(node, 'identifier').text)
                : childOfType(node, 'identifier').text;
        const params = childrenOfType(childOfType(node, 'param_list'), 'param');
        const fnCtx = this.pushScope(ctx);
        for (const param of params) {
            this.declareLocal(fnCtx, childOfType(param, 'identifier').text, this.describeType(kids(param)[1], ctx));
        }
        return `fun ${name}(${params.map((param) => this.emitParam(param, ctx)).join(', ')}) ${this.emitReturnType(childOfType(node, 'return_type'), ctx)} ${this.emitBlock(childOfType(node, 'block'), fnCtx, true)}`;
    }

    emitAssociatedFnName(node, ctx, inModule) {
        const [ownerNode, nameNode] = kids(node);
        if (inModule) {
            const value = ctx.namespace.assocNames.get(`${ownerNode.text}.${nameNode.text}`);
            if (!value) throw new Error(`Unknown associated function "${ownerNode.text}.${nameNode.text}" in module "${ctx.namespace.displayText}".`);
            return value;
        }
        const key = `${ownerNode.text}.${nameNode.text}`;
        const value = this.topLevelAssocNames.get(key);
        if (!value) throw new Error(`Unknown associated function "${key}".`);
        return value;
    }

    emitParam(node, ctx) {
        const [nameNode, typeNode] = kids(node);
        return `${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
    }

    emitReturnType(node, ctx) {
        if (!node || childOfType(node, 'void_type')) return 'void';
        const parts = [];
        for (let index = 0; index < node.children.length; index += 1) {
            const child = node.children[index];
            if (!child.isNamed || child.type === 'void_type') continue;
            let part = this.emitType(child, ctx);
            if (node.children[index + 1]?.type === '#') {
                const errorType = node.children[index + 2]?.isNamed ? this.emitType(node.children[index + 2], ctx) : 'null';
                part += ` # ${errorType}`;
                index += node.children[index + 2]?.isNamed ? 2 : 1;
            }
            parts.push(part);
        }
        return parts.join(', ');
    }

    emitGlobalDecl(node, ctx, inModule) {
        const [nameNode, typeNode, valueNode] = kids(node);
        const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
        return `let ${name}: ${this.emitType(typeNode, ctx)} = ${this.emitExpr(valueNode, ctx)}`;
    }

    emitImportDecl(node, ctx, inModule) {
        const moduleNode = childOfType(node, 'string_lit');
        const nameNode = childOfType(node, 'identifier');
        const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
        const returnTypeNode = childOfType(node, 'return_type');
        if (returnTypeNode) {
            return `shimport ${moduleNode.text} ${name}(${this.emitImportParamList(childOfType(node, 'import_param_list'), ctx)}) ${this.emitReturnType(returnTypeNode, ctx)}`;
        }
        const typeNode = kids(node).at(-1);
        return `shimport ${moduleNode.text} ${name}: ${this.emitType(typeNode, ctx)}`;
    }

    emitImportParamList(node, ctx) {
        return kids(node).map((child) => child.type === 'param' ? this.emitParam(child, ctx) : this.emitType(child, ctx)).join(', ');
    }

    emitJsgenDecl(node, ctx, inModule) {
        const sourceNode = childOfType(node, 'jsgen_lit');
        const nameNode = childOfType(node, 'identifier');
        const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
        return `escape ${sourceNode.text} ${name}(${this.emitImportParamList(childOfType(node, 'import_param_list'), ctx)}) ${this.emitReturnType(childOfType(node, 'return_type'), ctx)}`;
    }

    emitTestDecl(node, ctx) {
        return `test ${childOfType(node, 'string_lit').text} ${this.emitBlock(childOfType(node, 'block'), this.pushScope(ctx), true)}`;
    }

    emitBenchDecl(node, ctx) {
        const captureNode = childOfType(childOfType(node, 'bench_capture'), 'identifier');
        const benchCtx = this.pushScope(ctx);
        if (captureNode) this.declareLocal(benchCtx, captureNode.text, null);
        return `bench ${childOfType(node, 'string_lit').text} |${captureNode.text}| { ${this.emitSetupDecl(childOfType(node, 'setup_decl'), benchCtx)} }`;
    }

    emitSetupDecl(node, ctx) {
        const parts = [];
        for (const child of kids(node)) {
            if (child.type === 'measure_decl') {
                parts.push(`measure ${this.emitBlock(childOfType(child, 'block'), this.pushScope(ctx), true)}`);
                continue;
            }
            parts.push(`${this.emitExpr(child, ctx)};`);
        }
        return `setup { ${parts.join(' ')} }`;
    }

    describeBareType(name, ctx) {
        if (ctx.typeParams.has(name)) return { text: ctx.typeParams.get(name), owner: name, namespace: ctx.namespace };
        if (ctx.namespace?.typeNames.has(name)) return { text: ctx.namespace.typeNames.get(name), owner: name, namespace: ctx.namespace };
        if (this.topLevelTypeNames.has(name)) return { text: name, owner: name, namespace: null };
        if (ctx.openTypes.has(name)) {
            const namespace = ctx.openTypes.get(name);
            return { text: namespace.typeNames.get(name), owner: name, namespace };
        }
        const namespace = this.resolveMaybeNamespaceName(name, ctx);
        return namespace?.promotedType
            ? { text: namespace.promotedType, owner: namespace.promotedTypeName, namespace }
            : { text: name, owner: null, namespace: null };
    }

    describeType(node, ctx) {
        if (!node) return null;
        switch (node.type) {
            case 'scalar_type':
                return { text: node.text, owner: null, namespace: null };
            case 'type_ident':
                return this.describeBareType(node.text, ctx);
            case 'instantiated_module_ref': {
                const namespace = this.resolveNamespaceFromModuleRef(node, ctx);
                return { text: this.resolvePromotedType(namespace), owner: namespace.promotedTypeName, namespace };
            }
            case 'qualified_type_ref': {
                const moduleRef = childOfType(node, 'module_ref') ?? childOfType(node, 'instantiated_module_ref');
                const typeNode = childOfType(node, 'type_ident');
                const namespace = this.resolveNamespaceFromModuleRef(moduleRef, ctx);
                return { text: namespace.typeNames.get(typeNode.text), owner: typeNode.text, namespace };
            }
            case 'nullable_type': {
                const info = this.describeType(kids(node)[0], ctx);
                return info ? { ...info, text: `?${info.text}` } : { text: this.emitType(node, ctx), owner: null, namespace: null };
            }
            case 'ref_type': {
                if (node.children[0]?.type === 'array') return { text: this.emitType(node, ctx), owner: null, namespace: null };
                const child = kids(node)[0];
                return child ? this.describeType(child, ctx) : { text: node.text, owner: null, namespace: null };
            }
            case 'paren_type': {
                const info = this.describeType(kids(node)[0], ctx);
                return info ? { ...info, text: `(${info.text})` } : { text: this.emitType(node, ctx), owner: null, namespace: null };
            }
            default:
                return { text: this.emitType(node, ctx), owner: null, namespace: null };
        }
    }

    describeReturn(node, ctx) {
        if (!node || childOfType(node, 'void_type')) return null;
        const info = this.describeType(namedChildren(node)[0], ctx);
        if (!info) return null;
        return node.children.some((child) => child.type === ',')
            ? { text: this.emitReturnType(node, ctx), owner: null, namespace: null }
            : { ...info, text: this.emitReturnType(node, ctx) };
    }

    stripNullable(info) {
        return info?.text.endsWith('# null')
            ? { ...info, text: info.text.replace(/\s*#\s*null$/, '') }
            : info;
    }

    emitType(node, ctx) {
        if (!node) return 'void';
        switch (node.type) {
            case 'scalar_type':
                return node.text;
            case 'type_ident':
                return this.resolveBareType(node.text, ctx);
            case 'instantiated_module_ref':
                return this.resolvePromotedType(this.resolveNamespaceFromModuleRef(node, ctx));
            case 'qualified_type_ref':
                return this.describeType(node, ctx).text;
            case 'nullable_type':
                return `?${this.emitType(kids(node)[0], ctx)}`;
            case 'ref_type': {
                if (node.children[0]?.type === 'array') return `array[${this.emitType(kids(node)[0], ctx)}]`;
                const child = kids(node)[0];
                return child ? this.emitType(child, ctx) : node.text;
            }
            case 'func_type':
                return `fun(${kids(childOfType(node, 'type_list')).map((child) => this.emitType(child, ctx)).join(', ')}) ${this.emitReturnType(childOfType(node, 'return_type'), ctx)}`;
            case 'paren_type':
                return `(${this.emitType(kids(node)[0], ctx)})`;
            default:
                return node.text;
        }
    }

    resolveBareType(name, ctx) {
        return this.describeBareType(name, ctx).text;
    }

    resolvePromotedType(namespace) {
        if (namespace.promotedType) return namespace.promotedType;
        throw new Error(`Module "${namespace.displayText}" does not expose a promoted type.`);
    }

    emitExpr(node, ctx) {
        switch (node.type) {
            case 'literal':
                return node.text;
            case 'identifier':
                return this.resolveBareValue(node.text, ctx);
            case 'instantiated_module_ref':
                throw new Error(`Module path "${this.sourceOf(node)}" is not a value.`);
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
                return `${this.emitExpr(kids(node)[0], ctx)} = ${this.emitExpr(kids(node)[1], ctx)}`;
            case 'fatal_expr':
                return 'fatal';
            case 'block':
                return this.emitBlock(node, this.pushScope(ctx), true);
            default:
                throw new Error(`Unsupported expression during module expansion: ${node.type}`);
        }
    }

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

    emitCallExpr(node, ctx) {
        const callee = kids(node)[0];
        const args = kids(childOfType(node, 'arg_list')).map((arg) => this.emitExpr(arg, ctx));

        if (callee?.type === 'field_expr') {
            const moduleValue = this.resolveModuleField(callee, ctx);
            if (moduleValue) return `${moduleValue}(${args.join(', ')})`;
            const method = this.resolveMethodCall(callee, ctx);
            if (method) return `${method.callee}(${[this.emitExpr(kids(callee)[0], ctx), ...args].join(', ')})`;
        }

        if (callee?.type === 'type_member_expr') {
            return `${this.resolveTypeMemberExpr(callee, ctx)}(${args.join(', ')})`;
        }

        return `${this.emitExpr(callee, ctx)}(${args.join(', ')})`;
    }

    emitFieldExpr(node, ctx) {
        const moduleValue = this.resolveModuleField(node, ctx);
        if (moduleValue) return moduleValue;
        return `${this.emitExpr(kids(node)[0], ctx)}.${kids(node)[1].text}`;
    }

    resolveMethodCall(node, ctx) {
        const [baseNode, memberNode] = kids(node);
        const info = this.inferExprInfo(baseNode, ctx);
        if (!info?.owner || !memberNode) return null;
        return this.resolveAssociatedEntryFromInfo(info, memberNode.text, ctx);
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
        if (['qualified_type_ref', 'inline_module_type_path', 'instantiated_module_ref'].includes(ownerNode.type)) {
            const namespace = this.resolveNamespaceFromModuleRef(ownerNode, ctx);
            const ownerName = childOfType(ownerNode, 'type_ident')?.text ?? namespace.promotedTypeName;
            const resolved = namespace.assocNames.get(`${ownerName}.${memberNode.text}`);
            if (resolved) return resolved;
            throw new Error(`Unknown associated function "${ownerName}.${memberNode.text}" in module "${namespace.displayText}".`);
        }

        const ownerName = ownerNode.text;
        if (ctx.namespace?.assocNames.has(`${ownerName}.${memberNode.text}`)) {
            return ctx.namespace.assocNames.get(`${ownerName}.${memberNode.text}`);
        }
        if (this.topLevelAssocNames.has(`${ownerName}.${memberNode.text}`)) {
            return this.topLevelAssocNames.get(`${ownerName}.${memberNode.text}`);
        }
        if (ctx.openTypes.has(ownerName)) {
            const namespace = ctx.openTypes.get(ownerName);
            const resolved = namespace.assocNames.get(`${ownerName}.${memberNode.text}`);
            if (resolved) return resolved;
        }
        const promoted = this.resolveMaybeNamespaceName(ownerName, ctx);
        if (promoted?.promotedTypeName) {
            const resolved = promoted.assocNames.get(`${promoted.promotedTypeName}.${memberNode.text}`);
            if (resolved) return resolved;
        }
        throw new Error(`Unknown associated function "${ownerName}.${memberNode.text}".`);
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
        if (!callee) throw new Error(`Unknown value "${memberNode.text}" in module "${namespace.displayText}".`);
        return `${callee}(${kids(argsNode).map((arg) => this.emitExpr(arg, ctx)).join(', ')})`;
    }

    emitPipeExpr(node, ctx) {
        const valueNode = kids(node)[0];
        const targetNode = childOfType(node, 'pipe_target');
        const { callee, args } = this.parsePipeTarget(targetNode, ctx);
        const value = this.emitExpr(valueNode, ctx);
        const placeholderCount = args.filter((arg) => arg.kind === 'placeholder').length;
        if (placeholderCount > 1) throw new Error('pipe targets can contain at most one underscore placeholder');
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
                    const value = this.resolveNamespaceValue(namespace, second.text);
                    if (!value) throw new Error(`Unknown value "${second.text}" in module "${namespace.displayText}".`);
                    return { callee: value, args };
                }
            }
            if (['module_ref', 'instantiated_module_ref'].includes(first.type)) {
                const namespace = this.resolveNamespaceFromModuleRef(first, ctx);
                const value = this.resolveNamespaceValue(namespace, second.text);
                if (!value) throw new Error(`Unknown value "${second.text}" in module "${namespace.displayText}".`);
                return { callee: value, args };
            }
        }

        if (pathParts.length === 3 && pathParts[0].type === 'identifier' && pathParts[1].type === 'type_ident') {
            const namespace = this.resolveMaybeNamespaceName(pathParts[0].text, ctx);
            if (!namespace) throw new Error(`Unknown module or construct alias "${pathParts[0].text}".`);
            const ownerName = pathParts[1].text;
            const memberName = pathParts[2].text;
            const value = namespace.assocNames.get(`${ownerName}.${memberName}`);
            if (!value) throw new Error(`Unknown associated function "${ownerName}.${memberName}" in module "${namespace.displayText}".`);
            return { callee: value, args };
        }

        if (pathParts.length === 3 && ['module_ref', 'instantiated_module_ref'].includes(pathParts[0].type)) {
            const namespace = this.resolveNamespaceFromModuleRef(pathParts[0], ctx);
            const ownerName = pathParts[1].text;
            const memberName = pathParts[2].text;
            const value = namespace.assocNames.get(`${ownerName}.${memberName}`);
            if (!value) throw new Error(`Unknown associated function "${ownerName}.${memberName}" in module "${namespace.displayText}".`);
            return { callee: value, args };
        }

        throw new Error(`Unsupported pipe target "${this.sourceOf(node)}".`);
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

    resolveAssociatedByOwner(ownerName, memberName, ctx) {
        const entry = this.resolveAssociatedEntry(ownerName, memberName, ctx);
        if (entry) return entry.callee;
        throw new Error(`Unknown associated function "${ownerName}.${memberName}".`);
    }

    resolveNamespaceValue(namespace, memberName) {
        return namespace?.freeValueNames.get(memberName)
            ?? (namespace?.promotedTypeName ? namespace.assocNames.get(`${namespace.promotedTypeName}.${memberName}`) : null)
            ?? null;
    }

    resolveNamespaceAssoc(namespace, ownerName, memberName) {
        const key = `${ownerName}.${memberName}`;
        const callee = namespace?.assocNames.get(key);
        return callee ? { callee, returnInfo: namespace.assocReturns.get(key) ?? null } : null;
    }

    resolveAssociatedEntry(ownerName, memberName, ctx) {
        const local = this.resolveNamespaceAssoc(ctx.namespace, ownerName, memberName);
        if (local) return local;
        if (this.topLevelAssocNames.has(`${ownerName}.${memberName}`)) {
            return {
                callee: this.topLevelAssocNames.get(`${ownerName}.${memberName}`),
                returnInfo: this.topLevelAssocReturns.get(`${ownerName}.${memberName}`) ?? null,
            };
        }
        if (ctx.openTypes.has(ownerName)) {
            const opened = this.resolveNamespaceAssoc(ctx.openTypes.get(ownerName), ownerName, memberName);
            if (opened) return opened;
        }
        const promoted = this.resolveMaybeNamespaceName(ownerName, ctx);
        return promoted?.promotedTypeName ? this.resolveNamespaceAssoc(promoted, promoted.promotedTypeName, memberName) : null;
    }

    resolveAssociatedEntryFromInfo(info, memberName, ctx) {
        if (!info?.owner) return null;
        if (info.namespace) {
            const resolved = this.resolveNamespaceAssoc(info.namespace, info.owner, memberName);
            if (resolved) return resolved;
        }
        return this.resolveAssociatedEntry(info.owner, memberName, ctx);
    }

    inferExprInfo(node, ctx) {
        if (!node) return null;
        switch (node.type) {
            case 'identifier':
                return this.resolveValueType(node.text, ctx);
            case 'paren_expr':
                return this.inferExprInfo(kids(node)[0], ctx);
            case 'struct_init':
                return this.describeType(kids(node)[0], ctx);
            case 'call_expr':
                return this.inferCallExprInfo(node, ctx);
            case 'promoted_module_call_expr':
                return this.resolveNamespaceValueReturn(this.resolveNamespaceFromModuleRef(node, ctx), childOfType(node, 'identifier')?.text);
            case 'else_expr':
                return this.inferExprInfo(kids(node)[1], ctx) ?? this.stripNullable(this.inferExprInfo(kids(node)[0], ctx));
            default:
                return null;
        }
    }

    inferCallExprInfo(node, ctx) {
        const callee = kids(node)[0];
        if (!callee) return null;
        if (callee.type === 'identifier') return this.resolveFunctionReturn(callee.text, ctx);
        if (callee.type === 'type_member_expr') {
            const memberNode = childOfType(callee, 'identifier');
            const ownerNode = kids(callee).find((child) => child !== memberNode);
            return memberNode ? this.resolveAssociatedReturn(ownerNode, memberNode.text, ctx) : null;
        }
        if (callee.type === 'field_expr') {
            const [baseNode, memberNode] = kids(callee);
            if (baseNode?.type === 'identifier' && memberNode && !this.isLocalValue(ctx, baseNode.text)) {
                return this.resolveNamespaceValueReturn(this.resolveMaybeNamespaceName(baseNode.text, ctx), memberNode.text);
            }
            return this.resolveMethodCall(callee, ctx)?.returnInfo ?? null;
        }
        if (callee.type === 'promoted_module_call_expr') {
            return this.resolveNamespaceValueReturn(this.resolveNamespaceFromModuleRef(callee, ctx), childOfType(callee, 'identifier')?.text);
        }
        return null;
    }

    resolveAssociatedReturn(ownerNode, memberName, ctx) {
        if (!ownerNode) return null;
        if (['qualified_type_ref', 'inline_module_type_path', 'instantiated_module_ref'].includes(ownerNode.type)) {
            const namespace = this.resolveNamespaceFromModuleRef(ownerNode, ctx);
            const ownerName = childOfType(ownerNode, 'type_ident')?.text ?? namespace.promotedTypeName;
            return this.resolveNamespaceAssoc(namespace, ownerName, memberName)?.returnInfo ?? null;
        }
        return this.resolveAssociatedEntry(ownerNode.text, memberName, ctx)?.returnInfo ?? null;
    }

    emitIfExpr(node, ctx) {
        const parts = kids(node);
        const cond = parts[0];
        const thenBlock = parts[1];
        const elseBranch = parts[2];
        return `if ${this.emitExpr(cond, ctx)} ${this.emitBlock(thenBlock, this.pushScope(ctx), true)}${elseBranch ? ` else ${elseBranch.type === 'if_expr' ? this.emitExpr(elseBranch, ctx) : this.emitBlock(elseBranch, this.pushScope(ctx), true)}` : ''}`;
    }

    emitMatchExpr(node, ctx) {
        const [subject, ...arms] = kids(node);
        const renderedArms = arms.map((arm) => `${arm.namedChildren[0].text} => ${this.emitExpr(arm.namedChildren.at(-1), ctx)},`);
        return `match ${this.emitExpr(subject, ctx)} { ${renderedArms.join(' ')} }`;
    }

    emitAltExpr(node, ctx) {
        const [subject, ...arms] = kids(node);
        const renderedArms = arms.map((arm) => this.emitAltArm(arm, ctx));
        return `alt ${this.emitExpr(subject, ctx)} { ${renderedArms.join(' ')} }`;
    }

    emitAltArm(node, ctx) {
        const inner = this.pushScope(ctx);
        const named = kids(node);
        const patternNode = named[0];
        const typeNode = named.find((child) => child.type === 'type_ident' || child.type === 'qualified_type_ref') ?? null;
        const exprNode = named.at(-1);
        if (patternNode.type === 'identifier' && patternNode.text !== '_') this.declareLocal(inner, patternNode.text);
        const head = typeNode
            ? `${patternNode.text}: ${this.emitType(typeNode, ctx)}`
            : patternNode.text;
        return `${head} => ${this.emitExpr(exprNode, inner)},`;
    }

    emitBlockExpr(node, ctx) {
        const labelNode = childOfType(node, 'identifier');
        const blockNode = childOfType(node, 'block');
        return `${labelNode ? `${labelNode.text}: ` : ''}${this.emitBlock(blockNode, this.pushScope(ctx), true)}`;
    }

    emitForExpr(node, ctx) {
        const forCtx = this.pushScope(ctx);
        const captureNode = childOfType(node, 'capture');
        for (const ident of childrenOfType(captureNode, 'identifier')) this.declareLocal(forCtx, ident.text);
        return `for (${this.emitForSources(childOfType(node, 'for_sources'), ctx)})${captureNode ? ` |${childrenOfType(captureNode, 'identifier').map((child) => child.text).join(', ')}|` : ''} ${this.emitBlock(childOfType(node, 'block'), forCtx, true)}`;
    }

    emitForSources(node, ctx) {
        return childrenOfType(node, 'for_source')
            .map((source) => `${this.emitExpr(kids(source)[0], ctx)}..${this.emitExpr(kids(source)[1], ctx)}`)
            .join(', ');
    }

    emitWhileExpr(node, ctx) {
        const condition = kids(node).find((child) => child.type !== 'block');
        return `while (${condition ? this.emitExpr(condition, ctx) : ''}) ${this.emitBlock(childOfType(node, 'block'), this.pushScope(ctx), true)}`;
    }

    emitBindExpr(node, ctx) {
        const targets = childrenOfType(node, 'bind_target');
        const valueNode = kids(node).at(-1);
        const rendered = `let ${targets.map((target) => `${childOfType(target, 'identifier').text}: ${this.emitType(kids(target).at(-1), ctx)}`).join(', ')} = ${this.emitExpr(valueNode, ctx)}`;
        for (const target of targets) this.declareLocal(ctx, childOfType(target, 'identifier').text, this.describeType(kids(target).at(-1), ctx));
        return rendered;
    }

    emitStructInit(node, ctx) {
        const typeNode = kids(node)[0];
        const typeName = this.emitType(typeNode, ctx);
        const fieldInits = childrenOfType(node, 'field_init').map((field) => `${childOfType(field, 'identifier').text}: ${this.emitExpr(kids(field).at(-1), ctx)}`);
        return `${typeName} { ${fieldInits.join(', ')} }`;
    }

    emitArrayInit(node, ctx) {
        const [typeNode, methodNode] = kids(node);
        return `array[${this.emitType(typeNode, ctx)}].${methodNode.text}(${kids(childOfType(node, 'arg_list')).map((arg) => this.emitExpr(arg, ctx)).join(', ')})`;
    }

    emitBlock(node, ctx, reuseCurrentScope = false) {
        const blockCtx = reuseCurrentScope ? ctx : this.pushScope(ctx);
        const statements = [];
        for (const stmt of kids(node)) {
            statements.push(`${this.emitExpr(stmt, blockCtx)};`);
        }
        return `{\n${statements.map((stmt) => `    ${stmt}`).join('\n')}\n}`;
    }
}

