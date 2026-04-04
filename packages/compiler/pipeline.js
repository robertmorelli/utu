import { parseTree } from "../document/tree-sitter.js";
import { runCollectHeaderReferences } from "./analyze-header-references.js";
import { runDiscoverExpansionDeclarations } from "./analyze-header-snapshot.js";
import { runBuildModuleGraph } from "./analyze-build-module-graph.js";
import { runResolveImports } from "./analyze-resolve-imports.js";
import { runBuildNamespaceAliases } from "./analyze-namespace-aliases.js";
import { runPlanExpansion } from "./analyze-expansion-plan.js";
import { runPrepareExpansionOptions } from "./analyze-expansion-options.js";
import { runLoadExpansionImports } from "./analyze-load-expansion-imports.js";
import { runCollectTopLevelExpansionFacts } from "./analyze-collect-top-level-expansion-facts.js";
import { runBuildExpansionNamespaces } from "./analyze-build-expansion-namespaces.js";
import { runCollectExpansionSymbolFacts } from "./analyze-collect-expansion-symbol-facts.js";
import { runAnalyzePrepareExpansion } from "./analyze-prepare-expansion.js";
import { runIndexExpandedTree } from "./analyze-index-expanded-tree.js";
import { runIndexExpandedDeclarations } from "./analyze-index-expanded-declarations.js";
import { runDetectExpandedCollisions } from "./analyze-detect-expanded-collisions.js";
import { runPlanExpansionRewrites } from "./analyze-plan-rewrite-walks.js";
import { runValidateExpansionBoundary } from "./analyze-validate-expansion-boundary.js";
import { runFreezeExpansionFacts } from "./analyze-freeze-expansion-facts.js";
import { runIndexPostExpansionLayout } from "./analyze-index-post-expansion-layout.js";
import { runAnalyzeIndexSymbolsAndDeclarations } from "./analyze-index-symbols-and-declarations.js";
import { runAnalyzeBindReferences } from "./analyze-bind-references.js";
import { runAnalyzeSemanticChecks } from "./analyze-semantic-checks.js";
import { runAnalyzePlanCompile } from "./analyze-plan-compile.js";
import { runAnalyzeCollectLoweringMetadata } from "./analyze-collect-lowering-metadata.js";
import { runAnalyzeCollectBinaryenMetadata } from "./analyze-collect-binaryen-metadata.js";
import { runAnalyzePrepareBackendMetadataDefaults } from "./analyze-prepare-backend-metadata-defaults.js";
import { runAnalyzeValidateOptimizeOutputPlan } from "./analyze-validate-optimize-output-plan.js";
import { runAnalyzeJsEmissionInputs } from "./analyze-js-emission-inputs.js";
import { runEmitTypeDeclarations } from "./edit-emit-type-declarations.js";
import { runEmitFunctionRuntimeDeclarations } from "./edit-emit-function-runtime-declarations.js";
import { runEditFinalizeExpandedSource } from "./edit-finalize-expanded-source.js";
import { runMaterializeExpandedSource } from "./edit-materialize-expanded-source.js";
import { runParseMaterializedSource } from "./edit-parse-materialized-source.js";
import { runRewriteTypeValues } from "./edit-type-value-resolution.js";
import { runRewriteCallsAndPipes } from "./edit-call-and-pipe-rewriting.js";
import { runRewriteCoreControl } from "./edit-core-and-control-rewriting.js";
import { runNormalizePostExpansion } from "./edit-post-expand-normalize.js";
import { runPruneConstructDeclarations } from "./edit-prune-construct-declarations.js";
import { runPruneFileImports } from "./edit-prune-file-imports.js";
import { runPruneModuleDeclarations } from "./edit-prune-module-declarations.js";
import { runNormalizeExpansionResiduals } from "./edit-normalize-expansion-residuals.js";
import { runFinalizeExpansionTree } from "./edit-finalize-expansion-tree.js";
import { runLowerToBackendIr } from "./edit-lower-to-backend-ir.js";
import { runBuildBinaryenModule } from "./binaryen-build.js";
import { runBuildBackendArtifacts } from "./backend-artifact-builder.js";
import { runEmitOutput } from "./output-emission.js";
import {
    deleteCompilerArtifact,
    readCompilerArtifact,
    snapshotPipelineState,
    disposePipelineState,
    updateCompilerStageBundle,
    writeCompilerArtifact,
    runCompilerPipelineSteps,
} from "./compiler-stage-runtime.js";
import {
    createExpansionSession,
    disposeExpansionSession,
} from "./expansion-session.js";
import {
    COMPILER_SYNTAX_AFTER_STEP_HOOKS,
    COMPILER_SYNTAX_STEPS,
    createCompilerPipelineState,
} from "./pipeline-common.js";

