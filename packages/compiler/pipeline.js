import { parseTree } from "../document/tree-sitter.js";
import { runA11Load } from "./analysis-pass-utils.js";
import { runA13CollectSyntaxDiagnostics } from "./analyze-syntax-diagnostics.js";
import { runE12Parse } from "./legacy-parse.js";
import { runE13SyntaxNormalize } from "./edit-syntax-normalize.js";
import { runE14BuildStageTree } from "./stage-tree.js";
import { runA15AnalyzeSourceLayout } from "./source-layout.js";
import { runA14CollectHeaderSnapshot } from "./header-snapshot.js";
import { runA20CollectHeaderReferences } from "./analyze-header-references.js";
import { runA21DiscoverDeclarations } from "./analyze-header-snapshot.js";
import { runA22BuildModuleGraph } from "./analyze-build-module-graph.js";
import { runA23ResolveImports } from "./analyze-resolve-imports.js";
import { runA24ConstructNamespaces } from "./analyze-namespace-aliases.js";
import { runA25PlanDeclarationExpansion } from "./analyze-expansion-plan.js";
import { runA26PrepareDeclarationExpansion } from "./analyze-expansion-options.js";
import { runA214LoadExpansionImports } from "./analyze-load-expansion-imports.js";
import { runA215CollectTopLevelExpansionFacts } from "./analyze-collect-top-level-expansion-facts.js";
import { runA216BuildExpansionNamespaces } from "./analyze-build-expansion-namespaces.js";
import { runA217CollectExpansionSymbolFacts } from "./analyze-collect-expansion-symbol-facts.js";
import { runAnalyzePrepareExpansion } from "./analyze-prepare-expansion.js";
import { runA27IndexExpandedTree } from "./analyze-index-expanded-tree.js";
import { runA28IndexExpandedDeclarations } from "./analyze-index-expanded-declarations.js";
import { runA29DetectExpandedCollisions } from "./analyze-detect-expanded-collisions.js";
import { runA210PlanRewriteWalks } from "./analyze-plan-rewrite-walks.js";
import { runA211ValidateExpansionBoundary } from "./analyze-validate-expansion-boundary.js";
import { runA212FreezeExpansionFacts } from "./analyze-freeze-expansion-facts.js";
import { runA213IndexPostExpansionLayout } from "./analyze-index-post-expansion-layout.js";
import { runAnalyzeIndexSymbolsAndDeclarations } from "./analyze-index-symbols-and-declarations.js";
import { runAnalyzeBindReferences } from "./analyze-bind-references.js";
import { runAnalyzeSemanticChecks } from "./analyze-semantic-checks.js";
import { runAnalyzePlanCompile } from "./analyze-plan-compile.js";
import { runAnalyzeCollectLoweringMetadata } from "./analyze-collect-lowering-metadata.js";
import { runAnalyzeCollectBinaryenMetadata } from "./analyze-collect-binaryen-metadata.js";
import { runAnalyzePrepareBackendMetadataDefaults } from "./analyze-prepare-backend-metadata-defaults.js";
import { runAnalyzeValidateOptimizeOutputPlan } from "./analyze-validate-optimize-output-plan.js";
import { runAnalyzeJsEmissionInputs } from "./analyze-js-emission-inputs.js";
import { runE251EmitTypeDeclarations } from "./edit-emit-type-declarations.js";
import { runE252EmitFunctionAndRuntimeDeclarations } from "./edit-emit-function-runtime-declarations.js";
import { runEditFinalizeExpandedSource } from "./edit-finalize-expanded-source.js";
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
import { runE41LowerToBackendIr } from "./edit-lower-to-backend-ir.js";
import { runE42BuildBinaryen } from "./binaryen-build.js";
import { runE51BuildBackendArtifacts } from "./backend-artifact-builder.js";
import { runE52Emit } from "./output-emission.js";
import {
    runCompilerAnalysis,
    runCompilerRewrite,
    snapshotPipelineState,
    disposePipelineState,
    updateCompilerStageBundle,
} from "./compiler-stage-runtime.js";
import {
    createStage2ExpansionState,
    disposeStage2ExpansionState,
} from "./expansion-session.js";

