import { cloneStageTree } from "./compiler-stage-runtime.js";
import { prepareStage2ExpansionEmission } from "./analyze-prepare-expansion.js";
import { emitStage253Item } from "./expansion-materialize-items.js";

const TYPE_DECL_NODE_TYPES = new Set([
    "struct_decl",
    "proto_decl",
    "type_decl",
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

export async function emitStage2TypeDeclarations(expansionState, preparation = null) {
    if (!expansionState?.shouldExpand) {
        return {
            blocks: [],
            source: "",
        };
    }
    const emissionPreparation = preparation
        ?? expansionState.emissionPreparation
        ?? await prepareStage2ExpansionEmission(expansionState);
    const blocks = [];
    for (const namespacePlan of emissionPreparation.namespaces) {
        const ctx = createNamespaceContext(expansionState, namespacePlan.namespace);
        for (const item of namespacePlan.typeItems) {
            if (!TYPE_DECL_NODE_TYPES.has(item.type)) continue;
            const emitted = emitStage253Item(expansionState.expander, item, ctx, true);
            if (emitted) blocks.push(emitted);
        }
    }
    const result = {
        blocks,
        source: blocks.join("\n\n"),
    };
    expansionState.typeDeclarations = result;
    return result;
}

export async function runE251EmitTypeDeclarations(context) {
    const expansionState = context.artifacts.stage2Expansion ?? null;
    const typeDeclarations = await emitStage2TypeDeclarations(
        expansionState,
        context.analyses["prepare-expansion-emission"] ?? null,
    );
    return {
        tree: cloneStageTree(context.tree),
        artifacts: {
            expansionDeclarationEmission: {
                ready: Boolean(expansionState?.shouldExpand),
                recovered: Boolean(expansionState?.recovered),
                diagnostics: [...(expansionState?.diagnostics ?? [])],
            },
            expansionTypeDeclarations: typeDeclarations,
        },
    };
}
