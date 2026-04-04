import { kids, namedChildren } from "./expansion-shared.js";

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

function buildTopLevelEmissionPlans(expansionState) {
    const indexRef = { value: 0 };
    return [...namedChildren(expansionState.root)].map((item) => buildTopLevelEmissionPlan(expansionState, item, indexRef));
}

function buildTopLevelEmissionPlan(expansionState, item, indexRef) {
    if (item.type !== "library_decl") {
        const ctx = expansionState.rootItemContexts[indexRef.value] ?? expansionState.expander.createRootContext();
        indexRef.value += 1;
        return { item, ctx, childPlans: [] };
    }
    const childPlans = kids(item).map((child) => {
        const ctx = expansionState.rootItemContexts[indexRef.value] ?? expansionState.expander.createRootContext();
        indexRef.value += 1;
        return { item: child, ctx, childPlans: [] };
    });
    return {
        item,
        ctx: childPlans[0]?.ctx ?? expansionState.expander.createRootContext(),
        childPlans,
    };
}

export async function prepareExpansionEmission(expansionState) {
    if (!expansionState?.shouldExpand) {
        const result = {
            rootContext: null,
            topLevelItems: [],
            topLevelPlans: [],
            namespaces: [],
        };
        if (expansionState) expansionState.emissionPreparation = result;
        return result;
    }
    if (!expansionState.fixedPoint?.converged) {
        throw new Error("Expansion emission requires converged fixed-point state.");
    }

    const result = {
        rootContext: expansionState.expander.createRootContext(),
        topLevelItems: [...namedChildren(expansionState.root)],
        topLevelPlans: buildTopLevelEmissionPlans(expansionState),
        namespaces: expansionState.expander.namespaceOrder.map(partitionNamespaceItems),
    };
    expansionState.emissionPreparation = result;
    return result;
}

export const prepareStage2ExpansionEmission = prepareExpansionEmission;