const SYNTAX_LAST_STEP_KEY = "collect-header-snapshot";

const PIPELINE_COMPATIBILITY_CHECKPOINTS = Object.freeze([
    { id: 1, name: "stage1-syntax", afterStepKey: "collect-header-snapshot" },
    { id: 2, name: "stage2-expansion-preparation", afterStepKey: "prepare-expansion-options" },
    { id: 3, name: "stage3-expansion-discovery", afterStepKey: "collect-expansion-symbol-facts" },
    { id: 4, name: "stage4-expansion-materialization", afterStepKey: "parse-materialized-source" },
    { id: 5, name: "stage5-post-expansion-analysis", afterStepKey: "freeze-expansion-facts" },
    { id: 6, name: "stage6-expansion-cleanup", afterStepKey: "index-post-expansion-layout" },
    { id: 7, name: "stage7-semantics", afterStepKey: "check-semantics" },
    { id: 8, name: "stage8-compile-plan", afterStepKey: "plan-compile" },
    { id: 9, name: "stage9-lowering", afterStepKey: "build-binaryen-module" },
    { id: 10, name: "stage10-output", afterStepKey: "emit-output" },
]);

const PIPELINE_STEP_SEQUENCE = Object.freeze([
    { kind: "analysis", key: "load-source", run: runA11Load },
    { kind: "rewrite", key: "parse-source", run: runE12Parse },
    { kind: "analysis", key: "collect-syntax-diagnostics", run: runA13CollectSyntaxDiagnostics },
    { kind: "rewrite", key: "normalize-syntax", run: runE13SyntaxNormalize },
    { kind: "rewrite", key: "build-stage-tree", run: runE14BuildStageTree },
    { kind: "analysis", key: "analyze-source-layout", run: runA15AnalyzeSourceLayout },
    { kind: "analysis", key: "collect-header-snapshot", run: runA14CollectHeaderSnapshot },
    { kind: "analysis", key: "collect-header-references", run: runA20CollectHeaderReferences },
    { kind: "analysis", key: "discover-expansion-declarations", run: runA21DiscoverDeclarations },
    { kind: "analysis", key: "build-module-graph", run: runA22BuildModuleGraph },
    { kind: "analysis", key: "resolve-imports", run: runA23ResolveImports },
    { kind: "analysis", key: "build-namespace-aliases", run: runA24ConstructNamespaces },
    { kind: "analysis", key: "plan-expansion", run: runA25PlanDeclarationExpansion },
    { kind: "analysis", key: "prepare-expansion-options", run: runA26PrepareDeclarationExpansion },
    { kind: "analysis", key: "load-expansion-imports", run: runA214LoadExpansionImports },
    { kind: "analysis", key: "collect-top-level-expansion-facts", run: runA215CollectTopLevelExpansionFacts },
    { kind: "analysis", key: "build-expansion-namespaces", run: runA216BuildExpansionNamespaces },
    { kind: "analysis", key: "collect-expansion-symbol-facts", run: runA217CollectExpansionSymbolFacts },
    { kind: "analysis", key: "prepare-expansion-emission", run: runAnalyzePrepareExpansion },
    { kind: "rewrite", key: "emit-type-declarations", run: runE251EmitTypeDeclarations },
    { kind: "rewrite", key: "emit-function-runtime-declarations", run: runE252EmitFunctionAndRuntimeDeclarations },
    { kind: "rewrite", key: "materialize-expanded-source", run: runE253MaterializeExpandedSource },
    { kind: "rewrite", key: "finalize-expanded-source", run: runEditFinalizeExpandedSource },
    { kind: "rewrite", key: "parse-materialized-source", run: runE254ParseMaterializedSource },
    { kind: "analysis", key: "index-expanded-tree", run: runA27IndexExpandedTree },
    { kind: "analysis", key: "index-expanded-declarations", run: runA28IndexExpandedDeclarations },
    { kind: "analysis", key: "detect-expanded-collisions", run: runA29DetectExpandedCollisions },
    { kind: "analysis", key: "plan-expansion-rewrites", run: runA210PlanRewriteWalks },
    { kind: "analysis", key: "validate-expansion-boundary", run: runA211ValidateExpansionBoundary },
    { kind: "analysis", key: "freeze-expansion-facts", run: runA212FreezeExpansionFacts },
    { kind: "rewrite", key: "rewrite-type-values", run: runE261TypeValueResolution },
    { kind: "rewrite", key: "rewrite-calls-and-pipes", run: runE262CallPipeRewriting },
    { kind: "rewrite", key: "rewrite-core-control", run: runE263CoreControlRewriting },
    { kind: "rewrite", key: "normalize-post-expansion", run: runE27PostExpandNormalize },
    { kind: "rewrite", key: "prune-construct-declarations", run: runE28PruneConstructDeclarations },
    { kind: "rewrite", key: "prune-file-imports", run: runE29PruneFileImports },
    { kind: "rewrite", key: "prune-module-declarations", run: runE210PruneModuleDeclarations },
    { kind: "rewrite", key: "normalize-expansion-residuals", run: runE211NormalizeExpansionResiduals },
    { kind: "rewrite", key: "finalize-expansion-tree", run: runE212FinalizeExpansionTree },
    { kind: "analysis", key: "index-post-expansion-layout", run: runA213IndexPostExpansionLayout },
    { kind: "analysis", key: "index-top-level-symbols", run: runAnalyzeIndexSymbolsAndDeclarations },
    { kind: "analysis", key: "bind-top-level-symbols", run: runAnalyzeBindReferences },
    { kind: "analysis", key: "check-semantics", run: runAnalyzeSemanticChecks },
    { kind: "analysis", key: "plan-compile", run: runAnalyzePlanCompile },
    { kind: "analysis", key: "collect-lowering-metadata", run: runAnalyzeCollectLoweringMetadata },
    { kind: "analysis", key: "collect-binaryen-metadata", run: runAnalyzeCollectBinaryenMetadata },
    { kind: "analysis", key: "prepare-backend-metadata-defaults", run: runAnalyzePrepareBackendMetadataDefaults },
    { kind: "rewrite", key: "lower-to-backend-ir", run: runE41LowerToBackendIr },
    { kind: "rewrite", key: "build-binaryen-module", run: runE42BuildBinaryen },
    { kind: "analysis", key: "validate-output-plan", run: runAnalyzeValidateOptimizeOutputPlan },
    { kind: "rewrite", key: "build-backend-artifacts", run: runE51BuildBackendArtifacts },
    { kind: "analysis", key: "analyze-js-emission-inputs", run: runAnalyzeJsEmissionInputs },
    { kind: "rewrite", key: "emit-output", run: runE52Emit },
]);

