import { cloneStageTree, readCompilerArtifact } from "./compiler-stage-runtime.js";

export function finalizeExpandedSource(expansionState, {
    typeDeclarations = null,
    functionDeclarations = null,
    topLevelEmission = null,
} = {}) {
    if (!expansionState) {
        throw new Error("Expansion session is required.");
    }
    if (!expansionState.shouldExpand) {
        const result = {
            changed: false,
            recovered: Boolean(expansionState.recovered),
            diagnostics: [...(expansionState.diagnostics ?? [])],
            source: expansionState.source,
        };
        expansionState.materialized = result;
        return result;
    }

    const source = [
        topLevelEmission?.typeBlocks?.join("\n\n") ?? "",
        typeDeclarations?.source ?? "",
        topLevelEmission?.valueBlocks?.join("\n\n") ?? "",
        functionDeclarations?.source ?? "",
        topLevelEmission?.otherBlocks?.join("\n\n") ?? "",
    ]
        .filter((part) => typeof part === "string" && part.trim().length > 0)
        .join("\n\n");

    const result = {
        changed: source !== expansionState.source,
        recovered: Boolean(expansionState.recovered),
        diagnostics: [...(expansionState.diagnostics ?? [])],
        source: source.length > 0 ? `${source}\n` : "",
    };
    expansionState.materialized = result;
    return result;
}

export async function runEditFinalizeExpandedSource(context) {
    const materialized = finalizeExpandedSource(readCompilerArtifact(context, "expansionSession"), {
        typeDeclarations: context.artifacts.expansionTypeDeclarations ?? null,
        functionDeclarations: context.artifacts.expansionFunctionAndRuntimeDeclarations ?? null,
        topLevelEmission: context.artifacts.expansionTopLevelEmission ?? null,
    });
    return {
        tree: cloneStageTree(context.tree),
        artifacts: {
            expansionMaterializedSource: materialized,
        },
    };
}

export const finalizeStage2ExpandedSource = finalizeExpandedSource;
