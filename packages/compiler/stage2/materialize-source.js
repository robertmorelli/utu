import { emitStage253Item } from "../stage2-materialize-items.js";
import { namedChildren } from "../stage2-shared.js";
import { emitStage2FunctionAndRuntimeDeclarations, emitStage2TypeDeclarations } from "./declaration-emission.js";
import { ensureStage2NamespaceDiscovery } from "./expansion-state.js";

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

export async function materializeStage2ExpandedSource(expansionState) {
    if (!expansionState) {
        throw new Error("Stage 2 expansion state is required.");
    }
    if (!expansionState.shouldExpand) {
        return {
            changed: false,
            recovered: false,
            diagnostics: [...(expansionState.diagnostics ?? [])],
            source: expansionState.source,
        };
    }

    await ensureStage2NamespaceDiscovery(expansionState);

    const typeDeclarations = await emitStage2TypeDeclarations(expansionState);
    const functionDeclarations = await emitStage2FunctionAndRuntimeDeclarations(expansionState);

    const topLevelCtx = expansionState.expander.createRootContext();
    const topLevelTypeBlocks = [];
    const topLevelValueBlocks = [];
    const topLevelOtherBlocks = [];
    for (const item of namedChildren(expansionState.root)) {
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

    const source = [
        topLevelTypeBlocks.join("\n\n"),
        typeDeclarations.source,
        topLevelValueBlocks.join("\n\n"),
        functionDeclarations.source,
        topLevelOtherBlocks.join("\n\n"),
    ]
        .filter((part) => typeof part === "string" && part.trim().length > 0)
        .join("\n\n");

    const result = {
        changed: source !== expansionState.source,
        recovered: false,
        diagnostics: [...(expansionState.diagnostics ?? [])],
        source: source.length > 0 ? `${source}\n` : "",
    };
    expansionState.materialized = result;
    return result;
}