const LEGACY_STOP_AFTER_STAGE_MAP = Object.freeze(new Map([
    [1, 1],
    [2, 6],
    [3, 8],
    [4, 9],
    [5, 10],
    [6, 10],
]));

const LEGACY_STOP_AFTER_STAGE_NAME_MAP = Object.freeze(new Map([
    ["stage1-syntax", 1],
    ["stage2-expansion-preparation", 2],
    ["stage3-expansion-rewrite", 6],
    ["stage4-semantics", 8],
    ["stage5-lowering", 9],
    ["stage6-output", 10],
]));

const CHECKPOINT_BY_AFTER_STEP_KEY = Object.freeze(new Map(
    PIPELINE_COMPATIBILITY_CHECKPOINTS
        .filter((entry) => entry.afterStepKey)
        .map((entry) => [entry.afterStepKey, entry]),
));

function createPipelineState({
    source,
    parser,
    uri = null,
    version = 0,
    loadImport = null,
    options = {},
} = {}) {
    return {
        source,
        parser,
        uri,
        version,
        loadImport,
        options,
        analyses: {},
        artifacts: {},
        tree: null,
        legacyTree: null,
        disposeLegacyTree: () => {},
    };
}

function captureLoadArtifact(state) {
    state.artifacts.load = state.analyses["load-source"] ?? null;
}

function captureParseArtifact(state) {
    const parsed = state.artifacts["parse-source"] ?? null;
    state.artifacts.parse = {
        ...(parsed ?? {}),
        legacyTree: state.legacyTree,
        disposeLegacyTree: state.disposeLegacyTree,
        tree: state.tree,
    };
}

