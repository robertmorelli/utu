import { runLoadSource } from "./analysis-pass-utils.js";
import { runCollectSyntaxDiagnostics } from "./analyze-syntax-diagnostics.js";
import { runParseSource } from "./legacy-parse.js";
import { runNormalizeSyntax } from "./edit-syntax-normalize.js";
import { runBuildStageTree } from "./stage-tree.js";
import { runAnalyzeSourceLayout } from "./source-layout.js";
import { runCollectHeaderSnapshot } from "./header-snapshot.js";
import {
    disposePipelineState,
    runCompilerPipelineSteps,
    snapshotPipelineState,
    updateCompilerStageBundle,
} from "./compiler-stage-runtime.js";

export const SYNTAX_PIPELINE_FINAL_STEP = "collect-header-snapshot";

export const COMPILER_SYNTAX_STEPS = Object.freeze([
    { kind: "analysis", key: "load-source", run: runLoadSource },
    { kind: "rewrite", key: "parse-source", run: runParseSource },
    { kind: "analysis", key: "collect-syntax-diagnostics", run: runCollectSyntaxDiagnostics },
    { kind: "rewrite", key: "normalize-syntax", run: runNormalizeSyntax },
    { kind: "rewrite", key: "build-stage-tree", run: runBuildStageTree },
    { kind: "analysis", key: "analyze-source-layout", run: runAnalyzeSourceLayout },
    { kind: "analysis", key: "collect-header-snapshot", run: runCollectHeaderSnapshot },
]);

export function createCompilerPipelineState({
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

export const COMPILER_SYNTAX_AFTER_STEP_HOOKS = Object.freeze(new Map([
    ["load-source", captureLoadArtifact],
    ["parse-source", captureParseArtifact],
    ["collect-syntax-diagnostics", captureSyntaxDiagnostics],
    ["normalize-syntax", captureSyntaxNormalize],
    ["build-stage-tree", captureStageTree],
    ["analyze-source-layout", captureSourceLayout],
    ["collect-header-snapshot", (state) => {
        captureHeaderSnapshot(state);
        publishSyntaxBundle(state);
    }],
]));

export async function runCompilerSyntaxPipeline(options = {}) {
    const state = createCompilerPipelineState(options);
    try {
        await runCompilerPipelineSteps(state, COMPILER_SYNTAX_STEPS, {
            afterStepHooks: COMPILER_SYNTAX_AFTER_STEP_HOOKS,
            stopAfterStepKey: SYNTAX_PIPELINE_FINAL_STEP,
        });
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
