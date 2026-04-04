import {
    rootNode,
    namedChildren,
    childOfType,
    childrenOfType,
    hasAnon,
    findAnonBetween,
    throwOnParseErrors,
} from "./a1_4.js";

const kids = namedChildren;

export function pascalCase(value) {
    const parts = String(value).match(/[A-Za-z0-9]+/g) ?? ["X"];
    return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join("");
}

export function snakeCase(value) {
    const normalized = String(value)
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^A-Za-z0-9_]+/g, "_")
        .replace(/_+/g, "_")
        .toLowerCase();
    return normalized || "x";
}

export function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0).toString(36);
}

export const BUILTIN_METHOD_RETURN_INFO = new Map([
    ["array.len", { text: "i32", owner: null, namespace: null }],
]);

export const MODULE_FEATURE_NODES = new Set([
    "file_import_decl",
    "module_decl",
    "construct_decl",
    "proto_decl",
    "associated_fn_name",
    "qualified_type_ref",
    "type_member_expr",
]);

export function containsModuleFeature(node) {
    if (!node) return false;
    if (MODULE_FEATURE_NODES.has(node.type)) return true;
    if (node.type === "call_expr") {
        const callee = namedChildren(node)[0];
        if (callee?.type === "field_expr" || callee?.type === "type_member_expr") return true;
    }
    return (node.children ?? []).some(containsModuleFeature);
}

export function moduleNameNode(node) {
    const wrapper = childOfType(node, "module_name");
    if (wrapper) return moduleNameNode(wrapper);
    const moduleRef = childOfType(node, "module_ref");
    if (moduleRef) return moduleNameNode(moduleRef);
    return node?.type === "identifier" || node?.type === "type_ident"
        ? node
        : childOfType(node, "identifier") ?? childOfType(node, "type_ident");
}

export function sameTypeInfo(left, right) {
    return (left?.text ?? null) === (right?.text ?? null);
}

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

function loadRootFileImports() {
    const items = this.flattenLibraryItems ? this.flattenLibraryItems(kids(this.root)) : kids(this.root);
    return Promise.all(items.map(async (item) => {
        if (item.type !== "file_import_decl") return;
        const binding = await this.resolveFileImportBinding(item, this.uri);
        this.registerModuleTemplate(binding.template);
    }));
}

async function resolveFileImportBinding(node, fromUri) {
    if (!this.loadImport) {
        throw new Error("Cross-file module imports require a host loader.");
    }
    const sourceName = moduleNameNode(childOfType(node, "imported_module_name"))?.text;
    const capturedName = moduleNameNode(childOfType(node, "captured_module_name"))?.text ?? sourceName;
    const specifier = childOfType(node, "string_lit")?.text.slice(1, -1);
    if (!sourceName || !capturedName || !specifier) {
        throw new Error("Malformed file import declaration.");
    }
    const descriptor = await this.loadImportedFile(fromUri, specifier);
    const template = descriptor.templatesByName.get(sourceName);
    if (!template) {
        throw new Error(`Imported file ${JSON.stringify(descriptor.uri)} does not define module "${sourceName}"`);
    }
    return {
        alias: capturedName,
        template: this.cloneModuleTemplate(template, capturedName),
    };
}

function loadImportedFile(fromUri, specifier) {
    const cacheKey = `${fromUri ?? "memory://utu"}::${specifier}`;
    if (this.loadedFiles.has(cacheKey)) return this.loadedFiles.get(cacheKey);
    if (this.loadingFiles.has(cacheKey)) {
        throw new Error(`Cyclic file import detected for ${JSON.stringify(specifier)}`);
    }
    this.loadingFiles.add(cacheKey);
    const promise = this.loadImportedFileNow(fromUri, specifier)
        .finally(() => this.loadingFiles.delete(cacheKey));
    this.loadedFiles.set(cacheKey, promise);
    return promise;
}

async function loadImportedFileNow(fromUri, specifier) {
    const loaded = await this.loadImport(fromUri, specifier);
    if (!loaded?.source || !loaded?.uri) {
        throw new Error(`Failed to load imported UTU file ${JSON.stringify(specifier)}`);
    }
    const parsed = loaded.root
        ? { root: rootNode(loaded.root), dispose: loaded.dispose ?? (() => {}) }
        : await this.parseImportedSource(loaded.source, loaded.uri);
    const root = rootNode(parsed.root);
    throwOnParseErrors(root);
    this.loadedFileDisposers.push(parsed.dispose);
    const fileImports = [];
    const templatesByName = new Map();

    for (const item of kids(root)) {
        if (item.type === "file_import_decl") {
            fileImports.push(await this.resolveFileImportBinding(item, loaded.uri));
            continue;
        }
        if (item.type !== "module_decl") {
            throw new Error(`Imported file ${JSON.stringify(loaded.uri)} may only contain module declarations and file imports`);
        }
        const template = this.buildModuleTemplate(item);
        if (templatesByName.has(template.name)) {
            throw new Error(`Imported file ${JSON.stringify(loaded.uri)} defines duplicate module "${template.name}"`);
        }
        templatesByName.set(template.name, template);
    }

    const fileBindings = new Map();
    for (const [name, template] of templatesByName) fileBindings.set(name, template);
    for (const binding of fileImports) {
        if (fileBindings.has(binding.alias)) {
            throw new Error(`Imported file ${JSON.stringify(loaded.uri)} defines duplicate module binding "${binding.alias}"`);
        }
        fileBindings.set(binding.alias, binding.template);
    }

    for (const template of templatesByName.values()) {
        template.moduleBindings = fileBindings;
    }

    return { uri: loaded.uri, templatesByName };
}

function parseImportedSource(source, uri) {
    if (!this.parseSource) {
        throw new Error(`Cross-file module imports require a parser for ${JSON.stringify(uri)}`);
    }
    return this.parseSource(source, uri);
}

function buildModuleTemplate(node) {
    const name = moduleNameNode(node).text;
    const items = kids(node).filter((child) => !["identifier", "type_ident", "module_name", "module_type_param_list"].includes(child.type));
    const unsupported = items.find((item) => ["module_decl", "construct_decl", "library_decl", "test_decl", "bench_decl", "file_import_decl"].includes(item.type)) ?? null;
    if (unsupported) {
        const label = {
            module_decl: "nested modules",
            construct_decl: "construct declarations",
            library_decl: "library declarations",
            test_decl: "test declarations",
            bench_decl: "bench declarations",
            file_import_decl: "file imports",
        }[unsupported.type];
        throw new Error(`${label} are not supported inside modules in v1`);
    }
    return {
        name,
        typeParams: childrenOfType(childOfType(node, "module_type_param_list"), "type_ident").map((child) => child.text),
        items,
        moduleBindings: new Map(),
    };
}

function cloneModuleTemplate(template, name = template.name) {
    return {
        ...template,
        name,
        typeParams: [...template.typeParams],
        items: [...template.items],
        moduleBindings: template.moduleBindings,
    };
}

function registerModuleTemplate(template) {
    if (this.moduleTemplates.has(template.name)) {
        throw new Error(`Duplicate module "${template.name}"`);
    }
    this.moduleNames.add(template.name);
    this.moduleTemplates.set(template.name, template);
}

function collectSymbols(items, ctx, handlers) {
    for (const item of items) {
        switch (item.type) {
            case "library_decl":
                this.collectSymbols(kids(item), ctx, handlers);
                break;
            case "module_decl":
            case "file_import_decl":
                break;
            case "construct_decl":
                handlers.onConstruct?.(item);
                break;
            case "struct_decl":
                handlers.onType(childOfType(item, "type_ident").text);
                break;
            case "proto_decl":
                handlers.onType?.(childOfType(item, "type_ident").text);
                break;
            case "type_decl":
                handlers.onType(childOfType(item, "type_ident").text);
                for (const variant of childrenOfType(childOfType(item, "variant_list"), "variant")) {
                    handlers.onType(childOfType(variant, "type_ident").text);
                }
                break;
            case "fn_decl":
                this.collectFunctionSymbol(item, ctx, handlers);
                break;
            case "global_decl":
                this.collectValueSymbol(item, kids(item).at(-1), ctx, handlers.onValue);
                break;
            case "jsgen_decl": {
                const returnTypeNode = childOfType(item, "return_type");
                this.collectValueSymbol(item, returnTypeNode ?? kids(item).at(-1), ctx, returnTypeNode ? handlers.onFunction : handlers.onValue, returnTypeNode);
                break;
            }
        }
    }
}

function collectFunctionSymbol(node, ctx, handlers) {
    const assocNode = childOfType(node, "associated_fn_name");
    const returnInfo = this.describeReturn(childOfType(node, "return_type"), ctx);
    if (assocNode) {
        const [ownerNode, nameNode] = kids(assocNode);
        const protocolOwner = this.resolveProtocolOwnerName(ownerNode.text, ctx);
        if (protocolOwner) {
            handlers.onProtocolImpl?.(protocolOwner, nameNode.text, node, returnInfo);
            return;
        }
        handlers.onAssoc(ownerNode.text, nameNode.text, returnInfo);
        return;
    }
    const nameNode = childOfType(node, "identifier");
    if (nameNode) handlers.onFunction(nameNode.text, returnInfo);
}

function collectValueSymbol(node, valueTypeNode, ctx, register, returnTypeNode = null) {
    const nameNode = childOfType(node, "identifier");
    if (!nameNode) return;
    register(nameNode.text, returnTypeNode ? this.describeReturn(returnTypeNode, ctx) : this.describeType(valueTypeNode, ctx));
}

function collectTopLevelSymbols(ctx) {
    const items = this.flattenLibraryItems(kids(this.root));
    for (const item of items) {
        if (item.type === "module_decl") this.collectModuleTemplate(item);
        if (item.type === "struct_decl") {
            const nameNode = childOfType(item, "type_ident");
            if (nameNode) this.topLevelTypeNames.add(nameNode.text);
        }
        if (item.type === "type_decl") {
            const nameNode = childOfType(item, "type_ident");
            if (nameNode) this.topLevelTypeNames.add(nameNode.text);
            for (const variant of childrenOfType(childOfType(item, "variant_list"), "variant")) {
                const variantName = childOfType(variant, "type_ident");
                if (variantName) this.topLevelTypeNames.add(variantName.text);
            }
        }
        if (item.type === "proto_decl") {
            const nameNode = childOfType(item, "type_ident");
            if (nameNode) this.topLevelProtocolNames.add(nameNode.text);
        }
    }

    for (const item of items) {
        if (item.type === "struct_decl") this.collectTopLevelStructFields(item, ctx);
        if (item.type === "type_decl") this.collectTopLevelTypeFields(item, ctx);
        if (item.type === "proto_decl") this.collectTopLevelProtocol(item, ctx);
    }

    this.collectSymbols(items, ctx, {
        onConstruct: (item) => this.applyConstruct(item, ctx),
        onType: (name) => this.topLevelTypeNames.add(name),
        onValue: (name, type) => {
            this.topLevelValueNames.add(name);
            this.topLevelValueTypes.set(name, type);
        },
        onFunction: (name, returnInfo) => {
            this.topLevelValueNames.add(name);
            this.topLevelFnReturns.set(name, returnInfo);
        },
        onAssoc: (owner, member, returnInfo) => {
            const key = `${owner}.${member}`;
            this.topLevelAssocNames.set(key, this.mangleTopLevelAssoc(owner, member));
            this.topLevelAssocReturns.set(key, returnInfo);
        },
        onProtocolImpl: (protocol, member, node, returnInfo) => this.collectTopLevelProtocolImpl(protocol, member, node, ctx, returnInfo),
    });
}

function collectModuleTemplate(node) {
    this.registerModuleTemplate(this.buildModuleTemplate(node));
}

function collectTopLevelStructFields(node, ctx) {
    const nameNode = childOfType(node, "type_ident");
    if (!nameNode) return;
    const protocolNames = childrenOfType(childOfType(node, "protocol_list"), "type_ident").map((child) => child.text);
    if (hasAnon(node, "tag") && protocolNames.length > 0) {
        this.topLevelTaggedTypeProtocols.set(nameNode.text, new Set(protocolNames));
    }
    const fields = new Map();
    for (const field of childrenOfType(childOfType(node, "field_list"), "field")) {
        const fieldName = childOfType(field, "identifier");
        const typeNode = kids(field).at(-1);
        if (!fieldName || !typeNode) continue;
        fields.set(fieldName.text, {
            typeInfo: this.describeType(typeNode, ctx),
            mut: hasAnon(field, "mut"),
        });
    }
    this.topLevelStructFieldTypes.set(nameNode.text, fields);
}