function captureSyntaxDiagnostics(state) {
    state.artifacts.parse = {
        ...(state.artifacts.parse ?? {}),
        diagnostics: state.analyses["collect-syntax-diagnostics"] ?? [],
    };
}

function captureSyntaxNormalize(state) {
    state.artifacts.syntaxNormalize = state.tree;
}

function captureStageTree(state) {
    state.artifacts.stageTree = state.tree;
}

function captureSourceLayout(state) {
    state.artifacts.sourceLayout = state.analyses["analyze-source-layout"] ?? null;
}

function captureHeaderSnapshot(state) {
    state.artifacts.header = state.analyses["collect-header-snapshot"] ?? null;
}

function publishSyntaxBundle(state) {
    updateCompilerStageBundle(state, "syntax", {
        load: state.artifacts.load ?? state.analyses["load-source"] ?? null,
        parse: state.artifacts.parse ?? null,
        diagnostics: state.analyses["collect-syntax-diagnostics"] ?? null,
        normalizedTree: state.artifacts.syntaxNormalize ?? null,
        stageTree: state.artifacts.stageTree ?? state.tree ?? null,
        sourceLayout: state.artifacts.sourceLayout ?? state.analyses["analyze-source-layout"] ?? null,
        header: state.artifacts.header ?? state.analyses["collect-header-snapshot"] ?? null,
    });
}

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
        binaryenArtifact: state.artifacts.stage4Binaryen ?? null,
    });
}

function publishOutputBundle(state) {
    updateCompilerStageBundle(state, "output", {
        validateOptimize: state.analyses["validate-output-plan"] ?? null,
        emitPlan: state.analyses["analyze-js-emission-inputs"] ?? null,
        backendArtifacts: state.artifacts.stage5 ?? null,
        output: state.artifacts.output ?? null,
    });
}

function ensureExpansionState(state) {
    if (state.artifacts.stage2Expansion) return state.artifacts.stage2Expansion;
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
        expandOptions: state.analyses["prepare-expansion-options"] ?? state.analyses["plan-expansion"] ?? state.options ?? {},
    });
    return state.artifacts.stage2Expansion;
}

function releaseExpansionState(state) {
    if (!state.artifacts.stage2Expansion) return;
    disposeStage2ExpansionState(state.artifacts.stage2Expansion);
    delete state.artifacts.stage2Expansion;
}

const BEFORE_STEP_HOOKS = Object.freeze(new Map([
    ["load-expansion-imports", (state) => ensureExpansionState(state)],
]));

const AFTER_STEP_HOOKS = Object.freeze(new Map([
    ["load-source", (state) => captureLoadArtifact(state)],
    ["parse-source", (state) => captureParseArtifact(state)],
    ["collect-syntax-diagnostics", (state) => captureSyntaxDiagnostics(state)],
    ["normalize-syntax", (state) => captureSyntaxNormalize(state)],
    ["build-stage-tree", (state) => captureStageTree(state)],
    ["analyze-source-layout", (state) => captureSourceLayout(state)],
    ["collect-header-snapshot", (state) => {
        captureHeaderSnapshot(state);
        publishSyntaxBundle(state);
    }],
    ["prepare-expansion-options", (state) => publishExpansionBundle(state)],
    ["collect-expansion-symbol-facts", (state) => publishExpansionBundle(state)],
    ["parse-materialized-source", (state) => publishExpansionBundle(state)],
    ["freeze-expansion-facts", (state) => publishExpansionBundle(state)],
    ["index-post-expansion-layout", (state) => {
        publishExpansionBundle(state);
        releaseExpansionState(state);
    }],
    ["check-semantics", (state) => publishSemanticsBundle(state)],
    ["plan-compile", (state) => publishSemanticsBundle(state)],
    ["build-binaryen-module", (state) => publishBackendBundle(state)],
    ["emit-output", (state) => publishOutputBundle(state)],
]));

