import { runA11Load } from "./analysis-pass-utils.js";
import { runA13CollectSyntaxDiagnostics } from "./analyze-syntax-diagnostics.js";
import { runE12Parse } from "./legacy-parse.js";
import { runE13SyntaxNormalize } from "./edit-syntax-normalize.js";
import { runE14BuildStageTree } from "./stage-tree.js";
import { runA15AnalyzeSourceLayout } from "./source-layout.js";
import { runA14CollectHeaderSnapshot } from "./header-snapshot.js";
import {
    runCompilerAnalysis,
    runCompilerRewrite,
    snapshotPipelineState,
    disposePipelineState,
    updateCompilerStageBundle,
} from "./compiler-stage-runtime.js";

const SYNTAX_STEP_SEQUENCE = Object.freeze([
    { kind: "analysis", key: "load-source", run: runA11Load },
    { kind: "rewrite", key: "parse-source", run: runE12Parse },
    { kind: "analysis", key: "collect-syntax-diagnostics", run: runA13CollectSyntaxDiagnostics },
    { kind: "rewrite", key: "normalize-syntax", run: runE13SyntaxNormalize },
    { kind: "rewrite", key: "build-stage-tree", run: runE14BuildStageTree },
    { kind: "analysis", key: "analyze-source-layout", run: runA15AnalyzeSourceLayout },
    { kind: "analysis", key: "collect-header-snapshot", run: runA14CollectHeaderSnapshot },
]);

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

async function runSyntaxStep(state, step) {
    if (step.kind === "analysis") {
        await runCompilerAnalysis(state, step.key, step.run);
    } else if (step.kind === "rewrite") {
        await runCompilerRewrite(state, step.key, step.run);
    } else {
        throw new Error(`Unknown syntax pipeline step kind "${step.kind}".`);
    }

    if (step.key === "load-source") {
        state.artifacts.load = state.analyses["load-source"] ?? null;
        return;
    }
    if (step.key === "parse-source") {
        const parsed = state.artifacts["parse-source"] ?? null;
        state.artifacts.parse = {
            ...(parsed ?? {}),
            legacyTree: state.legacyTree,
            disposeLegacyTree: state.disposeLegacyTree,
            tree: state.tree,
        };
        return;
    }
    if (step.key === "collect-syntax-diagnostics") {
        state.artifacts.parse = {
            ...(state.artifacts.parse ?? {}),
            diagnostics: state.analyses["collect-syntax-diagnostics"] ?? [],
        };
        return;
    }
    if (step.key === "normalize-syntax") {
        state.artifacts.syntaxNormalize = state.tree;
        return;
    }
    if (step.key === "build-stage-tree") {
        state.artifacts.stageTree = state.tree;
        return;
    }
    if (step.key === "analyze-source-layout") {
        state.artifacts.sourceLayout = state.analyses["analyze-source-layout"] ?? null;
        return;
    }
    if (step.key === "collect-header-snapshot") {
        state.artifacts.header = state.analyses["collect-header-snapshot"] ?? null;
        publishSyntaxBundle(state);
    }
}

export async function runCompilerSyntaxPipeline(options = {}) {
    const state = createPipelineState(options);
    try {
        for (const step of SYNTAX_STEP_SEQUENCE) {
            await runSyntaxStep(state, step);
        }
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
