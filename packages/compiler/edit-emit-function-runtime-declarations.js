import { cloneStageTree, readCompilerArtifact } from "./compiler-stage-runtime.js";
import { prepareExpansionEmission } from "./analyze-prepare-expansion.js";
import { emitExpansionItem } from "./expansion-materialize-items.js";

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

export async function emitExpansionFunctionAndRuntimeDeclarations(expansionState, preparation = null) {
    if (!expansionState?.shouldExpand) {
        return {
            blocks: [],
            source: "",
        };
    }
    const emissionPreparation = preparation
        ?? expansionState.emissionPreparation
        ?? await prepareExpansionEmission(expansionState);
    const blocks = [];
    for (const namespacePlan of emissionPreparation.namespaces) {
        const ctx = createNamespaceContext(expansionState, namespacePlan.namespace);
        for (const item of namespacePlan.valueItems) {
            if (!FUNCTION_DECL_NODE_TYPES.has(item.type)) continue;
            const emitted = emitExpansionItem(expansionState.expander, item, ctx, true);
            if (emitted) blocks.push(emitted);
        }
    }
    const result = {
        blocks,
        source: blocks.join("\n\n"),
    };
    expansionState.functionDeclarations = result;
    return result;
}

export async function runEmitFunctionRuntimeDeclarations(context) {
    const expansionState = readCompilerArtifact(context, "expansionSession");
    const functionAndRuntimeDeclarations = await emitExpansionFunctionAndRuntimeDeclarations(
        expansionState,
        context.analyses["prepare-expansion-emission"] ?? null,
    );
    return {
        tree: cloneStageTree(context.tree),
        artifacts: {
            expansionFunctionAndRuntimeDeclarations: functionAndRuntimeDeclarations,
        },
    };
}
