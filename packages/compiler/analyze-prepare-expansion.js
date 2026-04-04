import { namedChildren } from "./expansion-shared.js";
import { ensureStage2NamespaceDiscovery } from "./expansion-session.js";

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

function partitionNamespaceItems(namespace) {
    const typeItems = [];
    const valueItems = [];
    for (const item of namespace.template.items) {
        if (TYPE_DECL_NODE_TYPES.has(item.type)) {
            typeItems.push(item);
            continue;
        }
        if (FUNCTION_DECL_NODE_TYPES.has(item.type)) {
            valueItems.push(item);
        }
    }
    return {
        namespace,
        typeItems,
        valueItems,
    };
}

export async function prepareStage2ExpansionEmission(expansionState) {
    if (!expansionState?.shouldExpand) {
        const result = {
            rootContext: null,
            topLevelItems: [],
            namespaces: [],
        };
        if (expansionState) expansionState.emissionPreparation = result;
        return result;
    }

    await ensureStage2NamespaceDiscovery(expansionState);

    const result = {
        rootContext: expansionState.expander.createRootContext(),
        topLevelItems: [...namedChildren(expansionState.root)],
        namespaces: expansionState.expander.namespaceOrder.map(partitionNamespaceItems),
    };
    expansionState.emissionPreparation = result;
    return result;
}

export async function runAnalyzePrepareExpansion(context) {
    return prepareStage2ExpansionEmission(context.artifacts.stage2Expansion ?? null);
}