export {
    createCompilerSyntaxSnapshot,
    runCompilerSyntaxPipeline,
} from "./pipeline-common.js";

const PIPELINE_STAGES = Object.freeze([
    { name: "syntax", afterStepKey: "collect-header-snapshot" },
    { name: "expansion-preparation", afterStepKey: "prepare-expansion-options" },
    { name: "expansion-discovery", afterStepKey: "collect-expansion-symbol-facts" },
    { name: "expansion-materialization", afterStepKey: "parse-materialized-source" },
    { name: "post-expansion-analysis", afterStepKey: "freeze-expansion-facts" },
    { name: "expansion-cleanup", afterStepKey: "index-post-expansion-layout" },
    { name: "semantics", afterStepKey: "check-semantics" },
    { name: "compile-plan", afterStepKey: "plan-compile" },
    { name: "lowering", afterStepKey: "build-binaryen-module" },
    { name: "output", afterStepKey: "emit-output" },
]);

const COMPILER_PIPELINE_STEPS = Object.freeze([
    ...COMPILER_SYNTAX_STEPS,
    { kind: "analysis", key: "collect-header-references", run: runCollectHeaderReferences },
    { kind: "analysis", key: "discover-expansion-declarations", run: runDiscoverExpansionDeclarations },
    { kind: "analysis", key: "build-module-graph", run: runBuildModuleGraph },
    { kind: "analysis", key: "resolve-imports", run: runResolveImports },
    { kind: "analysis", key: "build-namespace-aliases", run: runBuildNamespaceAliases },
    { kind: "analysis", key: "plan-expansion", run: runPlanExpansion },
    { kind: "analysis", key: "prepare-expansion-options", run: runPrepareExpansionOptions },
    { kind: "analysis", key: "load-expansion-imports", run: runLoadExpansionImports },
    { kind: "analysis", key: "collect-top-level-expansion-facts", run: runCollectTopLevelExpansionFacts },
    { kind: "analysis", key: "build-expansion-namespaces", run: runBuildExpansionNamespaces },
    { kind: "analysis", key: "collect-expansion-symbol-facts", run: runCollectExpansionSymbolFacts },
    { kind: "analysis", key: "prepare-expansion-emission", run: runAnalyzePrepareExpansion },
    { kind: "rewrite", key: "emit-type-declarations", run: runEmitTypeDeclarations },
    { kind: "rewrite", key: "emit-function-runtime-declarations", run: runEmitFunctionRuntimeDeclarations },
    { kind: "rewrite", key: "materialize-expanded-source", run: runMaterializeExpandedSource },
    { kind: "rewrite", key: "finalize-expanded-source", run: runEditFinalizeExpandedSource },
    { kind: "rewrite", key: "parse-materialized-source", run: runParseMaterializedSource },
    { kind: "analysis", key: "index-expanded-tree", run: runIndexExpandedTree },
    { kind: "analysis", key: "index-expanded-declarations", run: runIndexExpandedDeclarations },
    { kind: "analysis", key: "detect-expanded-collisions", run: runDetectExpandedCollisions },
    { kind: "analysis", key: "plan-expansion-rewrites", run: runPlanExpansionRewrites },
    { kind: "analysis", key: "validate-expansion-boundary", run: runValidateExpansionBoundary },
    { kind: "analysis", key: "freeze-expansion-facts", run: runFreezeExpansionFacts },
    { kind: "rewrite", key: "rewrite-type-values", run: runRewriteTypeValues },
    { kind: "rewrite", key: "rewrite-calls-and-pipes", run: runRewriteCallsAndPipes },
    { kind: "rewrite", key: "rewrite-core-control", run: runRewriteCoreControl },
    { kind: "rewrite", key: "normalize-post-expansion", run: runNormalizePostExpansion },
    { kind: "rewrite", key: "prune-construct-declarations", run: runPruneConstructDeclarations },
    { kind: "rewrite", key: "prune-file-imports", run: runPruneFileImports },
    { kind: "rewrite", key: "prune-module-declarations", run: runPruneModuleDeclarations },
    { kind: "rewrite", key: "normalize-expansion-residuals", run: runNormalizeExpansionResiduals },
    { kind: "rewrite", key: "finalize-expansion-tree", run: runFinalizeExpansionTree },
    { kind: "analysis", key: "index-post-expansion-layout", run: runIndexPostExpansionLayout },
    { kind: "analysis", key: "index-top-level-symbols", run: runAnalyzeIndexSymbolsAndDeclarations },
    { kind: "analysis", key: "bind-top-level-symbols", run: runAnalyzeBindReferences },
    { kind: "analysis", key: "check-semantics", run: runAnalyzeSemanticChecks },
    { kind: "analysis", key: "plan-compile", run: runAnalyzePlanCompile },
    { kind: "analysis", key: "collect-lowering-metadata", run: runAnalyzeCollectLoweringMetadata },
    { kind: "analysis", key: "collect-binaryen-metadata", run: runAnalyzeCollectBinaryenMetadata },
    { kind: "analysis", key: "prepare-backend-metadata-defaults", run: runAnalyzePrepareBackendMetadataDefaults },
    { kind: "rewrite", key: "lower-to-backend-ir", run: runLowerToBackendIr },
    { kind: "rewrite", key: "build-binaryen-module", run: runBuildBinaryenModule },
    { kind: "analysis", key: "validate-output-plan", run: runAnalyzeValidateOptimizeOutputPlan },
    { kind: "rewrite", key: "build-backend-artifacts", run: runBuildBackendArtifacts },
    { kind: "analysis", key: "analyze-js-emission-inputs", run: runAnalyzeJsEmissionInputs },
    { kind: "rewrite", key: "emit-output", run: runEmitOutput },
]);

