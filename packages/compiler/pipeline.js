import { parseTree } from "../document/tree-sitter.js";
import { runExpand } from "./analyze-expand.js";
import { runAnalyzeIndexSymbolsAndDeclarations } from "./analyze-index-symbols-and-declarations.js";
import { runAnalyzeBindReferences } from "./analyze-bind-references.js";
import { runAnalyzeSemanticChecks } from "./analyze-semantic-checks.js";
import { runAnalyzePlanCompile } from "./analyze-plan-compile.js";
import { runAnalyzeCollectLoweringMetadata } from "./analyze-collect-lowering-metadata.js";
import { runAnalyzeCollectBinaryenMetadata } from "./analyze-collect-binaryen-metadata.js";
import { runAnalyzePrepareBackendMetadataDefaults } from "./analyze-prepare-backend-metadata-defaults.js";
import { runAnalyzeValidateOptimizeOutputPlan } from "./analyze-validate-optimize-output-plan.js";
import { runAnalyzeJsEmissionInputs } from "./analyze-js-emission-inputs.js";
import { runParseExpandedSource } from "./edit-parse-expanded-source.js";
import { runCanonicalizeExpandedTree } from "./edit-canonicalize-expanded-tree.js";
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
    { name: "expand", afterStepKey: "parse-expanded-source" },
    { name: "canonicalize-expanded-tree", afterStepKey: "canonicalize-expanded-tree" },
    { name: "semantics", afterStepKey: "check-semantics" },
    { name: "backend", afterStepKey: "build-backend-artifacts" },
    { name: "output", afterStepKey: "emit-output" },
]);

const COMPILER_PIPELINE_STEPS = Object.freeze([
    ...COMPILER_SYNTAX_STEPS,
    { kind: "analysis", key: "expand", run: runExpand },
    { kind: "rewrite", key: "parse-expanded-source", run: runParseExpandedSource },
    { kind: "rewrite", key: "canonicalize-expanded-tree", run: runCanonicalizeExpandedTree },
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
    const expand = state.analyses["expand"] ?? null;
    const bundle = {
        state: expand?.state ?? null,
        declarationEmission: state.artifacts.expansionDeclarationEmission ?? expand?.declarationEmission ?? null,
        emissionPreparation: expand?.emissionPreparation ?? null,
        typeDeclarations: state.artifacts.expansionTypeDeclarations ?? expand?.typeDeclarations ?? null,
        functionAndRuntimeDeclarations: state.artifacts.expansionFunctionAndRuntimeDeclarations ?? expand?.functionAndRuntimeDeclarations ?? null,
        topLevelEmission: state.artifacts.expansionTopLevelEmission ?? expand?.topLevelEmission ?? null,
        materializedSource: state.artifacts.expansionMaterializedSource ?? expand?.materializedSource ?? null,
        reparsedExpansion: state.artifacts.expansion ?? null,
        canonicalization: state.artifacts.expansionCanonicalization ?? null,
        finalExpansion: state.artifacts.expansion ?? null,
        finalTree: state.tree ?? null,
    };
    updateCompilerStageBundle(state, "expand", bundle);
    if (state.artifacts.expansionCanonicalization) {
        updateCompilerStageBundle(state, "canonicalize-expanded-tree", {
            canonicalization: state.artifacts.expansionCanonicalization,
            finalExpansion: state.artifacts.expansion ?? null,
            finalTree: state.tree ?? null,
        });
    }
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
        expandOptions: state.options ?? {},
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
    ["expand", (state) => ensureExpansionSession(state)],
]));

function captureExpandArtifacts(state) {
    const expand = state.analyses["expand"] ?? null;
    if (!expand) return;
    writeCompilerArtifact(state, "expansionStateSnapshot", expand.state ?? null);
    writeCompilerArtifact(state, "expansionDeclarationEmission", expand.declarationEmission ?? null);
    writeCompilerArtifact(state, "expansionTypeDeclarations", expand.typeDeclarations ?? null);
    writeCompilerArtifact(state, "expansionFunctionAndRuntimeDeclarations", expand.functionAndRuntimeDeclarations ?? null);
    writeCompilerArtifact(state, "expansionTopLevelEmission", expand.topLevelEmission ?? null);
    writeCompilerArtifact(state, "expansionMaterializedSource", expand.materializedSource ?? null);
    writeCompilerArtifact(state, "expand", {
        changed: Boolean(expand.materializedSource?.changed),
        source: expand.materializedSource?.source ?? state.source,
    });
}

const AFTER_STEP_HOOKS = Object.freeze(new Map([
    ...COMPILER_SYNTAX_AFTER_STEP_HOOKS,
    ["expand", (state) => {
        captureExpandArtifacts(state);
        publishExpansionBundle(state);
    }],
    ["parse-expanded-source", (state) => publishExpansionBundle(state)],
    ["canonicalize-expanded-tree", (state) => {
        publishExpansionBundle(state);
        releaseExpansionSession(state);
    }],
    ["check-semantics", (state) => publishSemanticsBundle(state)],
    ["plan-compile", (state) => publishSemanticsBundle(state)],
    ["build-binaryen-module", (state) => publishBackendBundle(state)],
    ["build-backend-artifacts", (state) => publishBackendBundle(state)],
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
