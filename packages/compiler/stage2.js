import { runA20CollectHeaderReferences } from "./analyze-header-references.js";
import { runA21DiscoverDeclarations } from "./analyze-discover-declarations.js";
import { runA22BuildModuleGraph } from "./analyze-build-module-graph.js";
import { runA23ResolveImports } from "./analyze-resolve-imports.js";
import { runA24ConstructNamespaces } from "./analyze-construct-namespaces.js";
import { runA25PlanDeclarationExpansion } from "./analyze-plan-declaration-expansion.js";
import { runA26PrepareDeclarationExpansion } from "./analyze-prepare-declaration-expansion.js";
import { runA214LoadImports } from "./analyze-load-imports.js";
import { runA215CollectTopLevelDecls } from "./analyze-collect-top-level-declarations.js";
import { runA216BuildNamespaceModel } from "./analyze-build-namespace-model.js";
import { runA217CollectSymbolReturnFacts } from "./analyze-collect-symbol-return-facts.js";
import { runA27IndexExpandedTree } from "./analyze-index-expanded-tree.js";
import { runA28IndexExpandedDeclarations } from "./analyze-index-expanded-declarations.js";
import { runA29DetectExpandedCollisions } from "./analyze-detect-expanded-collisions.js";
import { runA210PlanRewriteWalks } from "./analyze-plan-rewrite-walks.js";
import { runA211ValidateExpansionBoundary } from "./analyze-validate-expansion-boundary.js";
import { runA212FreezeExpansionFacts } from "./analyze-freeze-expansion-facts.js";
import { runA213IndexPostExpansionLayout } from "./analyze-index-post-expansion-layout.js";
import { runE250PrepareDeclarationEmission } from "./edit-prepare-declaration-emission.js";
import { runE251EmitTypeDeclarations } from "./edit-emit-type-declarations.js";
import { runE252EmitFunctionAndRuntimeDeclarations } from "./edit-emit-function-and-runtime-declarations.js";
import { runE253MaterializeExpandedSource } from "./edit-materialize-expanded-source.js";
import { runE254ParseMaterializedSource } from "./edit-parse-materialized-source.js";
import { runE261TypeValueResolution } from "./edit-type-value-resolution.js";
import { runE262CallPipeRewriting } from "./edit-call-and-pipe-rewriting.js";
import { runE263CoreControlRewriting } from "./edit-core-and-control-rewriting.js";
import { runE27PostExpandNormalize } from "./edit-post-expand-normalize.js";
import { runE28PruneConstructDeclarations } from "./edit-prune-construct-declarations.js";
import { runE29PruneFileImports } from "./edit-prune-file-imports.js";
import { runE210PruneModuleDeclarations } from "./edit-prune-module-declarations.js";
import { runE211NormalizeExpansionResiduals } from "./edit-normalize-expansion-residuals.js";
import { runE212FinalizeExpansionTree } from "./edit-finalize-expansion-tree.js";
import { parseTree } from "../document/tree-sitter.js";
import {
    createStage2ExpansionState,
    disposeStage2ExpansionState,
} from "./stage2-expansion-state.js";

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
        treeOrNode: state.legacyTree ?? state.tree,
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
        await runRewrite(state, "e2.5.0", runE250PrepareDeclarationEmission);
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
        delete state.artifacts.stage2Expansion;
    }
}