const PIPELINE_STAGE_STEP_KEYS = Object.freeze(new Map(
    PIPELINE_STAGES.map((entry) => [entry.name, entry.afterStepKey]),
));

const PIPELINE_STEP_KEYS = Object.freeze(new Set(
    COMPILER_PIPELINE_STEPS.map((entry) => entry.key),
));

function publishExpansionBundle(state) {
    updateCompilerStageBundle(state, "expansion", {
        preparation: {
            headerReferences: state.analyses["collect-header-references"] ?? null,
            declarations: state.analyses["discover-expansion-declarations"] ?? null,
            moduleGraph: state.analyses["build-module-graph"] ?? null,
            resolvedImports: state.analyses["resolve-imports"] ?? null,
            namespacePreparation: state.analyses["build-namespace-aliases"] ?? null,
            expansionPlan: state.analyses["plan-expansion"] ?? null,
            expansionOptions: state.analyses["prepare-expansion-options"] ?? null,
        },
        discovery: {
            imports: state.analyses["load-expansion-imports"] ?? null,
            topLevelDeclarations: state.analyses["collect-top-level-expansion-facts"] ?? null,
            namespaces: state.analyses["build-expansion-namespaces"] ?? null,
            symbolFacts: state.analyses["collect-expansion-symbol-facts"] ?? null,
        },
        materialization: {
            emissionPreparation: state.analyses["prepare-expansion-emission"] ?? null,
            declarationEmission: state.artifacts.expansionDeclarationEmission ?? null,
            typeDeclarations: state.artifacts.expansionTypeDeclarations ?? null,
            functionAndRuntimeDeclarations: state.artifacts.expansionFunctionAndRuntimeDeclarations ?? null,
            topLevelEmission: state.artifacts.expansionTopLevelEmission ?? null,
            materializedSource: state.artifacts.expansionMaterializedSource ?? null,
            reparsedExpansion: state.artifacts.expansion ?? null,
        },
        postExpansion: {
            indexedTree: state.analyses["index-expanded-tree"] ?? null,
            indexedDeclarations: state.analyses["index-expanded-declarations"] ?? null,
            collisions: state.analyses["detect-expanded-collisions"] ?? null,
            rewritePlan: state.analyses["plan-expansion-rewrites"] ?? null,
            validation: state.analyses["validate-expansion-boundary"] ?? null,
            frozenFacts: state.analyses["freeze-expansion-facts"] ?? null,
        },
        cleanup: {
            finalLayout: state.analyses["index-post-expansion-layout"] ?? null,
            finalExpansion: state.artifacts.expansion ?? null,
            finalTree: state.tree ?? null,
        },
    });
}

function publishSemanticsBundle(state) {
    updateCompilerStageBundle(state, "semantics", {
        index: state.analyses["index-top-level-symbols"] ?? null,
        bindings: state.analyses["bind-top-level-symbols"] ?? null,
        semantic: state.analyses["check-semantics"] ?? null,
        compilePlan: state.analyses["plan-compile"] ?? null,
    });
}

function publishBackendBundle(state) {
    updateCompilerStageBundle(state, "backend", {
        loweringMetadata: state.analyses["collect-lowering-metadata"] ?? null,
        binaryenMetadata: state.analyses["collect-binaryen-metadata"] ?? null,
        metadataDefaults: state.analyses["prepare-backend-metadata-defaults"] ?? null,
        binaryenArtifact: readCompilerArtifact(state, "binaryenArtifact"),
    });
}

