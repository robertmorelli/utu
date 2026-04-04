import { kids } from "./stage2-shared.js";
import { emitStage253Item } from "./stage2-materialize-items.js";
import {
    disposeStage2ExpansionState,
    runStage2ExpansionStep,
    summarizeStage2ExpansionState,
} from "./stage2-expansion-state.js";
import {
    captureNamespaceSourceContext,
    createNamespaceEmitContext,
    resolveConstructNamespace,
} from "./stage2-namespaces.js";

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
    try {
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
    } finally {
        disposeStage2ExpansionState(expansion);
    }
}
