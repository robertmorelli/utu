import {
    collectStage2SymbolFacts,
    collectSymbolFactsFromExpander,
} from "./stage2/symbol-facts.js";

// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over a2.16/a2.15 pipeline state.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

// a2.17 Collect Symbol/Return Facts:
// walk top-level declarations in source order and capture value/function/protocol return facts.
export async function runA217CollectSymbolReturnFacts(context) {
    const pipeline = context.analyses["a2.16"]?.pipeline ?? context.analyses["a2.15"]?.pipeline ?? null;
    const facts = await collectStage2SymbolFacts(pipeline);
    return {
        pipeline,
        ...facts,
    };
}

export { collectSymbolFactsFromExpander };
