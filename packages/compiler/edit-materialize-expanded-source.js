import { cloneStageTree, readCompilerArtifact } from "./compiler-stage-runtime.js";
import { prepareExpansionEmission } from "./analyze-prepare-expansion.js";
import { emitExpansionItem } from "./expansion-materialize-items.js";
import { emitExpansionFunctionAndRuntimeDeclarations } from "./edit-emit-function-runtime-declarations.js";
import { finalizeExpandedSource } from "./edit-finalize-expanded-source.js";
import { emitExpansionTypeDeclarations } from "./edit-emit-type-declarations.js";

const TOP_LEVEL_TYPE_NODE_TYPES = new Set([
    "struct_decl",
    "proto_decl",
    "type_decl",
]);

const TOP_LEVEL_VALUE_NODE_TYPES = new Set([
    "fn_decl",
    "global_decl",
    "jsgen_decl",
]);

export async function emitExpansionTopLevelItems(expansionState, preparation = null) {
    if (!expansionState) {
        throw new Error("Expansion session is required.");
    }
    if (!expansionState.shouldExpand) {
        return {
            typeBlocks: [],
            valueBlocks: [],
            otherBlocks: [],
        };
    }

    const emissionPreparation = preparation
        ?? expansionState.emissionPreparation
        ?? await prepareExpansionEmission(expansionState);
    const topLevelCtx = emissionPreparation.rootContext ?? expansionState.expander.createRootContext();
    const topLevelTypeBlocks = [];
    const topLevelValueBlocks = [];
    const topLevelOtherBlocks = [];
    for (const item of emissionPreparation.topLevelItems) {
        const emitted = emitExpansionItem(expansionState.expander, item, topLevelCtx, false);
        if (!emitted) continue;
        if (TOP_LEVEL_TYPE_NODE_TYPES.has(item.type)) {
            topLevelTypeBlocks.push(emitted);
            continue;
        }
        if (TOP_LEVEL_VALUE_NODE_TYPES.has(item.type)) {
            topLevelValueBlocks.push(emitted);
            continue;
        }
        topLevelOtherBlocks.push(emitted);
    }

    const result = {
        typeBlocks: topLevelTypeBlocks,
        valueBlocks: topLevelValueBlocks,
        otherBlocks: topLevelOtherBlocks,
    };
    expansionState.topLevelEmission = result;
    return result;
}

export async function materializeExpandedSource(expansionState) {
    const preparation = await prepareExpansionEmission(expansionState);
    const typeDeclarations = await emitExpansionTypeDeclarations(expansionState, preparation);
    const functionDeclarations = await emitExpansionFunctionAndRuntimeDeclarations(expansionState, preparation);
    const topLevelEmission = await emitExpansionTopLevelItems(expansionState, preparation);
    return finalizeExpandedSource(expansionState, {
        typeDeclarations,
        functionDeclarations,
        topLevelEmission,
    });
}

export async function runMaterializeExpandedSource(context) {
    const topLevelEmission = await emitExpansionTopLevelItems(
        readCompilerArtifact(context, "expansionSession"),
        context.analyses["prepare-expansion-emission"] ?? null,
    );
    return {
        tree: cloneStageTree(context.tree),
        artifacts: {
            expansionTopLevelEmission: topLevelEmission,
        },
    };
}
