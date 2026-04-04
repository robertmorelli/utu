import { runA11Load } from "./a1_1.js";
import { runA13CollectSyntaxDiagnostics } from "./a1_3.js";
import { runE12Parse } from "./e1_2.js";
import { runE13SyntaxNormalize } from "./e1_3.js";
import { runA15AnalyzeSourceLayout } from "./a1_5.js";
import { runA14CollectHeaderSnapshot } from "./a1_4.js";

function clonePoint(point) {
    return point
        ? { row: point.row, column: point.column }
        : null;
}

export function cloneStageNode(node) {
    return {
        type: node.type,
        text: node.text,
        isNamed: Boolean(node.isNamed),
        startIndex: node.startIndex ?? null,
        endIndex: node.endIndex ?? null,
        startPosition: clonePoint(node.startPosition),
        endPosition: clonePoint(node.endPosition),
        children: Array.from(node.children ?? [], cloneStageNode),
    };
}

export function cloneStageTree(tree) {
    return tree ? cloneStageNode(tree) : null;
}

// Stage 1 runner:
// own source loading, parsing, and syntax normalization as a reusable pipeline entrypoint.
function createStage1State({
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

function createStage1Context(state) {
    return {
        source: state.source,
        uri: state.uri,
        version: state.version,
        loadImport: state.loadImport,
        options: state.options,
        parser: state.parser,
        tree: state.tree,
        legacyTree: state.legacyTree,
        analyses: state.analyses,
        artifacts: state.artifacts,
    };
}

async function runAnalysis(state, key, fn) {
    state.analyses[key] = await fn(createStage1Context(state));
}

function isRewriteResult(value) {
    if (!value || typeof value !== "object") return false;
    return "tree" in value
        || "source" in value
        || "legacyTree" in value
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
    const result = await fn(createStage1Context(state));
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
    if (!isRewriteResult(result)) return result;
    if (typeof result.source === "string") {
        state.source = result.source;
    }
    if (result.legacyTree && result.legacyTree !== state.legacyTree) {
        state.disposeLegacyTree?.();
        state.legacyTree = result.legacyTree;
        state.disposeLegacyTree = result.disposeLegacyTree ?? (() => {});
    } else if (typeof result.disposeLegacyTree === "function" && result.legacyTree === state.legacyTree) {
        state.disposeLegacyTree = result.disposeLegacyTree;
    }
    if (result.artifacts && typeof result.artifacts === "object") {
        state.artifacts = { ...state.artifacts, ...result.artifacts };
    }
    state.artifacts[key] = result;
    return result;
}

export async function runCompilerNewStage1(options = {}) {
    const state = createStage1State(options);

    await runAnalysis(state, "a1.1", runA11Load);
    state.artifacts.load = state.analyses["a1.1"];

    const parsed = await runRewrite(state, "e1.2", runE12Parse);
    state.artifacts.parse = {
        ...(parsed ?? {}),
        legacyTree: state.legacyTree,
        disposeLegacyTree: state.disposeLegacyTree,
        tree: state.tree,
    };
    await runAnalysis(state, "a1.3", runA13CollectSyntaxDiagnostics);
    state.artifacts.parse = {
        ...state.artifacts.parse,
        diagnostics: state.analyses["a1.3"],
    };

    try {
        await runRewrite(state, "e1.3", runE13SyntaxNormalize);
        state.artifacts.syntaxNormalize = state.tree;
        await runAnalysis(state, "a1.5", runA15AnalyzeSourceLayout);
        state.artifacts.sourceLayout = state.analyses["a1.5"];
        await runAnalysis(state, "a1.4", runA14CollectHeaderSnapshot);
        state.artifacts.header = state.analyses["a1.4"];
        return {
            source: state.source,
            legacyTree: state.legacyTree,
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

// Build the public syntax snapshot from stage-1 artifacts.
export function createStage1SyntaxSnapshot(stage1Result) {
    const parseArtifact = stage1Result?.artifacts?.parse ?? null;
    const rootNode = parseArtifact?.legacyTree?.rootNode ?? null;
    const diagnostics = (parseArtifact?.diagnostics ?? []).map((diagnostic) => ({ ...diagnostic }));
    return {
        kind: 'syntax',
        tree: null,
        rootType: rootNode?.type ?? null,
        treeString: rootNode?.toString?.() ?? '',
        diagnostics,
    };
}
