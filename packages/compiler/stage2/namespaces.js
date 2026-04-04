import {
    childOfType,
    kids,
} from "../stage2-expansion-shared.js";
import {
    runStage2ExpansionStep,
    summarizeStage2ExpansionState,
} from "./expansion-state.js";

const NAMESPACE_SOURCE_CONTEXT = "__stage2SourceContext";

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
