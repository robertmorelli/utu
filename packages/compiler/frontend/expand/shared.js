import {
    rootNode,
    namedChildren,
    childOfType,
    childrenOfType,
    hasAnon,
    findAnonBetween,
} from "../tree.js";
import { pascalCase, snakeCase, hashText } from "../../shared/expand-utils.js";

export { rootNode, namedChildren, childOfType, childrenOfType, hasAnon, findAnonBetween, pascalCase, snakeCase, hashText };

export const kids = namedChildren;
export const BUILTIN_METHOD_RETURN_INFO = new Map([
    ["array.len", { text: "i32", owner: null, namespace: null }],
]);
export const MODULE_FEATURE_NODES = new Set([
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

    expand() {
        this.collectTopLevelSymbols(this.createRootContext());

        const ctx = this.createRootContext();
        const topLevelOutputs = [];

        for (const item of kids(this.root)) {
            if (item.type === "module_decl") continue;
            if (item.type === "construct_decl") {
                this.applyConstruct(item, ctx);
                continue;
            }
            topLevelOutputs.push(this.emitItem(item, ctx, false));
        }

        return [...this.namespaceOrder.map((ns) => ns.source), ...topLevelOutputs]
            .filter(Boolean)
            .join("\n\n");
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
}

export function splitProtocolMemberKey(key) {
    const index = key.indexOf(".");
    return index === -1 ? [key, ""] : [key.slice(0, index), key.slice(index + 1)];
}

export function sameTypeInfo(left, right) {
    return (left?.text ?? null) === (right?.text ?? null);
}
