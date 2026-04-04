import { runA20CollectHeaderReferences } from "./a2_0.js";
import { runA21DiscoverDeclarations } from "./a2_1.js";
import { runA22BuildModuleGraph } from "./a2_2.js";
import { runA23ResolveImports } from "./a2_3.js";
import { runA24ConstructNamespaces } from "./a2_4.js";
import { runA25PlanDeclarationExpansion } from "./a2_5.js";
import { runA26PrepareDeclarationExpansion } from "./a2_6.js";
import { runA214LoadImports } from "./a2_14.js";
import { runA215CollectTopLevelDecls } from "./a2_15.js";
import { runA216BuildNamespaceModel } from "./a2_16.js";
import { runA217CollectSymbolReturnFacts } from "./a2_17.js";
import { runA27IndexExpandedTree } from "./a2_7.js";
import { runA28IndexExpandedDeclarations } from "./a2_8.js";
import { runA29DetectExpandedCollisions } from "./a2_9.js";
import { runA210PlanRewriteWalks } from "./a2_10.js";
import { runA211ValidateExpansionBoundary } from "./a2_11.js";
import { runA212FreezeExpansionFacts } from "./a2_12.js";
import { runA213IndexPostExpansionLayout } from "./a2_13.js";
import { runE251EmitTypeDeclarations } from "./e2_5_1.js";
import { runE252EmitFunctionAndRuntimeDeclarations } from "./e2_5_2.js";
import { runE253MaterializeExpandedSource } from "./e2_5_3.js";
import { runE254ParseMaterializedSource } from "./e2_5_4.js";
import { runE261TypeValueResolution } from "./e2_6_1.js";
import { runE262CallPipeRewriting } from "./e2_6_2.js";
import { runE263CoreControlRewriting } from "./e2_6_3.js";
import { runE27PostExpandNormalize } from "./e2_7.js";
import { runE28PruneConstructDeclarations } from "./e2_8.js";
import { runE29PruneFileImports } from "./e2_9.js";
import { runE210PruneModuleDeclarations } from "./e2_10.js";
import { runE211NormalizeExpansionResiduals } from "./e2_11.js";
import { runE212FinalizeExpansionTree } from "./e2_12.js";
import { parseTree } from "../document/tree-sitter.js";
import {
    createStage2ExpansionState,
    disposeStage2ExpansionState,
} from "./stage2/expansion-state.js";

// Stage 2 runner:
// own expansion analysis/rewrite ordering before semantics.
export async function runCompilerNewStage2(state, { runAnalysis, runRewrite }) {
    await runAnalysis(state, "a2.0", runA20CollectHeaderReferences);
    await runAnalysis(state, "a2.1", runA21DiscoverDeclarations);
    await runAnalysis(state, "a2.2", runA22BuildModuleGraph);
    await runAnalysis(state, "a2.3", runA23ResolveImports);
    await runAnalysis(state, "a2.4", runA24ConstructNamespaces);
    await runAnalysis(state, "a2.5", runA25PlanDeclarationExpansion);
    await runAnalysis(state, "a2.6", runA26PrepareDeclarationExpansion);

    state.artifacts.stage2Expansion = createStage2ExpansionState({
        source: state.source,
        uri: state.uri ?? null,
        loadImport: state.loadImport ?? null,
        parseSource: async (sourceText) => {
            const parsed = parseTree(
                state.parser,
                sourceText,
                "Tree-sitter returned no syntax tree for the rewritten document.",
            );
            return {
                root: parsed.tree.rootNode,
                dispose: parsed.dispose,
            };
        },
        expandOptions: state.analyses["a2.6"] ?? state.analyses["a2.5"] ?? state.options ?? {},
    });

    try {
        await runAnalysis(state, "a2.14", runA214LoadImports);
        await runAnalysis(state, "a2.15", runA215CollectTopLevelDecls);
        await runAnalysis(state, "a2.16", runA216BuildNamespaceModel);
        await runAnalysis(state, "a2.17", runA217CollectSymbolReturnFacts);
        await runRewrite(state, "e2.5.1", runE251EmitTypeDeclarations);
        await runRewrite(state, "e2.5.2", runE252EmitFunctionAndRuntimeDeclarations);
        await runRewrite(state, "e2.5.3", runE253MaterializeExpandedSource);
        await runRewrite(state, "e2.5.4", runE254ParseMaterializedSource);
        await runAnalysis(state, "a2.7", runA27IndexExpandedTree);
        await runAnalysis(state, "a2.8", runA28IndexExpandedDeclarations);
        await runAnalysis(state, "a2.9", runA29DetectExpandedCollisions);
        await runAnalysis(state, "a2.10", runA210PlanRewriteWalks);
        await runAnalysis(state, "a2.11", runA211ValidateExpansionBoundary);
        await runAnalysis(state, "a2.12", runA212FreezeExpansionFacts);
        await runRewrite(state, "e2.6.1", runE261TypeValueResolution);
        await runRewrite(state, "e2.6.2", runE262CallPipeRewriting);
        await runRewrite(state, "e2.6.3", runE263CoreControlRewriting);
        await runRewrite(state, "e2.7", runE27PostExpandNormalize);
        await runRewrite(state, "e2.8", runE28PruneConstructDeclarations);
        await runRewrite(state, "e2.9", runE29PruneFileImports);
        await runRewrite(state, "e2.10", runE210PruneModuleDeclarations);
        await runRewrite(state, "e2.11", runE211NormalizeExpansionResiduals);
        await runRewrite(state, "e2.12", runE212FinalizeExpansionTree);
        await runAnalysis(state, "a2.13", runA213IndexPostExpansionLayout);
    } finally {
        disposeStage2ExpansionState(state.artifacts.stage2Expansion);
    }
}