function normalizeStopAfterStage(stopAfterStage = 5) {
    if (typeof stopAfterStage === "string") {
        const stage = PIPELINE_COMPATIBILITY_CHECKPOINTS.find((entry) => entry.name === stopAfterStage);
        if (stage) return stage.id;
        const legacyStage = LEGACY_STOP_AFTER_STAGE_NAME_MAP.get(stopAfterStage);
        if (legacyStage) return legacyStage;
        throw new Error(`Unknown compiler stage "${stopAfterStage}".`);
    }
    if (!Number.isInteger(stopAfterStage)) {
        throw new TypeError("stopAfterStage must be an integer or named compiler stage.");
    }
    return LEGACY_STOP_AFTER_STAGE_MAP.get(stopAfterStage) ?? stopAfterStage;
}

async function runPipelineStep(state, step, helpers) {
    const before = BEFORE_STEP_HOOKS.get(step.key);
    if (before) await before(state);
    if (step.kind === "analysis") {
        await helpers.runAnalysis(state, step.key, step.run);
    } else if (step.kind === "rewrite") {
        await helpers.runRewrite(state, step.key, step.run);
    } else {
        throw new Error(`Unknown compiler pipeline step kind "${step.kind}".`);
    }
    const after = AFTER_STEP_HOOKS.get(step.key);
    if (after) await after(state);
}

async function executePipeline(state, {
    resolvedStopAfterStage = null,
    stopAfterPassKey = null,
} = {}) {
    const helpers = {
        runAnalysis: runCompilerAnalysis,
        runRewrite: runCompilerRewrite,
    };
    for (const step of PIPELINE_STEP_SEQUENCE) {
        await runPipelineStep(state, step, helpers);
        if (stopAfterPassKey && step.key === stopAfterPassKey) {
            return;
        }
        if (resolvedStopAfterStage !== null) {
            const checkpoint = CHECKPOINT_BY_AFTER_STEP_KEY.get(step.key);
            if (checkpoint && resolvedStopAfterStage <= checkpoint.id) {
                return;
            }
        }
    }
}

export async function runCompilerSyntaxPipeline(options = {}) {
    const state = createPipelineState(options);
    try {
        await executePipeline(state, { stopAfterPassKey: SYNTAX_LAST_STEP_KEY });
        return snapshotPipelineState(state);
    } catch (error) {
        disposePipelineState(state);
        throw error;
    }
}

export function createCompilerSyntaxSnapshot(syntaxPipeline) {
    const parseArtifact = syntaxPipeline?.artifacts?.parse ?? null;
    const rootNode = parseArtifact?.tree ?? syntaxPipeline?.stageTree ?? null;
    const diagnostics = (parseArtifact?.diagnostics ?? []).map((diagnostic) => ({ ...diagnostic }));
    return {
        kind: "syntax",
        tree: rootNode,
        rootType: rootNode?.type ?? null,
        treeString: rootNode?.toString?.() ?? "",
        diagnostics,
    };
}

export async function runCompilerNewPipeline({
    source,
    parser,
    uri = null,
    version = 0,
    loadImport = null,
    options = {},
    stopAfterStage = 5,
} = {}) {
    const resolvedStopAfterStage = normalizeStopAfterStage(stopAfterStage);
    const state = createPipelineState({
        source,
        parser,
        uri,
        version,
        loadImport,
        options,
    });

    try {
        await executePipeline(state, { resolvedStopAfterStage });
        return snapshotPipelineState(state);
    } catch (error) {
        releaseExpansionState(state);
        disposePipelineState(state);
        throw error;
    }
}

export async function runCompilerNewCompile({
    source,
    parser,
    uri = null,
    version = 0,
    loadImport = null,
    compileOptions = {},
} = {}) {
    const pipeline = await runCompilerNewPipeline({
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
        stopAfterStage: 5,
    });
    try {
        return pipeline.artifacts.output ?? null;
    } finally {
        pipeline.dispose();
    }
}

export async function runCompilerNewMetadata({
    source,
    parser,
    uri = null,
    version = 0,
    loadImport = null,
} = {}) {
    const pipeline = await runCompilerNewPipeline({
        source,
        parser,
        uri,
        version,
        loadImport,
        options: {
            intent: "metadata",
            mode: "program",
        },
        stopAfterStage: "stage7-semantics",
    });
    try {
        return pipeline.artifacts.stageBundles?.semantics?.semantic?.sourceMetadata
            ?? pipeline.analyses["check-semantics"]?.sourceMetadata
            ?? null;
    } finally {
        pipeline.dispose();
    }
}