function collectTopLevelTypeFields(node, ctx) {
    const nameNode = childOfType(node, "type_ident");
    if (!nameNode) return;
    const protocolNames = childrenOfType(childOfType(node, "protocol_list"), "type_ident").map((child) => child.text);
    if (hasAnon(node, "tag") && protocolNames.length > 0) {
        this.topLevelTaggedTypeProtocols.set(nameNode.text, new Set(protocolNames));
    }
    for (const variant of childrenOfType(childOfType(node, "variant_list"), "variant")) {
        const variantName = childOfType(variant, "type_ident");
        if (!variantName) continue;
        const fields = new Map();
        for (const field of childrenOfType(childOfType(variant, "field_list"), "field")) {
            const fieldName = childOfType(field, "identifier");
            const typeNode = kids(field).at(-1);
            if (!fieldName || !typeNode) continue;
            fields.set(fieldName.text, {
                typeInfo: this.describeType(typeNode, ctx),
                mut: hasAnon(field, "mut"),
            });
        }
        this.topLevelStructFieldTypes.set(variantName.text, fields);
    }
}

function collectTopLevelProtocol(node, ctx) {
    const nameNode = childOfType(node, "type_ident");
    if (!nameNode) return;
    this.topLevelProtocolNames.add(nameNode.text);
    this.collectProtocolMembers(nameNode.text, node, ctx);
}

function collectProtocolMembers(protocolName, node, ctx) {
    const memberList = childOfType(node, "proto_member_list");
    const members = memberList
        ? childrenOfType(memberList, "proto_member")
            .map((member) => kids(member)[0])
            .filter((child) => ["proto_method", "proto_getter", "proto_setter"].includes(child?.type))
        : [];
    for (const member of members) {
        const memberName = childOfType(member, "identifier");
        if (!memberName) continue;
        if (member.type === "proto_setter") {
            this.topLevelProtocolSetterMembers.set(this.protocolMemberKey(protocolName, memberName.text), {
                setter: true,
                arity: 2,
                valueInfo: this.describeType(kids(member).at(-1), ctx),
            });
            continue;
        }
        this.topLevelProtocolMembers.set(this.protocolMemberKey(protocolName, memberName.text), {
            getter: member.type === "proto_getter",
            arity: member.type === "proto_getter"
                ? 1
                : kids(childOfType(member, "type_list")).length,
            returnInfo: member.type === "proto_getter"
                ? this.describeType(kids(member).at(-1), ctx)
                : this.describeReturn(childOfType(member, "return_type"), ctx),
        });
    }
}

function collectTopLevelProtocolImpl(protocol, member, node, ctx, returnInfo) {
    const selfType = this.protocolSelfType(node, ctx);
    if (!selfType) return;
    const entry = { protocol, member, selfType, returnInfo };
    this.topLevelProtocolImplsByKey.set(this.protocolImplKey(protocol, member, selfType), entry);
    if (!this.topLevelProtocolImplementers.has(protocol)) this.topLevelProtocolImplementers.set(protocol, new Set());
    this.topLevelProtocolImplementers.get(protocol).add(selfType);
    const typeMemberKey = this.protocolTypeMemberKey(selfType, member);
    const entries = this.topLevelProtocolImplsByTypeMember.get(typeMemberKey) ?? [];
    entries.push(entry);
    this.topLevelProtocolImplsByTypeMember.set(typeMemberKey, entries);
}

function collectNamespaceTypeNames(namespace) {
    for (const item of namespace.template.items) {
        if (item.type === "struct_decl" || item.type === "type_decl" || item.type === "proto_decl") {
            const nameNode = childOfType(item, "type_ident");
            if (nameNode) {
                this.registerNamespaceType(namespace, nameNode.text);
                if (item.type === "proto_decl") {
                    if (!namespace.protocolNames) namespace.protocolNames = new Set();
                    namespace.protocolNames.add(nameNode.text);
                }
            }
        }
        if (item.type === "type_decl") {
            for (const variant of childrenOfType(childOfType(item, "variant_list"), "variant")) {
                const variantName = childOfType(variant, "type_ident");
                if (variantName) this.registerNamespaceType(namespace, variantName.text);
            }
        }
    }
}

function collectNamespaceDeclarations(namespace, ctx) {
    for (const item of namespace.template.items) {
        if (item.type === "struct_decl") this.collectNamespaceStructFields(item, namespace, ctx);
        if (item.type === "type_decl") this.collectNamespaceTypeFields(item, namespace, ctx);
        if (item.type === "proto_decl") this.collectNamespaceProtocol(item, namespace, ctx);
    }
}

function collectNamespaceStructFields(node, namespace, ctx) {
    const rawName = childOfType(node, "type_ident")?.text;
    const typeName = rawName ? namespace.typeNames.get(rawName) : null;
    if (!typeName) return;
    const protocolNames = childrenOfType(childOfType(node, "protocol_list"), "type_ident")
        .map((child) => namespace.typeNames.get(child.text) ?? child.text);
    if (hasAnon(node, "tag") && protocolNames.length > 0) {
        this.topLevelTaggedTypeProtocols.set(typeName, new Set(protocolNames));
    }
    const fields = new Map();
    for (const field of childrenOfType(childOfType(node, "field_list"), "field")) {
        const fieldName = childOfType(field, "identifier");
        const typeNode = kids(field).at(-1);
        if (!fieldName || !typeNode) continue;
        fields.set(fieldName.text, {
            typeInfo: this.describeType(typeNode, ctx),
            mut: hasAnon(field, "mut"),
        });
    }
    this.topLevelStructFieldTypes.set(typeName, fields);
}

function collectNamespaceTypeFields(node, namespace, ctx) {
    const rawName = childOfType(node, "type_ident")?.text;
    const typeName = rawName ? namespace.typeNames.get(rawName) : null;
    if (!typeName) return;
    const protocolNames = childrenOfType(childOfType(node, "protocol_list"), "type_ident")
        .map((child) => namespace.typeNames.get(child.text) ?? child.text);
    if (hasAnon(node, "tag") && protocolNames.length > 0) {
        this.topLevelTaggedTypeProtocols.set(typeName, new Set(protocolNames));
    }
    for (const variant of childrenOfType(childOfType(node, "variant_list"), "variant")) {
        const variantNameNode = childOfType(variant, "type_ident");
        const variantName = variantNameNode ? namespace.typeNames.get(variantNameNode.text) : null;
        if (!variantName) continue;
        const fields = new Map();
        for (const field of childrenOfType(childOfType(variant, "field_list"), "field")) {
            const fieldName = childOfType(field, "identifier");
            const typeNode = kids(field).at(-1);
            if (!fieldName || !typeNode) continue;
            fields.set(fieldName.text, {
                typeInfo: this.describeType(typeNode, ctx),
                mut: hasAnon(field, "mut"),
            });
        }
        this.topLevelStructFieldTypes.set(variantName, fields);
    }
}

function collectNamespaceProtocol(node, namespace, ctx) {
    const rawName = childOfType(node, "type_ident")?.text;
    const protocolName = rawName ? namespace.typeNames.get(rawName) : null;
    if (!protocolName) return;
    this.topLevelProtocolNames.add(protocolName);
    this.collectProtocolMembers(protocolName, node, ctx);
}

function applyConstruct(node, ctx) {
    const named = kids(node);
    const aliasNode = named[0]?.type === "identifier" && ["module_ref", "instantiated_module_ref"].includes(named[1]?.type) ? named[0] : null;
    const moduleRef = childOfType(node, "module_ref") ?? childOfType(node, "instantiated_module_ref");
    const namespace = this.resolveNamespaceFromModuleRef(moduleRef, ctx);

    if (aliasNode) {
        ctx.aliases.set(aliasNode.text, namespace);
        return;
    }

    this.openNamespace(namespace, ctx);
}

function openNamespace(namespace, ctx) {
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

function resolveNamespaceFromModuleRef(node, ctx) {
    const { name, argNodes } = this.getModuleRef(node);
    return this.resolveNamespaceByNameAndArgs(name, argNodes, ctx);
}

function resolveNamespaceByNameAndArgs(name, argNodes, ctx) {
    if (argNodes.length === 0 && ctx.aliases.has(name)) return ctx.aliases.get(name);
    const template = ctx.moduleBindings.get(name) ?? this.moduleTemplates.get(name);
    const argTexts = argNodes.map((typeNode) => this.emitType(typeNode, ctx));
    return this.ensureNamespace(template, argTexts, ctx);
}

function resolveMaybeNamespaceName(name, ctx) {
    if (ctx.aliases.has(name)) return ctx.aliases.get(name);
    const template = ctx.moduleBindings.get(name) ?? this.moduleTemplates.get(name);
    return template && template.typeParams.length === 0 ? this.ensureNamespace(template, [], ctx) : null;
}

function ensureNamespace(template, argTexts, ctx) {
    if (!template) throw new Error("Unknown module reference");
    if (argTexts.length !== template.typeParams.length) {
        throw new Error(`module ${template.name} expects ${template.typeParams.length} type argument(s), received ${argTexts.length}`);
    }
    const displayText = template.typeParams.length
        ? `${template.name}[${argTexts.join(", ")}]`
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
        source: "",
    };

    this.namespaceCache.set(key, namespace);
    this.namespaceOrder.push(namespace);

    const moduleCtx = this.cloneContext(ctx, {
        namespace,
        typeParams: new Map([...ctx.typeParams, ...namespace.typeParams]),
        moduleBindings: template.moduleBindings ?? ctx.moduleBindings,
        localValueScopes: [],
    });
    this.collectNamespaceTypeNames(namespace);
    this.collectNamespaceDeclarations(namespace, moduleCtx);
    this.collectNamespaceNames(namespace, moduleCtx);

    return namespace;
}

function collectNamespaceNames(namespace, ctx) {
    this.collectSymbols(namespace.template.items, ctx, {
        onType: (name) => this.registerNamespaceType(namespace, name),
        onValue: (name, type) => {
            this.registerNamespaceValue(namespace, name);
            namespace.freeValueTypes.set(name, type);
        },
        onFunction: (name, returnInfo) => {
            this.registerNamespaceValue(namespace, name);
            namespace.freeFnReturns.set(name, returnInfo);
        },
        onAssoc: (owner, member, returnInfo) => {
            const key = `${owner}.${member}`;
            namespace.assocNames.set(key, this.mangleNamespaceAssoc(namespace, owner, member));
            namespace.assocReturns.set(key, returnInfo);
        },
        onProtocolImpl: (protocol, member, node, returnInfo) => this.collectTopLevelProtocolImpl(protocol, member, node, ctx, returnInfo),
    });
}

function registerNamespaceType(namespace, name) {
    if (namespace.typeNames.has(name)) return;
    const value = this.mangleNamespaceType(namespace, name);
    namespace.typeNames.set(name, value);
    if (name === namespace.template.name) {
        namespace.promotedTypeName = name;
        namespace.promotedType = value;
    }
    namespace.exportedTypes.push(name);
}

function registerNamespaceValue(namespace, name) {
    namespace.freeValueNames.set(name, this.mangleNamespaceValue(namespace, name));
    namespace.exportedValues.push(name);
}

function mangleTopLevelAssoc(owner, member) {
    return `__utu_assoc_${snakeCase(owner)}_${snakeCase(member)}`;
}

function mangleProtocolDispatch(protocol, member, selfType) {
    return `__utu_proto_dispatch_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
}

function mangleProtocolSetterDispatch(protocol, member, selfType) {
    return `__utu_proto_set_dispatch_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
}

function mangleNamespaceType(namespace, name) {
    return `Utu${namespace.hash}${pascalCase(namespace.template.name)}${pascalCase(name)}`;
}

function mangleNamespaceValue(namespace, name) {
    return `__utu_${snakeCase(namespace.template.name)}_${namespace.hash}_${snakeCase(name)}`;
}

function mangleNamespaceAssoc(namespace, owner, member) {
    return `__utu_${snakeCase(namespace.template.name)}_${namespace.hash}_${snakeCase(owner)}_${snakeCase(member)}`;
}