function publishOutputBundle(state) {
    updateCompilerStageBundle(state, "output", {
        validateOptimize: state.analyses["validate-output-plan"] ?? null,
        emitPlan: state.analyses["analyze-js-emission-inputs"] ?? null,
        backendArtifacts: readCompilerArtifact(state, "backendArtifacts"),
        output: state.artifacts.output ?? null,
    });
}

function ensureExpansionSession(state) {
    const existingSession = readCompilerArtifact(state, "expansionSession");
    if (existingSession) return existingSession;

    const expansionSession = createExpansionSession({
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
        expandOptions: state.analyses["prepare-expansion-options"] ?? state.analyses["plan-expansion"] ?? state.options ?? {},
    });
    writeCompilerArtifact(state, "expansionSession", expansionSession);
    return expansionSession;
}

function releaseExpansionSession(state) {
    const expansionSession = readCompilerArtifact(state, "expansionSession");
    if (!expansionSession) return;
    disposeExpansionSession(expansionSession);
    deleteCompilerArtifact(state, "expansionSession");
}

const BEFORE_STEP_HOOKS = Object.freeze(new Map([
    ["load-expansion-imports", (state) => ensureExpansionSession(state)],
]));

const AFTER_STEP_HOOKS = Object.freeze(new Map([
    ...COMPILER_SYNTAX_AFTER_STEP_HOOKS,
    ["prepare-expansion-options", (state) => publishExpansionBundle(state)],
    ["collect-expansion-symbol-facts", (state) => publishExpansionBundle(state)],
    ["parse-materialized-source", (state) => publishExpansionBundle(state)],
    ["freeze-expansion-facts", (state) => publishExpansionBundle(state)],
    ["index-post-expansion-layout", (state) => {
        publishExpansionBundle(state);
        releaseExpansionSession(state);
    }],
    ["check-semantics", (state) => publishSemanticsBundle(state)],
    ["plan-compile", (state) => publishSemanticsBundle(state)],
    ["build-binaryen-module", (state) => publishBackendBundle(state)],
    ["emit-output", (state) => publishOutputBundle(state)],
]));

function normalizeStopAfterStage(stopAfterStage = "output") {
    if (typeof stopAfterStage !== "string") {
        throw new TypeError("stopAfterStage must be a named compiler stage or pipeline step.");
    }
    const stageStepKey = PIPELINE_STAGE_STEP_KEYS.get(stopAfterStage);
    if (stageStepKey) return stageStepKey;
    if (PIPELINE_STEP_KEYS.has(stopAfterStage)) return stopAfterStage;
    throw new Error(`Unknown compiler stage "${stopAfterStage}".`);
}

export async function runCompilerPipeline({
    source,
    parser,
    uri = null,
    version = 0,
    loadImport = null,
    options = {},
    stopAfterStage = "output",
} = {}) {
    const stopAfterStepKey = normalizeStopAfterStage(stopAfterStage);
    const state = createCompilerPipelineState({
        source,
        parser,
        uri,
        version,
        loadImport,
        options,
    });

    try {
        await runCompilerPipelineSteps(state, COMPILER_PIPELINE_STEPS, {
            beforeStepHooks: BEFORE_STEP_HOOKS,
            afterStepHooks: AFTER_STEP_HOOKS,
            stopAfterStepKey,
        });
        return snapshotPipelineState(state);
    } catch (error) {
        releaseExpansionSession(state);
        disposePipelineState(state);
        throw error;
    }
}

export async function runCompilerCompile({
    source,
    parser,
    uri = null,
    version = 0,
    loadImport = null,
    compileOptions = {},
} = {}) {
    const pipeline = await runCompilerPipeline({
        source,
        parser,
        uri,
        version,
        loadImport,
        options: {
            intent: "compile",
            originalSource: source,
            ...compileOptions,
        },
        stopAfterStage: "output",
    });
    try {
        return pipeline.artifacts.output ?? null;
    } finally {
        pipeline.dispose();
    }
}

export async function runCompilerMetadata({
    source,
    parser,
    uri = null,
    version = 0,
    loadImport = null,
} = {}) {
    const pipeline = await runCompilerPipeline({
        source,
        parser,
        uri,
        version,
        loadImport,
        options: {
            intent: "metadata",
            mode: "program",
        },
        stopAfterStage: "semantics",
    });
    try {
        return pipeline.artifacts.stageBundles?.semantics?.semantic?.sourceMetadata
            ?? pipeline.analyses["check-semantics"]?.sourceMetadata
            ?? null;
    } finally {
        pipeline.dispose();
    }
}

export const runCompilerNewPipeline = runCompilerPipeline;
export const runCompilerNewCompile = runCompilerCompile;
export const runCompilerNewMetadata = runCompilerMetadata;
