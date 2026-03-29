import {
    rootNode,
    namedChildren,
    childOfType,
    childrenOfType,
    hasAnon,
    findAnonBetween,
    throwOnParseErrors,
} from "../tree.js";
import { pascalCase, snakeCase, hashText } from "../../shared/expand-utils.js";

export { rootNode, namedChildren, childOfType, childrenOfType, hasAnon, findAnonBetween, pascalCase, snakeCase, hashText };

export const kids = namedChildren;
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

    async expand() {
        try {
            await this.loadRootFileImports();
            this.collectTopLevelSymbols(this.createRootContext());

            const ctx = this.createRootContext();
            const topLevelOutputs = [];

            for (const item of kids(this.root)) {
                if (item.type === "module_decl" || item.type === "file_import_decl") continue;
                if (item.type === "construct_decl") {
                    this.applyConstruct(item, ctx);
                    continue;
                }
                topLevelOutputs.push(this.emitItem(item, ctx, false));
            }

            return [...this.namespaceOrder.map((ns) => ns.source), ...topLevelOutputs]
                .filter(Boolean)
                .join("\n\n");
        } finally {
            for (const dispose of this.loadedFileDisposers.splice(0)) {
                try { dispose?.(); } catch {}
            }
        }
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

    async loadRootFileImports() {
        const items = this.flattenLibraryItems ? this.flattenLibraryItems(kids(this.root)) : kids(this.root);
        for (const item of items) {
            if (item.type !== 'file_import_decl') continue;
            const binding = await this.resolveFileImportBinding(item, this.uri);
            this.registerModuleTemplate(binding.template);
        }
    }

    async resolveFileImportBinding(node, fromUri) {
        if (!this.loadImport) {
            throw new Error('Cross-file module imports require a host loader.');
        }
        const sourceName = moduleNameNode(childOfType(node, 'imported_module_name'))?.text;
        const capturedName = moduleNameNode(childOfType(node, 'captured_module_name'))?.text ?? sourceName;
        const specifier = childOfType(node, 'string_lit')?.text.slice(1, -1);
        if (!sourceName || !capturedName || !specifier) {
            throw new Error('Malformed file import declaration.');
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

    async loadImportedFile(fromUri, specifier) {
        const cacheKey = `${fromUri ?? 'memory://utu'}::${specifier}`;
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

    async loadImportedFileNow(fromUri, specifier) {
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
            if (item.type === 'file_import_decl') {
                fileImports.push(await this.resolveFileImportBinding(item, loaded.uri));
                continue;
            }
            if (item.type !== 'module_decl') {
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

    async parseImportedSource(source, uri) {
        if (!this.parseSource) {
            throw new Error(`Cross-file module imports require a parser for ${JSON.stringify(uri)}`);
        }
        return this.parseSource(source, uri);
    }

    buildModuleTemplate(node) {
        const name = moduleNameNode(node).text;
        const items = kids(node).filter((child) => !['identifier', 'type_ident', 'module_name', 'module_type_param_list'].includes(child.type));
        const unsupported = items.find((item) => ['module_decl', 'construct_decl', 'library_decl', 'test_decl', 'bench_decl', 'file_import_decl'].includes(item.type)) ?? null;
        if (unsupported) {
            const label = {
                module_decl: 'nested modules',
                construct_decl: 'construct declarations',
                library_decl: 'library declarations',
                test_decl: 'test declarations',
                bench_decl: 'bench declarations',
                file_import_decl: 'file imports',
            }[unsupported.type];
            throw new Error(`${label} are not supported inside modules in v1`);
        }
        return {
            name,
            typeParams: childrenOfType(childOfType(node, 'module_type_param_list'), 'type_ident').map((child) => child.text),
            items,
            moduleBindings: new Map(),
        };
    }

    cloneModuleTemplate(template, name = template.name) {
        return {
            ...template,
            name,
            typeParams: [...template.typeParams],
            items: [...template.items],
            moduleBindings: template.moduleBindings,
        };
    }

    registerModuleTemplate(template) {
        if (this.moduleTemplates.has(template.name)) {
            throw new Error(`Duplicate module "${template.name}"`);
        }
        this.moduleNames.add(template.name);
        this.moduleTemplates.set(template.name, template);
    }
}

export function splitProtocolMemberKey(key) {
    const index = key.indexOf(".");
    return index === -1 ? [key, ""] : [key.slice(0, index), key.slice(index + 1)];
}

export function sameTypeInfo(left, right) {
    return (left?.text ?? null) === (right?.text ?? null);
}
