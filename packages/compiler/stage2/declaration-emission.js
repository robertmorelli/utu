import { emitStage253Item } from "../stage2-materialize-items.js";
import { ensureStage2NamespaceDiscovery } from "./expansion-state.js";

const TYPE_DECL_NODE_TYPES = new Set([
    "struct_decl",
    "proto_decl",
    "type_decl",
]);

const FUNCTION_DECL_NODE_TYPES = new Set([
    "fn_decl",
    "global_decl",
    "jsgen_decl",
]);

function createNamespaceContext(expansionState, namespace) {
    return expansionState.expander.cloneContext(
        expansionState.expander.createRootContext(),
        {
            namespace,
            typeParams: new Map(namespace.typeParams),
            moduleBindings: namespace.template.moduleBindings ?? new Map(),
            localValueScopes: [],
        },
    );
}

function emitNamespaceDeclarations(expansionState, includeNodeType) {
    const blocks = [];
    for (const namespace of expansionState.expander.namespaceOrder) {
        const ctx = createNamespaceContext(expansionState, namespace);
        for (const item of namespace.template.items) {
            if (!includeNodeType(item.type)) continue;
            const emitted = emitStage253Item(expansionState.expander, item, ctx, true);
            if (emitted) blocks.push(emitted);
        }
    }
    return blocks;
}

export async function emitStage2TypeDeclarations(expansionState) {
    if (!expansionState?.shouldExpand) {
        return {
            blocks: [],
            source: "",
        };
    }
    await ensureStage2NamespaceDiscovery(expansionState);
    const blocks = emitNamespaceDeclarations(
        expansionState,
        (nodeType) => TYPE_DECL_NODE_TYPES.has(nodeType),
    );
    const result = {
        blocks,
        source: blocks.join("\n\n"),
    };
    expansionState.typeDeclarations = result;
    return result;
}

export async function emitStage2FunctionAndRuntimeDeclarations(expansionState) {
    if (!expansionState?.shouldExpand) {
        return {
            blocks: [],
            source: "",
        };
    }
    await ensureStage2NamespaceDiscovery(expansionState);
    const blocks = emitNamespaceDeclarations(
        expansionState,
        (nodeType) => FUNCTION_DECL_NODE_TYPES.has(nodeType),
    );
    const result = {
        blocks,
        source: blocks.join("\n\n"),
    };
    expansionState.functionDeclarations = result;
    return result;
}
