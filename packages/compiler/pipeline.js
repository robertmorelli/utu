import { runCompilerNewStage1 } from "./stage1.js";
import { runCompilerNewStage2 } from "./stage2.js";
import { runCompilerNewStage3 } from "./stage3.js";
import { runCompilerNewStage4 } from "./stage4.js";
import { runCompilerNewStage5 } from "./stage5.js";
import { cloneStageTree } from "./stage1.js";

// Full packages/compiler pipeline runner:
// execute reusable stage 1 first, then run later analysis/rewrite passes in order.
function createContext(state) {
    return {
        source: state.source,
        uri: state.uri,
        version: state.version,
        loadImport: state.loadImport,
        options: state.options,
        parser: state.parser,
        tree: state.tree,
        analyses: state.analyses,
        artifacts: state.artifacts,
    };
}

async function runAnalysis(state, key, fn) {
    state.analyses[key] = await fn(createContext(state));
}

function isRewriteResult(value) {
    if (!value || typeof value !== "object") return false;
    return "tree" in value
        || "source" in value
        || "disposeLegacyTree" in value
        || "artifacts" in value;
}

function collectNodeRefs(root, refs = new Set()) {
    if (!root || typeof root !== "object" || refs.has(root)) return refs;
    refs.add(root);
    for (const child of root.children ?? []) {
        collectNodeRefs(child, refs);
    }
    return refs;
}

function hasSharedStageNodes(left, right) {
    if (!left || !right) return false;
    const leftRefs = collectNodeRefs(left);
    const stack = [right];
    while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (leftRefs.has(node)) return true;
        for (const child of node.children ?? []) stack.push(child);
    }
    return false;
}

async function runRewrite(state, key, fn) {
    const previousTree = state.tree;
    const result = await fn(createContext(state));
    const nextTree = isRewriteResult(result)
        ? ("tree" in result ? result.tree : undefined)
        : result;
    if (nextTree === undefined) {
        throw new Error(`${key} must return a full replacement tree.`);
    }
    if (previousTree && nextTree === previousTree) {
        throw new Error(`${key} returned the previous tree by reference; rewrite passes must return a replacement tree.`);
    }
    const replacementTree = cloneStageTree(nextTree);
    if (previousTree && hasSharedStageNodes(previousTree, replacementTree)) {
        throw new Error(`${key} produced an output tree that shares node references with the input tree.`);
    }
    state.tree = replacementTree;
    if (!isRewriteResult(result)) return;
    if (typeof result.source === "string") {
        state.source = result.source;
    }
        state.disposeLegacyTree?.();
        state.disposeLegacyTree = result.disposeLegacyTree ?? (() => {});
        state.disposeLegacyTree = result.disposeLegacyTree;
    }
    if (result.artifacts && typeof result.artifacts === "object") {
        state.artifacts = { ...state.artifacts, ...result.artifacts };
    }
    state.artifacts[key] = result;
}

export async function runCompilerNewPipeline({
    source,
    parser,
    uri = null,
    version = 0,
    loadImport = null,
    options = {},
} = {}) {
    const state = {
        source,
        parser,
        uri,
        version,
        loadImport,
        options,
        analyses: {},
        artifacts: {},
        tree: null,
        disposeLegacyTree: () => {},
    };

    const stage1 = await runCompilerNewStage1({
        source,
        parser,
        uri,
        version,
        loadImport,
        options,
    });
    state.analyses = { ...state.analyses, ...stage1.analyses };
    state.artifacts = { ...state.artifacts, ...stage1.artifacts };
    state.disposeLegacyTree = stage1.dispose;
    state.tree = stage1.stageTree;

    try {
        await runCompilerNewStage2(state, { runAnalysis, runRewrite });
        await runCompilerNewStage3(state, { runAnalysis });
        await runCompilerNewStage4(state, { runAnalysis, runRewrite });
        await runCompilerNewStage5(state, { runAnalysis, runRewrite });

        return {
            source: state.source,
            stageTree: state.tree,
            analyses: state.analyses,
            artifacts: state.artifacts,
            dispose() {
                state.disposeLegacyTree?.();
            },
        };
    } catch (error) {
        state.disposeLegacyTree?.();
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
    });
    try {
        return pipeline.analyses["a3.3"]?.sourceMetadata ?? null;
    } finally {
        pipeline.dispose();
    }
}