function resolveProtocolOwnerName(name, ctx) {
    if (this.topLevelProtocolNames.has(name)) return name;
    const mapped = ctx.namespace?.typeNames.get(name);
    return mapped && this.topLevelProtocolNames.has(mapped) ? mapped : null;
}

function getModuleRef(node) {
    const instNode = node?.type === "instantiated_module_ref" ? node : childOfType(node, "instantiated_module_ref");
    const target = instNode ?? node;
    const argsNode = childOfType(target, "module_type_arg_list");
    return { name: moduleNameNode(target).text, argNodes: argsNode ? kids(argsNode) : [] };
}

function flattenLibraryItems(items) {
    return items.flatMap((item) => item.type === "library_decl" ? kids(item) : [item]);
}

function describeBareType(name, ctx) {
    if (ctx.typeParams.has(name)) return { text: ctx.typeParams.get(name), owner: name, namespace: ctx.namespace };
    if (ctx.namespace?.typeNames.has(name)) return { text: ctx.namespace.typeNames.get(name), owner: name, namespace: ctx.namespace };
    if (this.topLevelTypeNames.has(name)) return { text: name, owner: name, namespace: null };
    if (this.topLevelProtocolNames.has(name)) return { text: name, owner: name, namespace: null };
    if (ctx.openTypes.has(name)) {
        const namespace = ctx.openTypes.get(name);
        return { text: namespace.typeNames.get(name), owner: name, namespace };
    }
    const namespace = this.resolveMaybeNamespaceName(name, ctx);
    return namespace?.promotedType
        ? { text: namespace.promotedType, owner: namespace.promotedTypeName, namespace }
        : { text: name, owner: null, namespace: null };
}

function describeType(node, ctx) {
    if (!node) return null;
    switch (node.type) {
        case "scalar_type":
            return { text: node.text, owner: null, namespace: null };
        case "type_ident":
            return this.describeBareType(node.text, ctx);
        case "instantiated_module_ref": {
            const namespace = this.resolveNamespaceFromModuleRef(node, ctx);
            return { text: this.resolvePromotedType(namespace), owner: namespace.promotedTypeName, namespace };
        }
        case "qualified_type_ref": {
            const moduleRef = childOfType(node, "module_ref") ?? childOfType(node, "instantiated_module_ref");
            const typeNode = childOfType(node, "type_ident");
            const namespace = this.resolveNamespaceFromModuleRef(moduleRef, ctx);
            return { text: namespace.typeNames.get(typeNode.text), owner: typeNode.text, namespace };
        }
        case "nullable_type": {
            const info = this.describeType(kids(node)[0], ctx);
            return info ? { ...info, text: `?${info.text}` } : { text: this.emitType(node, ctx), owner: null, namespace: null };
        }
        case "ref_type": {
            if (node.children[0]?.type === "array") return { text: this.emitType(node, ctx), owner: null, namespace: null };
            const child = kids(node)[0];
            return child ? this.describeType(child, ctx) : { text: node.text, owner: null, namespace: null };
        }
        case "paren_type": {
            const info = this.describeType(kids(node)[0], ctx);
            return info ? { ...info, text: `(${info.text})` } : { text: this.emitType(node, ctx), owner: null, namespace: null };
        }
        default:
            return { text: this.emitType(node, ctx), owner: null, namespace: null };
    }
}

function describeReturn(node, ctx) {
    if (!node || childOfType(node, "void_type")) return null;
    const info = this.describeType(namedChildren(node)[0], ctx);
    if (!info) return null;
    return node.children.some((child) => child.type === ",")
        ? { text: this.emitReturnType(node, ctx), owner: null, namespace: null }
        : { ...info, text: this.emitReturnType(node, ctx) };
}

function stripNullable(info) {
    return info?.text.startsWith("?")
        ? { ...info, text: info.text.slice(1) }
        : info;
}

function emitType(node, ctx) {
    if (!node) return "void";
    switch (node.type) {
        case "scalar_type":
            return node.text;
        case "type_ident":
            return this.resolveBareType(node.text, ctx);
        case "instantiated_module_ref":
            return this.resolvePromotedType(this.resolveNamespaceFromModuleRef(node, ctx));
        case "qualified_type_ref":
            return this.describeType(node, ctx).text;
        case "nullable_type":
            return `?${this.emitType(kids(node)[0], ctx)}`;
        case "ref_type": {
            if (node.children[0]?.type === "array") return `array[${this.emitType(kids(node)[0], ctx)}]`;
            const child = kids(node)[0];
            return child ? this.emitType(child, ctx) : node.text;
        }
        case "func_type":
            throw new Error("First-class function reference types are not supported yet");
        case "paren_type":
            return `(${this.emitType(kids(node)[0], ctx)})`;
        default:
            return node.text;
    }
}

function resolveBareType(name, ctx) {
    return this.describeBareType(name, ctx).text;
}

function resolvePromotedType(namespace) {
    return namespace.promotedType;
}

function emitStructDecl(node, ctx, inModule) {
    const nameNode = childOfType(node, "type_ident");
    const typeName = inModule ? ctx.namespace.typeNames.get(nameNode.text) : nameNode.text;
    const fields = childrenOfType(childOfType(node, "field_list"), "field").map((field) => this.emitField(field, ctx));
    const rec = hasAnon(node, "rec") ? "rec " : "";
    const tag = hasAnon(node, "tag") ? "tag " : "";
    const protocols = childrenOfType(childOfType(node, "protocol_list"), "type_ident")
        .map((child) => inModule ? ctx.namespace.typeNames.get(child.text) ?? child.text : child.text);
    const protocolClause = protocols.length ? `: ${protocols.join(", ")}` : "";
    return `${rec}${tag}struct ${typeName}${protocolClause} {\n${fields.map((field) => `    ${field},`).join("\n")}\n};`;
}

function emitField(node, ctx) {
    const [nameNode, typeNode] = kids(node);
    return `${hasAnon(node, "mut") ? "mut " : ""}${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
}

function emitProtoDecl(node, ctx, inModule) {
    const nameNode = childOfType(node, "type_ident");
    const protocolName = inModule ? ctx.namespace.typeNames.get(nameNode.text) : nameNode.text;
    const typeParams = childrenOfType(childOfType(node, "module_type_param_list"), "type_ident").map((child) => child.text);
    const memberList = childOfType(node, "proto_member_list");
    const methods = memberList
        ? childrenOfType(memberList, "proto_member")
            .map((member) => kids(member)[0])
            .filter((member) => ["proto_method", "proto_getter", "proto_setter"].includes(member?.type))
            .map((member) => this.emitProtoMember(member, ctx))
        : [];
    const typeParamList = typeParams.length ? `[${typeParams.join(", ")}]` : "";
    return `proto ${protocolName}${typeParamList} {\n${methods.map((method) => `    ${method},`).join("\n")}\n};`;
}

function emitProtoMember(node, ctx) {
    return node.type === "proto_getter"
        ? this.emitProtoGetter(node, ctx)
        : node.type === "proto_setter"
            ? this.emitProtoSetter(node, ctx)
            : this.emitProtoMethod(node, ctx);
}

function emitProtoMethod(node, ctx) {
    const nameNode = childOfType(node, "identifier");
    const params = kids(childOfType(node, "type_list")).map((child) => this.emitType(child, ctx)).join(", ");
    return `${nameNode.text}(${params}) ${this.emitReturnType(childOfType(node, "return_type"), ctx)}`;
}

function emitProtoGetter(node, ctx) {
    const nameNode = childOfType(node, "identifier");
    const typeNode = kids(node).at(-1);
    return `get ${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
}

function emitProtoSetter(node, ctx) {
    const nameNode = childOfType(node, "identifier");
    const typeNode = kids(node).at(-1);
    return `set ${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
}

function emitTypeDecl(node, ctx, inModule) {
    const typeNameNode = childOfType(node, "type_ident");
    const typeName = inModule ? ctx.namespace.typeNames.get(typeNameNode.text) : typeNameNode.text;
    const variants = childrenOfType(childOfType(node, "variant_list"), "variant").map((variant) => this.emitVariant(variant, ctx, inModule));
    const rec = hasAnon(node, "rec") ? "rec " : "";
    const tagged = hasAnon(node, "tag") ? "tag " : "";
    const protocols = childrenOfType(childOfType(node, "protocol_list"), "type_ident")
        .map((child) => inModule ? ctx.namespace.typeNames.get(child.text) ?? child.text : child.text);
    const protocolClause = protocols.length ? `: ${protocols.join(", ")}` : "";
    return `${rec}${tagged}type ${typeName}${protocolClause} = ${variants.map((variant) => `| ${variant}`).join(" ")}`;
}

function emitVariant(node, ctx, inModule) {
    const nameNode = childOfType(node, "type_ident");
    const name = inModule ? ctx.namespace.typeNames.get(nameNode.text) : nameNode.text;
    const fields = childrenOfType(childOfType(node, "field_list"), "field").map((field) => this.emitField(field, ctx));
    return fields.length ? `${name} { ${fields.join(", ")} }` : name;
}

function emitFnDecl(node, ctx, inModule) {
    const assocNode = childOfType(node, "associated_fn_name");
    const protocolOwner = assocNode ? kids(assocNode)[0]?.text ?? null : null;
    const resolvedProtocolOwner = protocolOwner ? this.resolveProtocolOwnerName(protocolOwner, ctx) : null;
    const name = assocNode
        ? resolvedProtocolOwner
            ? this.emitProtocolImplName(node, ctx, inModule)
            : this.emitAssociatedFnName(assocNode, ctx, inModule)
        : inModule
            ? ctx.namespace.freeValueNames.get(childOfType(node, "identifier").text)
            : childOfType(node, "identifier").text;
    const params = childrenOfType(childOfType(node, "param_list"), "param");
    const fnCtx = this.pushScope(ctx);
    for (const param of params) {
        this.declareLocal(fnCtx, childOfType(param, "identifier").text, this.describeType(kids(param)[1], ctx));
    }
    return `fun ${name}(${params.map((param) => this.emitParam(param, ctx)).join(", ")}) ${this.emitReturnType(childOfType(node, "return_type"), ctx)} ${this.emitBlock(childOfType(node, "block"), fnCtx, true)}`;
}

function emitProtocolImplName(node, ctx, inModule) {
    const assocNode = childOfType(node, "associated_fn_name");
    const [ownerNode, nameNode] = kids(assocNode);
    if (inModule) {
        return `${ctx.namespace.typeNames.get(ownerNode.text) ?? ownerNode.text}.${nameNode.text}`;
    }
    return `${ownerNode.text}.${nameNode.text}`;
}

function emitAssociatedFnName(node, ctx, inModule) {
    const [ownerNode, nameNode] = kids(node);
    if (inModule) {
        return ctx.namespace.assocNames.get(`${ownerNode.text}.${nameNode.text}`);
    }
    const key = `${ownerNode.text}.${nameNode.text}`;
    return this.topLevelAssocNames.get(key);
}

function emitParam(node, ctx) {
    const [nameNode, typeNode] = kids(node);
    return `${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
}

function emitImportParamList(node, ctx) {
    if (!node) return "";
    return kids(node)
        .map((child) => child.type === "param"
            ? this.emitParam(child, ctx)
            : this.emitType(child, ctx))
        .join(", ");
}

function emitReturnType(node, ctx) {
    if (!node || childOfType(node, "void_type")) return "void";
    const parts = [];
    for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index];
        if (!child.isNamed || child.type === "void_type") continue;
        let part = this.emitType(child, ctx);
        if (node.children[index + 1]?.type === "#") {
            const errorType = node.children[index + 2]?.isNamed ? this.emitType(node.children[index + 2], ctx) : "null";
            part += ` # ${errorType}`;
            index += node.children[index + 2]?.isNamed ? 2 : 1;
        }
        parts.push(part);
    }
    return parts.join(", ");
}

function emitGlobalDecl(node, ctx, inModule) {
    const [nameNode, typeNode, valueNode] = kids(node);
    const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
    return `let ${name}: ${this.emitType(typeNode, ctx)} = ${this.emitExpr(valueNode, ctx)}`;
}

function emitImportDecl(node, ctx, inModule) {
    return this.emitExternDecl("escape", childOfType(node, "string_lit")?.text ?? "", node, ctx, inModule);
}

function emitJsgenDecl(node, ctx, inModule) {
    return this.emitExternDecl("escape", childOfType(node, "jsgen_lit").text, node, ctx, inModule);
}

