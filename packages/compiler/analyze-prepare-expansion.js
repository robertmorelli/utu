import { namedChildren } from "./expansion-shared.js";
import { readCompilerArtifact } from "./compiler-stage-runtime.js";
import { ensureExpansionNamespaceDiscovery } from "./expansion-session.js";

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

export async function prepareExpansionEmission(expansionState) {
    if (!expansionState?.shouldExpand) {
        const result = {
            rootContext: null,
            topLevelItems: [],
            namespaces: [],
        };
        if (expansionState) expansionState.emissionPreparation = result;
        return result;
    }

    await ensureExpansionNamespaceDiscovery(expansionState);

    const result = {
        rootContext: expansionState.expander.createRootContext(),
        topLevelItems: [...namedChildren(expansionState.root)],
        namespaces: expansionState.expander.namespaceOrder.map(partitionNamespaceItems),
    };
    expansionState.emissionPreparation = result;
    return result;
}

export async function runAnalyzePrepareExpansion(context) {
    return prepareExpansionEmission(readCompilerArtifact(context, "expansionSession"));
}

export const prepareStage2ExpansionEmission = prepareExpansionEmission;
