import { cloneStageTree } from "./compiler-stage-runtime.js";
import { prepareStage2ExpansionEmission } from "./analyze-prepare-expansion.js";
import { emitStage253Item } from "./expansion-materialize-items.js";
import { emitStage2FunctionAndRuntimeDeclarations } from "./edit-emit-function-runtime-declarations.js";
import { finalizeStage2ExpandedSource } from "./edit-finalize-expanded-source.js";
import { emitStage2TypeDeclarations } from "./edit-emit-type-declarations.js";

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

export async function emitStage2TopLevelExpandedItems(expansionState, preparation = null) {
    if (!expansionState) {
        throw new Error("Stage 2 expansion state is required.");
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
        ?? await prepareStage2ExpansionEmission(expansionState);
    const topLevelCtx = emissionPreparation.rootContext ?? expansionState.expander.createRootContext();
    const topLevelTypeBlocks = [];
    const topLevelValueBlocks = [];
    const topLevelOtherBlocks = [];
    for (const item of emissionPreparation.topLevelItems) {
        const emitted = emitStage253Item(expansionState.expander, item, topLevelCtx, false);
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

export async function materializeStage2ExpandedSource(expansionState) {
    const preparation = await prepareStage2ExpansionEmission(expansionState);
    const typeDeclarations = await emitStage2TypeDeclarations(expansionState, preparation);
    const functionDeclarations = await emitStage2FunctionAndRuntimeDeclarations(expansionState, preparation);
    const topLevelEmission = await emitStage2TopLevelExpandedItems(expansionState, preparation);
    return finalizeStage2ExpandedSource(expansionState, {
        typeDeclarations,
        functionDeclarations,
        topLevelEmission,
    });
}

export async function runE253MaterializeExpandedSource(context) {
    const topLevelEmission = await emitStage2TopLevelExpandedItems(
        context.artifacts.stage2Expansion ?? null,
        context.analyses["prepare-expansion-emission"] ?? null,
    );
    return {
        tree: cloneStageTree(context.tree),
        artifacts: {
            expansionTopLevelEmission: topLevelEmission,
        },
    };
}