function emitExternDecl(keyword, sourceText, node, ctx, inModule) {
    const nameNode = childOfType(node, "identifier");
    const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
    const returnTypeNode = childOfType(node, "return_type");
    const prefix = sourceText ? `${keyword} ${sourceText} ${name}` : `${keyword} ${name}`;
    return returnTypeNode
        ? `${prefix}(${this.emitImportParamList(childOfType(node, "import_param_list"), ctx)}) ${this.emitReturnType(returnTypeNode, ctx)}`
        : `${prefix}: ${this.emitType(kids(node).at(-1), ctx)}`;
}

function resolveBareValue(name, ctx) {
    if (this.isLocalValue(ctx, name)) return name;
    if (ctx.namespace?.freeValueNames.has(name)) return ctx.namespace.freeValueNames.get(name);
    if (this.topLevelValueNames.has(name)) return name;
    if (ctx.openValues.has(name)) return ctx.openValues.get(name).freeValueNames.get(name);
    return name;
}

function resolveValueType(name, ctx) {
    const local = this.lookupLocal(ctx, name);
    if (local !== undefined) return local;
    if (ctx.namespace?.freeValueTypes.has(name)) return ctx.namespace.freeValueTypes.get(name);
    if (this.topLevelValueTypes.has(name)) return this.topLevelValueTypes.get(name);
    if (ctx.openValues.has(name)) return ctx.openValues.get(name).freeValueTypes.get(name) ?? null;
    return null;
}

function resolveFunctionReturn(name, ctx) {
    if (ctx.namespace?.freeFnReturns.has(name)) return ctx.namespace.freeFnReturns.get(name);
    if (this.topLevelFnReturns.has(name)) return this.topLevelFnReturns.get(name);
    if (ctx.openValues.has(name)) return ctx.openValues.get(name).freeFnReturns.get(name) ?? null;
    return null;
}

function resolveNamespaceValueReturn(namespace, memberName) {
    return namespace?.freeFnReturns.get(memberName)
        ?? (namespace?.promotedTypeName ? namespace.assocReturns.get(`${namespace.promotedTypeName}.${memberName}`) : null)
        ?? null;
}

function resolveAssociatedByOwner(ownerName, memberName, ctx) {
    const entry = this.resolveAssociatedEntry(ownerName, memberName, ctx);
    return entry?.callee;
}

function resolveNamespaceValue(namespace, memberName) {
    return namespace?.freeValueNames.get(memberName)
        ?? (namespace?.promotedTypeName ? namespace.assocNames.get(`${namespace.promotedTypeName}.${memberName}`) : null)
        ?? null;
}

function resolveNamespaceAssoc(namespace, ownerName, memberName) {
    const key = `${ownerName}.${memberName}`;
    const callee = namespace?.assocNames.get(key);
    return callee ? { callee, returnInfo: namespace.assocReturns.get(key) ?? null } : null;
}

