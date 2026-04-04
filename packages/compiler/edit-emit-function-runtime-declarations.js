import { cloneStageTree } from "./compiler-stage-runtime.js";
import { prepareStage2ExpansionEmission } from "./analyze-prepare-expansion.js";
import { emitStage253Item } from "./expansion-materialize-items.js";

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

export async function emitStage2FunctionAndRuntimeDeclarations(expansionState, preparation = null) {
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
        for (const item of namespacePlan.valueItems) {
            if (!FUNCTION_DECL_NODE_TYPES.has(item.type)) continue;
            const emitted = emitStage253Item(expansionState.expander, item, ctx, true);
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

export async function runE252EmitFunctionAndRuntimeDeclarations(context) {
    const expansionState = context.artifacts.stage2Expansion ?? null;
    const functionAndRuntimeDeclarations = await emitStage2FunctionAndRuntimeDeclarations(
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
