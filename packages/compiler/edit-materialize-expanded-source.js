import { cloneStageTree, readCompilerArtifact } from "./compiler-stage-runtime.js";
import { prepareExpansionEmission } from "./expansion-emission.js";
import { runExpansionFixedPoint } from "./expansion-fixed-point.js";
import { emitExpansionItem, indentExpansionBlock } from "./expansion-materialize-items.js";
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

function emitPreparedTopLevelItem(expansionState, plan) {
    if (plan.item.type !== "library_decl") {
        return emitExpansionItem(expansionState.expander, plan.item, plan.ctx, false);
    }
    const parts = [];
    for (const childPlan of plan.childPlans ?? []) {
        const emitted = emitExpansionItem(expansionState.expander, childPlan.item, childPlan.ctx, false);
        if (emitted) parts.push(emitted);
    }
    return `library {\n${parts.map(indentExpansionBlock).join("\n\n")}\n}`;
}

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

    await runExpansionFixedPoint(expansionState);
    const emissionPreparation = preparation
        ?? expansionState.emissionPreparation
        ?? await prepareExpansionEmission(expansionState);
    const topLevelTypeBlocks = [];
    const topLevelValueBlocks = [];
    const topLevelOtherBlocks = [];
    const topLevelPlans = emissionPreparation.topLevelPlans
        ?? emissionPreparation.topLevelItems?.map((item) => ({
            item,
            ctx: emissionPreparation.rootContext ?? expansionState.expander.createRootContext(),
            childPlans: [],
        }))
        ?? [];
    for (const plan of topLevelPlans) {
        const emitted = emitPreparedTopLevelItem(expansionState, plan);
        if (!emitted) continue;
        if (TOP_LEVEL_TYPE_NODE_TYPES.has(plan.item.type)) {
            topLevelTypeBlocks.push(emitted);
            continue;
        }
        if (TOP_LEVEL_VALUE_NODE_TYPES.has(plan.item.type)) {
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
    await runExpansionFixedPoint(expansionState);
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
        context.analyses["expand"]?.emissionPreparation ?? null,
    );
    return {
        tree: cloneStageTree(context.tree),
        artifacts: {
            expansionTopLevelEmission: topLevelEmission,
        },
    };
}