function resolveAssociatedEntry(ownerName, memberName, ctx) {
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

function resolveAssociatedEntryFromInfo(info, memberName, ctx) {
    if (!info?.owner) return null;
    if (info.namespace) {
        const resolved = this.resolveNamespaceAssoc(info.namespace, info.owner, memberName);
        if (resolved) return resolved;
    }
    return this.resolveAssociatedEntry(info.owner, memberName, ctx);
}

function resolveProtocolDispatchFromInfo(info, memberName, totalArgCount = 1) {
    if (!info?.text) return null;
    if (this.topLevelProtocolNames.has(info.text)) {
        const member = this.topLevelProtocolMembers.get(this.protocolMemberKey(info.text, memberName));
        return member?.arity === totalArgCount
            ? { callee: this.mangleProtocolDispatch(info.text, memberName, info.text), returnInfo: member.returnInfo }
            : null;
    }
    const entries = this.topLevelProtocolImplsByTypeMember.get(this.protocolTypeMemberKey(info.text, memberName)) ?? [];
    const matchingEntries = entries.filter((entry) => (this.topLevelProtocolMembers.get(this.protocolMemberKey(entry.protocol, entry.member))?.arity ?? 1) === totalArgCount);
    if (matchingEntries.length === 0) {
        const protocols = new Set([...(this.topLevelTaggedTypeProtocols.get(info.text) ?? new Set())]
            .filter((protocol) => this.topLevelProtocolMembers.get(this.protocolMemberKey(protocol, memberName))?.arity === totalArgCount));
        const matches = [...protocols];
        if (matches.length === 0) return null;
        if (matches.length > 1) {
            throw new Error(`Ambiguous protocol method ".${memberName}()" on type "${info.text}" across protocols: ${matches.sort().join(", ")}`);
        }
        const protocol = matches[0];
        return {
            callee: this.mangleProtocolDispatch(protocol, memberName, info.text),
            returnInfo: this.topLevelProtocolMembers.get(this.protocolMemberKey(protocol, memberName))?.returnInfo ?? null,
        };
    }
    if (matchingEntries.length > 1) {
        const protocols = matchingEntries.map((entry) => entry.protocol).sort().join(", ");
        throw new Error(`Ambiguous protocol method ".${memberName}()" on type "${info.text}" across protocols: ${protocols}`);
    }
    const entry = matchingEntries[0];
    return { callee: this.mangleProtocolDispatch(entry.protocol, entry.member, entry.selfType), returnInfo: entry.returnInfo };
}

function inferJoinedExprInfo(nodes, ctx) {
    const infos = nodes.map((node) => this.inferExprInfo(node, ctx)).filter(Boolean);
    if (infos.length === 0) return null;
    const [first] = infos;
    return infos.every((info) => sameTypeInfo(info, first)) ? first : first;
}

function resolveFieldExprInfo(node, ctx) {
    const [baseNode, memberNode] = kids(node);
    const baseInfo = this.inferExprInfo(baseNode, ctx);
    if (!baseInfo?.text || !memberNode) return null;
    if (this.topLevelProtocolNames.has(baseInfo.text)) {
        return this.topLevelProtocolMembers.get(this.protocolMemberKey(baseInfo.text, memberNode.text))?.returnInfo ?? null;
    }
    const field = this.topLevelStructFieldTypes.get(baseInfo.text)?.get(memberNode.text) ?? null;
    if (field) return field.typeInfo;
    const protocols = [...(this.topLevelTaggedTypeProtocols.get(baseInfo.text) ?? new Set())]
        .filter((protocol) => this.topLevelProtocolMembers.get(this.protocolMemberKey(protocol, memberNode.text))?.getter);
    if (protocols.length !== 1) return null;
    return this.topLevelProtocolMembers.get(this.protocolMemberKey(protocols[0], memberNode.text))?.returnInfo ?? null;
}

function inferExprInfo(node, ctx) {
    if (!node) return null;
    switch (node.type) {
        case "identifier":
            return this.resolveValueType(node.text, ctx);
        case "paren_expr":
            return this.inferExprInfo(kids(node)[0], ctx);
        case "struct_init":
            return this.describeType(kids(node)[0], ctx);
        case "field_expr":
            return this.resolveFieldExprInfo(node, ctx);
        case "index_expr": {
            const objectInfo = this.inferExprInfo(kids(node)[0], ctx);
            const elemText = objectInfo?.text?.startsWith("array[") ? objectInfo.text.slice(6, -1) : null;
            if (!elemText) return null;
            return objectInfo?.text?.startsWith("array[")
                ? { text: elemText, owner: this.topLevelTypeNames.has(elemText) || this.topLevelProtocolNames.has(elemText) ? elemText : null, namespace: null }
                : null;
        }
        case "call_expr":
            return this.inferCallExprInfo(node, ctx);
        case "promoted_module_call_expr":
            return this.resolveNamespaceValueReturn(this.resolveNamespaceFromModuleRef(node, ctx), childOfType(node, "identifier")?.text);
        case "if_expr":
            return this.inferJoinedExprInfo([kids(node)[1], kids(node)[2]].filter(Boolean), ctx);
        case "else_expr":
            return this.inferExprInfo(kids(node)[1], ctx) ?? this.stripNullable(this.inferExprInfo(kids(node)[0], ctx));
        case "promote_expr":
            return this.inferExprInfo(kids(node)[2], ctx) ?? this.inferExprInfo(kids(node)[3], ctx) ?? null;
        case "match_expr":
            return this.inferJoinedExprInfo(childrenOfType(node, "match_arm").map((arm) => kids(arm).at(-1)), ctx);
        case "alt_expr":
            return this.inferJoinedExprInfo(childrenOfType(node, "alt_arm").map((arm) => kids(arm).at(-1)), ctx);
        case "block_expr":
            return this.inferExprInfo(childOfType(node, "block"), ctx);
        case "block": {
            const body = kids(node);
            return body.length ? this.inferExprInfo(body.at(-1), ctx) : null;
        }
        default:
            return null;
    }
}

function inferCallExprInfo(node, ctx) {
    const callee = kids(node)[0];
    const argNodes = kids(childOfType(node, "arg_list"));
    if (!callee) return null;
    if (callee.type === "identifier") return this.resolveFunctionReturn(callee.text, ctx);
    if (callee.type === "type_member_expr") {
        const protocolCall = this.resolveProtocolTypeMemberCall(callee, argNodes, ctx);
        if (protocolCall) return protocolCall.returnInfo;
        const memberNode = childOfType(callee, "identifier");
        const ownerNode = kids(callee).find((child) => child !== memberNode);
        return memberNode ? this.resolveAssociatedReturn(ownerNode, memberNode.text, ctx) : null;
    }
    if (callee.type === "field_expr") {
        const [baseNode, memberNode] = kids(callee);
        if (baseNode?.type === "identifier" && memberNode && !this.isLocalValue(ctx, baseNode.text)) {
            return this.resolveNamespaceValueReturn(this.resolveMaybeNamespaceName(baseNode.text, ctx), memberNode.text);
        }
        return this.resolveMethodCall(callee, ctx, argNodes.length + 1)?.returnInfo ?? null;
    }
    if (callee.type === "promoted_module_call_expr") {
        return this.resolveNamespaceValueReturn(this.resolveNamespaceFromModuleRef(callee, ctx), childOfType(callee, "identifier")?.text);
    }
    return null;
}

function resolveAssociatedReturn(ownerNode, memberName, ctx) {
    if (!ownerNode) return null;
    if (["qualified_type_ref", "inline_module_type_path", "instantiated_module_ref"].includes(ownerNode.type)) {
        const namespace = this.resolveNamespaceFromModuleRef(ownerNode, ctx);
        const ownerName = childOfType(ownerNode, "type_ident")?.text ?? namespace.promotedTypeName;
        return this.resolveNamespaceAssoc(namespace, ownerName, memberName)?.returnInfo ?? null;
    }
    return this.resolveAssociatedEntry(ownerNode.text, memberName, ctx)?.returnInfo ?? null;
}

function emitCallExpr(node, ctx) {
    const callee = kids(node)[0];
    const argNodes = kids(childOfType(node, "arg_list"));
    const args = argNodes.map((arg) => this.emitExpr(arg, ctx));

    if (callee?.type === "field_expr") {
        const moduleValue = this.resolveModuleField(callee, ctx);
        if (moduleValue) return `${moduleValue}(${args.join(", ")})`;
        const method = this.resolveMethodCall(callee, ctx, argNodes.length + 1);
        if (method) return `${method.callee}(${[this.emitExpr(kids(callee)[0], ctx), ...args].join(", ")})`;
    }

    if (callee?.type === "type_member_expr") {
        const protocolCall = this.resolveProtocolTypeMemberCall(callee, argNodes, ctx);
        if (protocolCall) return `${protocolCall.callee}(${args.join(", ")})`;
        return `${this.resolveTypeMemberExpr(callee, ctx)}(${args.join(", ")})`;
    }

    return `${this.emitExpr(callee, ctx)}(${args.join(", ")})`;
}

function emitFieldExpr(node, ctx) {
    const moduleValue = this.resolveModuleField(node, ctx);
    if (moduleValue) return moduleValue;
    return `${this.emitExpr(kids(node)[0], ctx)}.${kids(node)[1].text}`;
}

function resolveMethodCall(node, ctx, totalArgCount = 1) {
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

function resolveBuiltinMethodDispatch(info, memberName) {
    if (!info?.text?.startsWith("array[")) return null;
    const builtinKey = `array.${memberName}`;
    if (!BUILTIN_METHOD_RETURN_INFO.has(builtinKey)) return null;
    return {
        callee: builtinKey,
        returnInfo: BUILTIN_METHOD_RETURN_INFO.get(builtinKey),
    };
}

function resolveModuleField(node, ctx) {
    const [baseNode, memberNode] = kids(node);
    if (baseNode?.type !== "identifier" || !memberNode || this.isLocalValue(ctx, baseNode.text)) return null;
    const namespace = this.resolveMaybeNamespaceName(baseNode.text, ctx);
    return this.resolveNamespaceValue(namespace, memberNode.text);
}

function resolveTypeMemberExpr(node, ctx) {
    const memberNode = childOfType(node, "identifier");
    const ownerNode = kids(node).find((child) => child !== memberNode);
    if (!memberNode || !ownerNode) return undefined;
    if (memberNode.text === "null") {
        if (["type_ident", "qualified_type_ref", "inline_module_type_path", "instantiated_module_ref"].includes(ownerNode.type)) {
            return `ref.null ${this.emitType(ownerNode, ctx)}`;
        }
        return undefined;
    }
    if (["qualified_type_ref", "inline_module_type_path", "instantiated_module_ref"].includes(ownerNode.type)) {
        const namespace = this.resolveNamespaceFromModuleRef(ownerNode, ctx);
        const ownerName = childOfType(ownerNode, "type_ident")?.text ?? namespace.promotedTypeName;
        return this.resolveNamespaceAssoc(namespace, ownerName, memberNode.text)?.callee;
    }
    return this.resolveAssociatedEntry(ownerNode.text, memberNode.text, ctx)?.callee;
}

function emitNamespaceCallExpr(node, ctx) {
    const namespace = node.children[0]?.text ?? "builtin";
    const methodNode = childOfType(node, "identifier");
    const argsNode = childOfType(node, "arg_list");
    return `${namespace}.${methodNode.text}${hasAnon(node, "(") ? `(${kids(argsNode).map((arg) => this.emitExpr(arg, ctx)).join(", ")})` : ""}`;
}

function emitPromotedModuleCall(node, ctx) {
    const memberNode = childOfType(node, "identifier");
    const argsNode = childOfType(node, "arg_list");
    const namespace = this.resolveNamespaceFromModuleRef(node, ctx);
    const callee = this.resolveNamespaceValue(namespace, memberNode.text);
    return `${callee}(${kids(argsNode).map((arg) => this.emitExpr(arg, ctx)).join(", ")})`;
}

function emitPipeExpr(node, ctx) {
    const valueNode = kids(node)[0];
    const targetNode = childOfType(node, "pipe_target");
    const { callee, args } = this.parsePipeTarget(targetNode, ctx);
    const value = this.emitExpr(valueNode, ctx);
    const placeholderCount = args.filter((arg) => arg.kind === "placeholder").length;
    const finalArgs = placeholderCount === 0
        ? [value, ...args.map((arg) => this.emitExpr(arg.node, ctx))]
        : args.map((arg) => arg.kind === "placeholder" ? value : this.emitExpr(arg.node, ctx));
    return `${callee}(${finalArgs.join(", ")})`;
}

function parsePipeTarget(node, ctx) {
    const argsNode = childOfType(node, "pipe_args");
    const pathParts = kids(node).filter((child) => child !== argsNode);
    const args = this.parsePipeArgs(argsNode);

    if (pathParts.length === 1) {
        const child = pathParts[0];
        if (child.type === "identifier") return { callee: this.resolveBareValue(child.text, ctx), args };
        if (["module_ref", "instantiated_module_ref"].includes(child.type)) {
            const { name, argNodes } = this.getModuleRef(child);
            if (argNodes.length === 0 && !ctx.aliases.has(name) && !this.moduleTemplates.has(name)) {
                return { callee: this.resolveBareValue(name, ctx), args };
            }
        }
    }

    if (pathParts.length === 2) {
        const [first, second] = pathParts;
        if (first.type === "type_ident") {
            return { callee: this.resolveAssociatedByOwner(first.text, second.text, ctx), args };
        }
        if (first.type === "identifier") {
            const namespace = this.resolveMaybeNamespaceName(first.text, ctx);
            if (namespace) {
                return { callee: this.resolveNamespaceValue(namespace, second.text), args };
            }
        }
        if (["module_ref", "instantiated_module_ref"].includes(first.type)) {
            const namespace = this.resolveNamespaceFromModuleRef(first, ctx);
            return { callee: this.resolveNamespaceValue(namespace, second.text), args };
        }
    }

    if (pathParts.length === 3 && pathParts[0].type === "identifier" && pathParts[1].type === "type_ident") {
        const namespace = this.resolveMaybeNamespaceName(pathParts[0].text, ctx);
        const ownerName = pathParts[1].text;
        const memberName = pathParts[2].text;
        return { callee: namespace?.assocNames.get(`${ownerName}.${memberName}`), args };
    }

    if (pathParts.length === 3 && ["module_ref", "instantiated_module_ref"].includes(pathParts[0].type)) {
        const namespace = this.resolveNamespaceFromModuleRef(pathParts[0], ctx);
        const ownerName = pathParts[1].text;
        const memberName = pathParts[2].text;
        return { callee: namespace.assocNames.get(`${ownerName}.${memberName}`), args };
    }

    return { callee: undefined, args };
}

function parsePipeArgs(node) {
    if (!node) return [];
    return namedChildren(node)
        .flatMap((child) => ["pipe_args_no_placeholder", "pipe_args_with_placeholder"].includes(child.type) ? namedChildren(child) : [child])
        .filter((child) => child.type === "pipe_arg" || child.type === "pipe_arg_placeholder")
        .map((child) => child.type === "pipe_arg_placeholder"
            ? { kind: "placeholder" }
            : { kind: "arg", node: kids(child)[0] });
}

function emitIfExpr(node, ctx) {
    const parts = kids(node);
    const cond = parts[0];
    const thenBlock = parts[1];
    const elseBranch = parts[2];
    return `if ${this.emitExpr(cond, ctx)} ${this.emitBlock(thenBlock, this.pushScope(ctx), true)}${elseBranch ? ` else ${elseBranch.type === "if_expr" ? this.emitExpr(elseBranch, ctx) : this.emitBlock(elseBranch, this.pushScope(ctx), true)}` : ""}`;
}

function emitPromoteExpr(node, ctx) {
    const parts = kids(node);
    const expr = parts[0];
    const capture = parts[1];
    const ident = childOfType(capture, "identifier");
    const thenBlock = parts[2];
    const elseBlock = parts[3] ?? null;
    const inner = this.pushScope(ctx);
    if (ident?.text && ident.text !== "_") this.declareLocal(inner, ident.text, this.stripNullable(this.inferExprInfo(expr, ctx)));
    return `promote ${this.emitExpr(expr, ctx)} |${ident.text}| ${this.emitBlock(thenBlock, inner, true)}${elseBlock ? ` else ${this.emitBlock(elseBlock, this.pushScope(ctx), true)}` : ""}`;
}

function emitMatchExpr(node, ctx) {
    const [subject, ...arms] = kids(node);
    const renderedArms = arms.map((arm) => {
        const named = kids(arm);
        const pattern = named.length === 1 ? "_" : named[0].text;
        return `${pattern} => ${this.emitExpr(named.at(-1), ctx)},`;
    });
    return `match ${this.emitExpr(subject, ctx)} { ${renderedArms.join(" ")} }`;
}

function emitAltExpr(node, ctx) {
    const [subject, ...arms] = kids(node);
    const renderedArms = arms.map((arm) => this.emitAltArm(arm, ctx));
    return `alt ${this.emitExpr(subject, ctx)} { ${renderedArms.join(" ")} }`;
}

function emitAltArm(node, ctx) {
    const inner = this.pushScope(ctx);
    const named = kids(node);
    const patternNode = named[0] ?? null;
    const identNode = patternNode?.type === "identifier" ? patternNode : null;
    const typeNode = named.find((child) => child.type === "type_ident" || child.type === "qualified_type_ref") ?? null;
    const exprNode = named.at(-1);
    if (identNode && identNode.text !== "_") this.declareLocal(inner, identNode.text, typeNode ? this.describeType(typeNode, ctx) : null);
    const patternText = identNode?.text ?? (hasAnon(node, "_") ? "_" : typeNode ? "_" : patternNode?.text ?? "_");
    const head = typeNode
        ? `${patternText}: ${this.emitType(typeNode, ctx)}`
        : patternText;
    return `${head} => ${this.emitExpr(exprNode, inner)},`;
}

function emitBlockExpr(node, ctx) {
    const labelNode = childOfType(node, "identifier");
    const blockNode = childOfType(node, "block");
    return `${labelNode ? `${labelNode.text}: ` : ""}${this.emitBlock(blockNode, this.pushScope(ctx), true)}`;
}

function resolveProtocolTypeMemberCall(node, argNodes, ctx) {
    const memberNode = childOfType(node, "identifier");
    const ownerNode = kids(node).find((child) => child !== memberNode);
    const protocolName = this.resolveProtocolOwnerNode(ownerNode, ctx);
    if (!memberNode || !protocolName) return null;
    if (argNodes.length === 0) throw new Error(`Protocol call "${protocolName}.${memberNode.text}" requires a receiver as its first argument`);
    const selfInfo = this.inferExprInfo(argNodes[0], ctx);
    if (!selfInfo?.text) throw new Error(`Could not resolve the receiver type for protocol call "${protocolName}.${memberNode.text}"`);
    const method = this.topLevelProtocolMembers.get(this.protocolMemberKey(protocolName, memberNode.text));
    const setter = this.topLevelProtocolSetterMembers.get(this.protocolMemberKey(protocolName, memberNode.text));
    if (method?.arity === argNodes.length) {
        if (selfInfo.text === protocolName) {
            return { callee: this.mangleProtocolDispatch(protocolName, memberNode.text, protocolName), returnInfo: method.returnInfo };
        }
        const impl = this.topLevelProtocolImplsByKey.get(this.protocolImplKey(protocolName, memberNode.text, selfInfo.text));
        if (impl) {
            return { callee: this.mangleProtocolDispatch(protocolName, memberNode.text, selfInfo.text), returnInfo: impl.returnInfo };
        }
        if (this.topLevelTaggedTypeProtocols.get(selfInfo.text)?.has(protocolName)) {
            return { callee: this.mangleProtocolDispatch(protocolName, memberNode.text, selfInfo.text), returnInfo: method.returnInfo };
        }
        throw new Error(`Type "${selfInfo.text}" does not implement protocol "${protocolName}" method "${memberNode.text}"`);
    }
    if (setter?.arity === argNodes.length
        && (selfInfo.text === protocolName || this.topLevelTaggedTypeProtocols.get(selfInfo.text)?.has(protocolName))) {
        return {
            callee: this.mangleProtocolSetterDispatch(protocolName, memberNode.text, selfInfo.text === protocolName ? protocolName : selfInfo.text),
            returnInfo: null,
        };
    }
    throw new Error(`Type "${selfInfo.text}" does not implement protocol "${protocolName}" method "${memberNode.text}"`);
}

function resolveProtocolOwnerNode(node, ctx) {
    if (!node) return null;
    if (node.type === "type_ident") return this.resolveProtocolOwnerName(node.text, ctx);
    if (!["qualified_type_ref", "inline_module_type_path", "instantiated_module_ref"].includes(node.type)) {
        return null;
    }
    const namespace = this.resolveNamespaceFromModuleRef(node, ctx);
    const ownerName = childOfType(node, "type_ident")?.text ?? namespace.promotedTypeName;
    if (!ownerName) return null;
    const resolvedName = namespace.typeNames.get(ownerName) ?? ownerName;
    return this.topLevelProtocolNames.has(resolvedName) ? resolvedName : null;
}

function protocolSelfType(node, ctx) {
    const firstParam = childrenOfType(childOfType(node, "param_list"), "param")[0];
    const typeNode = firstParam ? kids(firstParam)[1] : null;
    return typeNode ? this.emitType(typeNode, ctx) : null;
}

function protocolImplKey(protocol, member, selfType) {
    return `${protocol}.${member}:${selfType}`;
}

function protocolMemberKey(protocol, member) {
    return `${protocol}.${member}`;
}

function protocolTypeMemberKey(selfType, member) {
    return `${selfType}.${member}`;
}

function emitForExpr(node, ctx) {
    const forCtx = this.pushScope(ctx);
    const sources = childrenOfType(childOfType(node, "for_sources"), "for_source");
    if (sources.length !== 1) {
        throw new Error("for loops support exactly one range source in v1");
    }
    const captureNode = childOfType(node, "capture");
    if (childrenOfType(captureNode, "identifier").length > 1) {
        throw new Error("for loops support at most one capture in v1");
    }
    for (const ident of childrenOfType(captureNode, "identifier")) this.declareLocal(forCtx, ident.text);
    return `for (${this.emitForSources(childOfType(node, "for_sources"), ctx)})${captureNode ? ` |${childrenOfType(captureNode, "identifier").map((child) => child.text).join(", ")}|` : ""} ${this.emitBlock(childOfType(node, "block"), forCtx, true)}`;
}

function emitForSources(node, ctx) {
    return childrenOfType(node, "for_source")
        .map((source) => {
            const [start, end] = kids(source);
            const operator = findAnonBetween(source, start, end) === "..." ? "..." : "..<";
            return `${this.emitExpr(start, ctx)}${operator}${this.emitExpr(end, ctx)}`;
        })
        .join(", ");
}

function emitWhileExpr(node, ctx) {
    const condition = kids(node).find((child) => child.type !== "block");
    return `while (${condition ? this.emitExpr(condition, ctx) : ""}) ${this.emitBlock(childOfType(node, "block"), this.pushScope(ctx), true)}`;
}

function emitBindExpr(node, ctx) {
    const targets = childrenOfType(node, "bind_target");
    const valueNode = kids(node).at(-1);
    const rendered = `let ${targets.map((target) => `${childOfType(target, "identifier").text}: ${this.emitType(kids(target).at(-1), ctx)}`).join(", ")} = ${this.emitExpr(valueNode, ctx)}`;
    for (const target of targets) this.declareLocal(ctx, childOfType(target, "identifier").text, this.describeType(kids(target).at(-1), ctx));
    return rendered;
}

function emitStructInit(node, ctx) {
    const typeNode = kids(node)[0];
    const typeName = this.emitType(typeNode, ctx);
    const fieldInits = childrenOfType(node, "field_init").map((field) => `${childOfType(field, "identifier").text}: ${this.emitExpr(kids(field).at(-1), ctx)}`);
    return `${typeName} { ${fieldInits.join(", ")} }`;
}

function emitArrayInit(node, ctx) {
    const [typeNode, methodNode] = kids(node);
    return `array[${this.emitType(typeNode, ctx)}].${methodNode.text}(${kids(childOfType(node, "arg_list")).map((arg) => this.emitExpr(arg, ctx)).join(", ")})`;
}

function emitBlock(node, ctx, reuseCurrentScope = false) {
    const blockCtx = reuseCurrentScope ? ctx : this.pushScope(ctx);
    const statements = [];
    for (const stmt of kids(node)) {
        statements.push(`${this.emitExpr(stmt, blockCtx)};`);
    }
    return `{\n${statements.map((stmt) => `    ${stmt}`).join("\n")}\n}`;
}

function emitExpr(node, ctx) {
    switch (node.type) {
        case "literal":
            return node.text;
        case "identifier":
            return this.resolveBareValue(node.text, ctx);
        case "instantiated_module_ref":
            return node.text;
        case "promoted_module_call_expr":
            return this.emitPromotedModuleCall(node, ctx);
        case "paren_expr":
            return `(${this.emitExpr(kids(node)[0], ctx)})`;
        case "assert_expr":
            return `assert ${this.emitExpr(kids(node)[0], ctx)}`;
        case "unary_expr": {
            const op = childOfType(node, "unary_op").text;
            const exprNode = kids(node).find((child) => child.type !== "unary_op");
            return op === "not"
                ? `not ${this.emitExpr(exprNode, ctx)}`
                : `${op}${this.emitExpr(exprNode, ctx)}`;
        }
        case "binary_expr": {
            const [left, right] = kids(node);
            return `${this.emitExpr(left, ctx)} ${findAnonBetween(node, left, right)} ${this.emitExpr(right, ctx)}`;
        }
        case "tuple_expr":
            return `(${kids(node).map((child) => this.emitExpr(child, ctx)).join(", ")})`;
        case "pipe_expr":
            return this.emitPipeExpr(node, ctx);
        case "else_expr":
            return `${this.emitExpr(kids(node)[0], ctx)} \\ ${this.emitExpr(kids(node)[1], ctx)}`;
        case "call_expr":
            return this.emitCallExpr(node, ctx);
        case "type_member_expr":
            return this.resolveTypeMemberExpr(node, ctx);
        case "field_expr":
            return this.emitFieldExpr(node, ctx);
        case "index_expr":
            return `${this.emitExpr(kids(node)[0], ctx)}[${this.emitExpr(kids(node)[1], ctx)}]`;
        case "namespace_call_expr":
            return this.emitNamespaceCallExpr(node, ctx);
        case "ref_null_expr":
            return `ref.null ${this.emitType(kids(node)[0], ctx)}`;
        case "if_expr":
            return this.emitIfExpr(node, ctx);
        case "promote_expr":
            return this.emitPromoteExpr(node, ctx);
        case "match_expr":
            return this.emitMatchExpr(node, ctx);
        case "alt_expr":
            return this.emitAltExpr(node, ctx);
        case "block_expr":
            return this.emitBlockExpr(node, ctx);
        case "for_expr":
            return this.emitForExpr(node, ctx);
        case "while_expr":
            return this.emitWhileExpr(node, ctx);
        case "break_expr":
            return "break";
        case "emit_expr":
            return `emit ${this.emitExpr(kids(node)[0], ctx)}`;
        case "bind_expr":
            return this.emitBindExpr(node, ctx);
        case "struct_init":
            return this.emitStructInit(node, ctx);
        case "array_init":
            return this.emitArrayInit(node, ctx);
        case "assign_expr":
            return `${this.emitExpr(kids(node)[0], ctx)} ${findAnonBetween(node, kids(node)[0], kids(node)[1])} ${this.emitExpr(kids(node)[1], ctx)}`;
        case "fatal_expr":
            return "fatal";
        case "block":
            return this.emitBlock(node, this.pushScope(ctx), true);
        default:
            return node.text;
    }
}

const UNSUPPORTED_MODULE_ITEM_LABELS = Object.freeze({
    module_decl: "nested modules",
    file_import_decl: "file imports",
    construct_decl: "construct declarations",
    library_decl: "library declarations",
    test_decl: "test declarations",
    bench_decl: "bench declarations",
});

function emitStage253Item(expander, node, ctx, inModule) {
    if (inModule && Object.hasOwn(UNSUPPORTED_MODULE_ITEM_LABELS, node.type)) {
        throw new Error(`${UNSUPPORTED_MODULE_ITEM_LABELS[node.type]} are not supported inside modules in v1`);
    }
    switch (node.type) {
        case "module_decl":
            return "";
        case "file_import_decl":
            return "";
        case "construct_decl":
            return "";
        case "struct_decl":
            return expander.emitStructDecl(node, ctx, inModule);
        case "proto_decl":
            return expander.emitProtoDecl(node, ctx, inModule);
        case "type_decl":
            return `${expander.emitTypeDecl(node, ctx, inModule)};`;
        case "fn_decl":
            return expander.emitFnDecl(node, ctx, inModule);
        case "global_decl":
            return `${expander.emitGlobalDecl(node, ctx, inModule)};`;
        case "jsgen_decl":
            return `${expander.emitJsgenDecl(node, ctx, inModule)};`;
        case "library_decl":
            return inModule ? "" : emitStage253LibraryDecl(expander, node, ctx);
        case "test_decl":
            return inModule ? "" : emitStage253TestDecl(expander, node, ctx);
        case "bench_decl":
            return inModule ? "" : emitStage253BenchDecl(expander, node, ctx);
        default:
            return "";
    }
}

function emitStage253TestDecl(expander, node, ctx) {
    return `test ${childOfType(node, "string_lit").text} ${expander.emitBlock(childOfType(node, "block"), expander.pushScope(ctx), true)}`;
}

function emitStage253BenchDecl(expander, node, ctx) {
    return `bench ${childOfType(node, "string_lit").text} { ${emitStage253SetupDecl(expander, childOfType(node, "setup_decl"), expander.pushScope(ctx))} }`;
}

function emitStage253SetupDecl(expander, node, ctx) {
    const parts = [];
    for (const child of kids(node)) {
        if (child.type === "measure_decl") {
            parts.push(`measure ${expander.emitBlock(childOfType(child, "block"), expander.pushScope(ctx), true)}`);
            continue;
        }
        parts.push(`${expander.emitExpr(child, ctx)};`);
    }
    return `setup { ${parts.join(" ")} }`;
}

function emitStage253LibraryDecl(expander, node, ctx) {
    const parts = [];
    for (const child of kids(node)) {
        if (child.type === "construct_decl") {
            expander.applyConstruct(child, ctx);
            continue;
        }
        const emitted = emitStage253Item(expander, child, ctx, false);
        if (emitted) parts.push(emitted);
    }
    return `library {\n${parts.map(indentStage253Block).join("\n\n")}\n}`;
}

function indentStage253Block(source) {
    return source
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
}

const EXPANSION_METHODS = Object.freeze({
    createRootContext,
    cloneContext,
    pushScope,
    declareLocal,
    isLocalValue,
    lookupLocal,
    loadRootFileImports,
    resolveFileImportBinding,
    loadImportedFile,
    loadImportedFileNow,
    parseImportedSource,
    buildModuleTemplate,
    cloneModuleTemplate,
    registerModuleTemplate,
    collectSymbols,
    collectFunctionSymbol,
    collectValueSymbol,
    collectTopLevelSymbols,
    collectModuleTemplate,
    collectTopLevelStructFields,
    collectTopLevelTypeFields,
    collectTopLevelProtocol,
    collectProtocolMembers,
    collectTopLevelProtocolImpl,
    collectNamespaceTypeNames,
    collectNamespaceDeclarations,
    collectNamespaceStructFields,
    collectNamespaceTypeFields,
    collectNamespaceProtocol,
    applyConstruct,
    openNamespace,
    resolveNamespaceFromModuleRef,
    resolveNamespaceByNameAndArgs,
    resolveMaybeNamespaceName,
    ensureNamespace,
    collectNamespaceNames,
    registerNamespaceType,
    registerNamespaceValue,
    mangleTopLevelAssoc,
    mangleProtocolDispatch,
    mangleProtocolSetterDispatch,
    mangleNamespaceType,
    mangleNamespaceValue,
    mangleNamespaceAssoc,
    resolveProtocolOwnerName,
    getModuleRef,
    flattenLibraryItems,
    describeBareType,
    describeType,
    describeReturn,
    stripNullable,
    emitType,
    resolveBareType,
    resolvePromotedType,
    emitStructDecl,
    emitField,
    emitProtoDecl,
    emitProtoMember,
    emitProtoMethod,
    emitProtoGetter,
    emitProtoSetter,
    emitTypeDecl,
    emitVariant,
    emitFnDecl,
    emitProtocolImplName,
    emitAssociatedFnName,
    emitParam,
    emitImportParamList,
    emitReturnType,
    emitGlobalDecl,
    emitImportDecl,
    emitJsgenDecl,
    emitExternDecl,
    resolveBareValue,
    resolveValueType,
    resolveFunctionReturn,
    resolveNamespaceValueReturn,
    resolveAssociatedByOwner,
    resolveNamespaceValue,
    resolveNamespaceAssoc,
    resolveAssociatedEntry,
    resolveAssociatedEntryFromInfo,
    resolveProtocolDispatchFromInfo,
    inferJoinedExprInfo,
    resolveFieldExprInfo,
    inferExprInfo,
    inferCallExprInfo,
    resolveAssociatedReturn,
    emitCallExpr,
    emitFieldExpr,
    resolveMethodCall,
    resolveBuiltinMethodDispatch,
    resolveModuleField,
    resolveTypeMemberExpr,
    emitNamespaceCallExpr,
    emitPromotedModuleCall,
    emitPipeExpr,
    parsePipeTarget,
    parsePipeArgs,
    emitIfExpr,
    emitPromoteExpr,
    emitMatchExpr,
    emitAltExpr,
    emitAltArm,
    emitBlockExpr,
    resolveProtocolTypeMemberCall,
    resolveProtocolOwnerNode,
    protocolSelfType,
    protocolImplKey,
    protocolMemberKey,
    protocolTypeMemberKey,
    emitForExpr,
    emitForSources,
    emitWhileExpr,
    emitBindExpr,
    emitStructInit,
    emitArrayInit,
    emitBlock,
    emitExpr,
});

function createStage2Expander(root, source, options = {}) {
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

export const EXPAND_MODES = Object.freeze({
    EDITOR: "editor",
    VALIDATION: "validation",
    COMPILE: "compile",
});

export const EXPAND_STATUSES = Object.freeze({
    UNCHANGED: "unchanged",
    EXPANDED: "expanded",
    RECOVERED: "recovered",
});

const DEFAULT_EXPAND_MODE = EXPAND_MODES.COMPILE;
const COMPILE_MODE_ALIASES = new Set(["normal", "program", "test", "bench"]);
const NAMESPACE_SOURCE_CONTEXT = "__stage2SourceContext";

export function resolveExpandMode(options = {}) {
    if (options.mode) {
        return COMPILE_MODE_ALIASES.has(options.mode)
            ? EXPAND_MODES.COMPILE
            : options.mode;
    }
    if (options.intent === "compile") return EXPAND_MODES.COMPILE;
    return EXPAND_MODES.VALIDATION;
}

export function isExpandMode(value) {
    return value === EXPAND_MODES.EDITOR
        || value === EXPAND_MODES.VALIDATION
        || value === EXPAND_MODES.COMPILE;
}

export function normalizeExpandOptions(options = {}) {
    const mode = resolveExpandMode(options) ?? DEFAULT_EXPAND_MODE;
    if (!isExpandMode(mode)) {
        throw new Error(`Unknown expand mode "${mode}"`);
    }
    return {
        mode,
        recover: options.recover ?? isTolerantExpandMode(mode),
    };
}

export function needsExpansion(treeOrNode) {
    return containsModuleFeature(rootNode(treeOrNode));
}

export async function expandSource(treeOrNode, source, options = {}) {
    return (await expandSourceWithDiagnostics(treeOrNode, source, options)).source;
}

export async function expandSourceWithDiagnostics(treeOrNode, source, options = {}) {
    const { mode, recover } = normalizeExpandOptions(options);
    const root = rootNode(treeOrNode);
    const shouldExpand = containsModuleFeature(root);
    if (!shouldExpand) return createExpandResult({ mode, source, changed: false });
    try {
        const expandedSource = await runStage2ExpansionPipeline(root, source, options);
        return createExpandResult({
            mode,
            source: expandedSource,
            changed: expandedSource !== source,
        });
    } catch (error) {
        if (!recover) throw error;
        return createExpandResult({
            mode,
            source,
            changed: false,
            diagnostics: [createExpandDiagnostic(error)],
            recovered: true,
            error,
        });
    }
}

export function createExpandDiagnostic(error) {
    return {
        message: error?.message || String(error),
        severity: "error",
        source: "utu",
        phase: "expand",
    };
}

export function createExpandResult({
    mode,
    source,
    changed,
    diagnostics = [],
    recovered = false,
    error = null,
}) {
    return {
        mode,
        source,
        changed,
        diagnostics,
        recovered,
        error,
        status: recovered
            ? EXPAND_STATUSES.RECOVERED
            : changed
                ? EXPAND_STATUSES.EXPANDED
                : EXPAND_STATUSES.UNCHANGED,
    };
}

export function createStage2ExpansionDiagnostic(error) {
    return {
        message: error?.message || String(error),
        severity: "error",
        source: "utu",
        phase: "expand",
    };
}

export function createStage2ExpansionState({
    treeOrNode,
    source,
    uri = null,
    loadImport = null,
    parseSource = null,
    expandOptions = {},
} = {}) {
    const root = rootNode(treeOrNode);
    const hasModuleFeatures = containsModuleFeature(root);
    const shouldExpand = expandOptions.shouldExpand ?? hasModuleFeatures;
    return {
        root,
        source,
        uri,
        loadImport,
        parseSource,
        mode: expandOptions.mode ?? null,
        recover: Boolean(expandOptions.recover),
        hasModuleFeatures,
        shouldExpand,
        recovered: false,
        error: null,
        diagnostics: [],
        expander: shouldExpand ? createStage2Expander(root, source, { uri, loadImport, parseSource }) : null,
        typeDeclarationUnits: [],
        functionRuntimeDeclarationUnits: [],
        materializedSource: source,
    };
}

export function summarizeStage2ExpansionState(expansion) {
    const materializedSource = expansion?.materializedSource ?? expansion?.source ?? "";
    return {
        mode: expansion?.mode ?? null,
        hasModuleFeatures: Boolean(expansion?.hasModuleFeatures),
        shouldExpand: Boolean(expansion?.shouldExpand),
        recovered: Boolean(expansion?.recovered),
        error: expansion?.error ?? null,
        diagnostics: [...(expansion?.diagnostics ?? [])],
        changed: materializedSource !== (expansion?.source ?? materializedSource),
    };
}

export async function runStage2ExpansionStep(expansion, fn) {
    if (!expansion?.shouldExpand || !expansion?.expander || expansion.recovered) return null;
    try {
        return await fn(expansion.expander, expansion);
    } catch (error) {
        if (!expansion.recover) throw error;
        expansion.recovered = true;
        expansion.error = error;
        expansion.diagnostics.push(createStage2ExpansionDiagnostic(error));
        return null;
    }
}

export function disposeStage2ExpansionState(expansion) {
    for (const dispose of expansion?.expander?.loadedFileDisposers?.splice?.(0) ?? []) {
        try {
            dispose?.();
        } catch {}
    }
}

export async function snapshotStage2LoadedFiles(expansion) {
    if (!expansion?.expander) return [];
    const loadedFiles = [];
    for (const [cacheKey, descriptorPromise] of expansion.expander.loadedFiles) {
        let descriptor = null;
        try {
            descriptor = await descriptorPromise;
        } catch (error) {
            loadedFiles.push({
                cacheKey,
                uri: null,
                moduleNames: [],
                error: error?.message || String(error),
            });
            continue;
        }
        loadedFiles.push({
            cacheKey,
            uri: descriptor?.uri ?? null,
            moduleNames: [...(descriptor?.templatesByName?.keys?.() ?? [])].sort(),
        });
    }
    return loadedFiles;
}

export function collectStage2ModuleTemplateSummary(expander) {
    return [...expander.moduleTemplates.values()]
        .map((template) => ({
            name: template.name,
            typeParams: [...template.typeParams],
            itemCount: template.items.length,
            bindingNames: [...(template.moduleBindings?.keys?.() ?? [])].sort(),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

export async function loadStage2ExpansionImports(expansion) {
    await runStage2ExpansionStep(expansion, async (expander) => {
        await expander.loadRootFileImports();
    });
    return {
        ...summarizeStage2ExpansionState(expansion),
        loadedFiles: await snapshotStage2LoadedFiles(expansion),
        moduleBindings: expansion?.expander ? collectStage2ModuleTemplateSummary(expansion.expander) : [],
        parseCache: expansion?.expander ? [...expansion.expander.loadedFiles.keys()].sort() : [],
    };
}

function collectModuleTemplateFromExpander(expander, node) {
    expander.registerModuleTemplate(expander.buildModuleTemplate(node));
}

function collectTopLevelStructFieldsFromExpander(expander, node, ctx) {
    const nameNode = childOfType(node, "type_ident");
    if (!nameNode) return;
    const protocolNames = childrenOfType(childOfType(node, "protocol_list"), "type_ident").map((child) => child.text);
    if (hasAnon(node, "tag") && protocolNames.length > 0) {
        expander.topLevelTaggedTypeProtocols.set(nameNode.text, new Set(protocolNames));
    }
    const fields = new Map();
    for (const field of childrenOfType(childOfType(node, "field_list"), "field")) {
        const fieldName = childOfType(field, "identifier");
        const typeNode = kids(field).at(-1);
        if (!fieldName || !typeNode) continue;
        fields.set(fieldName.text, {
            typeInfo: expander.describeType(typeNode, ctx),
            mut: hasAnon(field, "mut"),
        });
    }
    expander.topLevelStructFieldTypes.set(nameNode.text, fields);
}

function collectTopLevelTypeFieldsFromExpander(expander, node, ctx) {
    const nameNode = childOfType(node, "type_ident");
    if (!nameNode) return;
    const protocolNames = childrenOfType(childOfType(node, "protocol_list"), "type_ident").map((child) => child.text);
    if (hasAnon(node, "tag") && protocolNames.length > 0) {
        expander.topLevelTaggedTypeProtocols.set(nameNode.text, new Set(protocolNames));
    }
    for (const variant of childrenOfType(childOfType(node, "variant_list"), "variant")) {
        const variantName = childOfType(variant, "type_ident");
        if (!variantName) continue;
        const fields = new Map();
        for (const field of childrenOfType(childOfType(variant, "field_list"), "field")) {
            const fieldName = childOfType(field, "identifier");
            const typeNode = kids(field).at(-1);
            if (!fieldName || !typeNode) continue;
            fields.set(fieldName.text, {
                typeInfo: expander.describeType(typeNode, ctx),
                mut: hasAnon(field, "mut"),
            });
        }
        expander.topLevelStructFieldTypes.set(variantName.text, fields);
    }
}

function collectTopLevelProtocolFromExpander(expander, node, ctx) {
    const nameNode = childOfType(node, "type_ident");
    if (!nameNode) return;
    expander.topLevelProtocolNames.add(nameNode.text);
    expander.collectProtocolMembers(nameNode.text, node, ctx);
}

export function collectTopLevelDeclarationsFromExpander(expander) {
    const ctx = expander.createRootContext();
    const items = expander.flattenLibraryItems(kids(expander.root));

    for (const item of items) {
        if (item.type === "module_decl") collectModuleTemplateFromExpander(expander, item);
        if (item.type === "struct_decl") {
            const nameNode = childOfType(item, "type_ident");
            if (nameNode) expander.topLevelTypeNames.add(nameNode.text);
        }
        if (item.type === "type_decl") {
            const nameNode = childOfType(item, "type_ident");
            if (nameNode) expander.topLevelTypeNames.add(nameNode.text);
            for (const variant of childOfType(item, "variant_list")?.namedChildren ?? []) {
                if (variant.type !== "variant") continue;
                const variantName = childOfType(variant, "type_ident");
                if (variantName) expander.topLevelTypeNames.add(variantName.text);
            }
        }
        if (item.type === "proto_decl") {
            const nameNode = childOfType(item, "type_ident");
            if (nameNode) expander.topLevelProtocolNames.add(nameNode.text);
        }
    }

    for (const item of items) {
        if (item.type === "struct_decl") collectTopLevelStructFieldsFromExpander(expander, item, ctx);
        if (item.type === "type_decl") collectTopLevelTypeFieldsFromExpander(expander, item, ctx);
        if (item.type === "proto_decl") collectTopLevelProtocolFromExpander(expander, item, ctx);
    }
}

export async function collectStage2TopLevelDeclarations(expansion) {
    await runStage2ExpansionStep(expansion, (expander) => {
        collectTopLevelDeclarationsFromExpander(expander);
    });

    const expander = expansion?.expander;
    return {
        ...summarizeStage2ExpansionState(expansion),
        moduleTemplates: expander ? collectStage2ModuleTemplateSummary(expander) : [],
        topLevelFacts: expander ? {
            typeNames: [...expander.topLevelTypeNames].sort(),
            protocolNames: [...expander.topLevelProtocolNames].sort(),
            taggedTypes: [...expander.topLevelTaggedTypeProtocols.entries()]
                .map(([typeName, protocols]) => ({
                    typeName,
                    protocols: [...protocols].sort(),
                }))
                .sort((left, right) => left.typeName.localeCompare(right.typeName)),
            structFields: [...expander.topLevelStructFieldTypes.entries()]
                .map(([typeName, fields]) => ({
                    typeName,
                    fields: [...fields.entries()].map(([name, info]) => ({
                        name,
                        type: info?.typeInfo?.text ?? null,
                        mut: Boolean(info?.mut),
                    })),
                }))
                .sort((left, right) => left.typeName.localeCompare(right.typeName)),
        } : {
            typeNames: [],
            protocolNames: [],
            taggedTypes: [],
            structFields: [],
        },
    };
}

export function resolveConstructNamespace(expander, node, ctx) {
    const moduleRef = childOfType(node, "module_ref") ?? childOfType(node, "instantiated_module_ref");
    return moduleRef ? expander.resolveNamespaceFromModuleRef(moduleRef, ctx) : null;
}

export function captureNamespaceSourceContext(expander, namespace, ctx) {
    if (!namespace || namespace[NAMESPACE_SOURCE_CONTEXT]) return;
    namespace[NAMESPACE_SOURCE_CONTEXT] = expander.cloneContext(ctx, {
        localValueScopes: [],
    });
}

export function createNamespaceEmitContext(expander, namespace) {
    const baseCtx = namespace?.[NAMESPACE_SOURCE_CONTEXT] ?? expander.createRootContext();
    return expander.cloneContext(baseCtx, {
        namespace,
        typeParams: new Map([...(baseCtx.typeParams ?? new Map()), ...namespace.typeParams]),
        moduleBindings: namespace.template?.moduleBindings ?? baseCtx.moduleBindings,
        localValueScopes: [],
    });
}

function previewConstructNamespace(expander, node, ctx) {
    const named = kids(node);
    const aliasNode = named[0]?.type === "identifier"
        && ["module_ref", "instantiated_module_ref"].includes(named[1]?.type)
        ? named[0]
        : null;
    const namespace = resolveConstructNamespace(expander, node, ctx);
    captureNamespaceSourceContext(expander, namespace, ctx);
    if (aliasNode && namespace) {
        ctx.aliases.set(aliasNode.text, namespace);
    }
    return namespace;
}

function snapshotNamespaceSummary(namespace) {
    return {
        key: namespace.key,
        displayText: namespace.displayText,
        templateName: namespace.template?.name ?? null,
        typeNames: Object.fromEntries(namespace.typeNames),
        freeValueNames: Object.fromEntries(namespace.freeValueNames),
        assocNames: Object.fromEntries(namespace.assocNames),
        exportedTypes: [...namespace.exportedTypes],
        exportedValues: [...namespace.exportedValues],
        promotedTypeName: namespace.promotedTypeName ?? null,
        promotedType: namespace.promotedType ?? null,
    };
}

export async function buildStage2NamespaceModel(expansion) {
    await runStage2ExpansionStep(expansion, (expander) => {
        const ctx = expander.createRootContext();
        const items = expander.flattenLibraryItems(kids(expander.root));
        for (const item of items) {
            if (item.type !== "construct_decl") continue;
            previewConstructNamespace(expander, item, ctx);
        }
    });

    const expander = expansion?.expander;
    const namespaces = expander ? expander.namespaceOrder.map(snapshotNamespaceSummary) : [];
    return {
        ...summarizeStage2ExpansionState(expansion),
        namespaceCache: namespaces,
        namespaceOrder: namespaces.map((namespace) => namespace.displayText),
        nameMangles: namespaces.map((namespace) => ({
            namespace: namespace.displayText,
            typeNames: namespace.typeNames,
            valueNames: namespace.freeValueNames,
            assocNames: namespace.assocNames,
        })),
    };
}

function collectProtocolDispatchTableSummary(expander) {
    return [...expander.topLevelProtocolImplsByKey.values()]
        .map((entry) => ({
            protocol: entry.protocol,
            member: entry.member,
            selfType: entry.selfType,
            callee: expander.mangleProtocolDispatch(entry.protocol, entry.member, entry.selfType),
        }))
        .sort((left, right) => `${left.protocol}.${left.member}:${left.selfType}`.localeCompare(`${right.protocol}.${right.member}:${right.selfType}`));
}

export function collectSymbolFactsFromExpander(expander) {
    const ctx = expander.createRootContext();
    const items = expander.flattenLibraryItems(kids(expander.root));

    expander.collectSymbols(items, ctx, {
        onConstruct: (item) => {
            const namespace = resolveConstructNamespace(expander, item, ctx);
            captureNamespaceSourceContext(expander, namespace, ctx);
            expander.applyConstruct(item, ctx);
        },
        onType: (name) => expander.topLevelTypeNames.add(name),
        onValue: (name, type) => {
            expander.topLevelValueNames.add(name);
            expander.topLevelValueTypes.set(name, type);
        },
        onFunction: (name, returnInfo) => {
            expander.topLevelValueNames.add(name);
            expander.topLevelFnReturns.set(name, returnInfo);
        },
        onAssoc: (owner, member, returnInfo) => {
            const key = `${owner}.${member}`;
            expander.topLevelAssocNames.set(key, expander.mangleTopLevelAssoc(owner, member));
            expander.topLevelAssocReturns.set(key, returnInfo);
        },
        onProtocolImpl: (protocol, member, node, returnInfo) => {
            expander.collectTopLevelProtocolImpl(protocol, member, node, ctx, returnInfo);
        },
    });
}

export async function collectStage2SymbolFacts(expansion) {
    await runStage2ExpansionStep(expansion, (expander) => {
        collectSymbolFactsFromExpander(expander);
    });

    const expander = expansion?.expander;
    return {
        ...summarizeStage2ExpansionState(expansion),
        valueTypes: expander ? Object.fromEntries(
            [...expander.topLevelValueTypes.entries()].map(([name, info]) => [name, info?.text ?? null]),
        ) : {},
        fnReturns: expander ? Object.fromEntries(
            [...expander.topLevelFnReturns.entries()].map(([name, info]) => [name, info?.text ?? null]),
        ) : {},
        assocReturns: expander ? Object.fromEntries(
            [...expander.topLevelAssocReturns.entries()].map(([name, info]) => [name, info?.text ?? null]),
        ) : {},
        protocolDispatchTables: expander ? collectProtocolDispatchTableSummary(expander) : [],
    };
}

function emitTypeDeclaration(expander, node, ctx, inModule) {
    switch (node.type) {
        case "struct_decl":
            return expander.emitStructDecl(node, ctx, inModule);
        case "proto_decl":
            return expander.emitProtoDecl(node, ctx, inModule);
        case "type_decl":
            return `${expander.emitTypeDecl(node, ctx, inModule)};`;
        default:
            return "";
    }
}

function emitFunctionOrRuntimeDeclaration(expander, node, ctx, inModule) {
    switch (node.type) {
        case "fn_decl":
            return expander.emitFnDecl(node, ctx, inModule);
        case "global_decl":
            return `${expander.emitGlobalDecl(node, ctx, inModule)};`;
        case "jsgen_decl":
            return `${expander.emitJsgenDecl(node, ctx, inModule)};`;
        default:
            return "";
    }
}

function collectDeclarationUnitsForRoot(expander, emitUnit) {
    const ctx = expander.createRootContext();
    const items = expander.flattenLibraryItems(kids(expander.root));
    const units = [];

    for (const item of items) {
        if (item.type === "construct_decl") {
            const namespace = resolveConstructNamespace(expander, item, ctx);
            captureNamespaceSourceContext(expander, namespace, ctx);
            expander.applyConstruct(item, ctx);
            continue;
        }
        if (item.type === "module_decl" || item.type === "file_import_decl") continue;
        const source = emitUnit(expander, item, ctx, false);
        if (source) units.push({ scope: "top-level", kind: item.type, source });
    }

    return units;
}

function collectDeclarationUnitsForNamespaces(expander, emitUnit) {
    const units = [];
    for (const namespace of expander.namespaceOrder) {
        const ctx = createNamespaceEmitContext(expander, namespace);
        for (const item of namespace.template.items) {
            const source = emitUnit(expander, item, ctx, true);
            if (!source) continue;
            units.push({
                scope: namespace.displayText,
                kind: item.type,
                source,
            });
        }
    }
    return units;
}

export async function emitStage2TypeDeclarations(expansion) {
    await runStage2ExpansionStep(expansion, (expander, currentExpansion) => {
        currentExpansion.typeDeclarationUnits = [
            ...collectDeclarationUnitsForNamespaces(expander, emitTypeDeclaration),
            ...collectDeclarationUnitsForRoot(expander, emitTypeDeclaration),
        ];
    });

    return {
        ...summarizeStage2ExpansionState(expansion),
        typeDeclarations: [...(expansion?.typeDeclarationUnits ?? [])],
    };
}

export async function emitStage2FunctionAndRuntimeDeclarations(expansion) {
    await runStage2ExpansionStep(expansion, (expander, currentExpansion) => {
        currentExpansion.functionRuntimeDeclarationUnits = [
            ...collectDeclarationUnitsForNamespaces(expander, emitFunctionOrRuntimeDeclaration),
            ...collectDeclarationUnitsForRoot(expander, emitFunctionOrRuntimeDeclaration),
        ];
    });

    return {
        ...summarizeStage2ExpansionState(expansion),
        functionAndRuntimeDeclarations: [...(expansion?.functionRuntimeDeclarationUnits ?? [])],
    };
}

function recomputeNamespaceSources(expander) {
    for (const namespace of expander.namespaceOrder) {
        const ctx = createNamespaceEmitContext(expander, namespace);
        namespace.source = namespace.template.items
            .map((item) => emitStage253Item(expander, item, ctx, true))
            .filter(Boolean)
            .join("\n\n");
    }
}

export async function materializeStage2ExpandedSource(expansion) {
    await runStage2ExpansionStep(expansion, (expander, currentExpansion) => {
        recomputeNamespaceSources(expander);
        const ctx = expander.createRootContext();
        const topLevelOutputs = [];

        for (const item of kids(expander.root)) {
            if (item.type === "module_decl" || item.type === "file_import_decl") continue;
            if (item.type === "construct_decl") {
                const namespace = resolveConstructNamespace(expander, item, ctx);
                captureNamespaceSourceContext(expander, namespace, ctx);
                expander.applyConstruct(item, ctx);
                continue;
            }
            const emitted = emitStage253Item(expander, item, ctx, false);
            if (emitted) topLevelOutputs.push(emitted);
        }

        currentExpansion.materializedSource = [
            ...expander.namespaceOrder.map((namespace) => namespace.source),
            ...topLevelOutputs,
        ].filter(Boolean).join("\n\n");
    });

    return {
        ...summarizeStage2ExpansionState(expansion),
        source: expansion?.materializedSource ?? expansion?.source ?? "",
    };
}

// TODO(architecture): SCARY: this analysis layer reuses a2.5 and then re-checks expansion by walking the tree again.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

// a2.6 Prepare Declaration Expansion:
// normalize Stage-2 expansion options and gate whether expansion work is required.
export async function runA26PrepareDeclarationExpansion(context) {
    const expansionPlan = context.analyses["a2.5"] ?? null;
    const treeOrNode = context.artifacts.parse?.legacyTree ?? context.legacyTree ?? null;
    const options = normalizeExpandOptions(expansionPlan ?? context.options ?? {});
    const hasModuleFeatures = needsExpansion(treeOrNode);
    return {
        ...options,
        hasModuleFeatures,
        shouldExpand: hasModuleFeatures,
    };
}

export async function runStage2DeclarationExpansion({
    treeOrNode,
    source,
    uri = null,
    loadImport = null,
    parseSource = null,
    options = {},
} = {}) {
    const { mode, recover } = normalizeExpandOptions(options);
    if (!needsExpansion(treeOrNode)) {
        return createExpandResult({
            mode,
            source,
            changed: false,
        });
    }
    return expandSourceWithDiagnostics(treeOrNode, source, {
        uri,
        loadImport,
        parseSource,
        mode,
        recover,
    });
}

function isTolerantExpandMode(mode) {
    return mode === EXPAND_MODES.EDITOR || mode === EXPAND_MODES.VALIDATION;
}

async function runStage2ExpansionPipeline(root, source, options = {}) {
    const expansionState = createStage2ExpansionState({
        treeOrNode: root,
        source,
        uri: options.uri ?? null,
        loadImport: options.loadImport ?? null,
        parseSource: options.parseSource ?? null,
        expandOptions: options,
    });
    try {
        await loadStage2ExpansionImports(expansionState);
        await runStage2ExpansionStep(expansionState, (expander) => {
            collectTopLevelDeclarationsFromExpander(expander);
        });
        await buildStage2NamespaceModel(expansionState);
        await runStage2ExpansionStep(expansionState, (expander) => {
            collectSymbolFactsFromExpander(expander);
        });
        const materialized = await materializeStage2ExpandedSource(expansionState);
        return materialized.source;
    } finally {
        disposeStage2ExpansionState(expansionState);
    }
}
