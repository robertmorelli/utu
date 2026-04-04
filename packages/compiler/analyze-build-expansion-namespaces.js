import { readCompilerArtifact } from "./compiler-stage-runtime.js";
import { ensureExpansionNamespaceDiscovery } from "./expansion-session.js";

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

export async function runBuildExpansionNamespaces(context) {
    const expansionState = readCompilerArtifact(context, "expansionSession");
    if (!expansionState?.shouldExpand) {
        return {
            namespaces: [],
            namespaceCache: [],
            namespaceOrder: [],
            nameMangles: [],
        };
    }
    await ensureExpansionNamespaceDiscovery(expansionState);
    const expander = expansionState.expander;
    const namespaces = expander.namespaceOrder.map(snapshotNamespaceSummary);
    expansionState.namespaceModel = {
        namespaces: expander.namespaceOrder.map((namespace) => ({
            key: namespace.key,
            displayText: namespace.displayText,
            templateName: namespace.template.name,
            promotedType: namespace.promotedType ?? null,
            exportedTypes: [...namespace.exportedTypes],
            exportedValues: [...namespace.exportedValues],
        })),
    };
    return {
        ...expansionState.namespaceModel,
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
