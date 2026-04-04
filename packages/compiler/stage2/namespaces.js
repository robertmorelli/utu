import { ensureStage2NamespaceDiscovery } from "./expansion-state.js";

export async function buildStage2NamespaceModel(expansionState) {
    if (!expansionState?.shouldExpand) {
        return {
            namespaces: [],
        };
    }
    await ensureStage2NamespaceDiscovery(expansionState);
    const namespaces = expansionState.expander.namespaceOrder.map((namespace) => ({
        key: namespace.key,
        displayText: namespace.displayText,
        templateName: namespace.template.name,
        promotedType: namespace.promotedType ?? null,
        exportedTypes: [...namespace.exportedTypes],
        exportedValues: [...namespace.exportedValues],
    }));
    expansionState.namespaceModel = { namespaces };
    return expansionState.namespaceModel;
}
