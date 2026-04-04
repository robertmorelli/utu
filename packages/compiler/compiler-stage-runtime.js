export function clonePoint(point) {
    return point
        ? { row: point.row, column: point.column }
        : null;
}

export function cloneStageNode(node) {
    const children = Array.from(node.children ?? [], cloneStageNode);
    return {
        id: node.id ?? null,
        type: node.type,
        text: node.text,
        isNamed: Boolean(node.isNamed),
        hasError: Boolean(node.hasError),
        isMissing: Boolean(node.isMissing),
        startIndex: node.startIndex ?? null,
        endIndex: node.endIndex ?? null,
        startPosition: clonePoint(node.startPosition),
        endPosition: clonePoint(node.endPosition),
        children,
        namedChildren: children.filter((child) => child?.isNamed),
    };
}

export function cloneStageTree(tree) {
    return tree ? cloneStageNode(tree) : null;
}

const LEGACY_PASS_KEY_ALIASES = Object.freeze(new Map([
    ["load-source", "a1.1"],
    ["parse-source", "e1.2"],
    ["collect-syntax-diagnostics", "a1.3"],
    ["normalize-syntax", "e1.3"],
    ["build-stage-tree", "e1.4"],
    ["collect-header-snapshot", "a1.4"],
    ["analyze-source-layout", "a1.5"],
    ["collect-header-references", "a2.0"],
    ["discover-expansion-declarations", "a2.1"],
    ["build-module-graph", "a2.2"],
    ["resolve-imports", "a2.3"],
    ["build-namespace-aliases", "a2.4"],
    ["plan-expansion", "a2.5"],
    ["prepare-expansion-options", "a2.6"],
    ["load-expansion-imports", "a2.14"],
    ["collect-top-level-expansion-facts", "a2.15"],
    ["build-expansion-namespaces", "a2.16"],
    ["collect-expansion-symbol-facts", "a2.17"],
    ["emit-type-declarations", "e2.5.1"],
    ["emit-function-runtime-declarations", "e2.5.2"],
    ["materialize-expanded-source", "e2.5.3"],
    ["parse-materialized-source", "e2.5.4"],
    ["index-expanded-tree", "a2.7"],
    ["index-expanded-declarations", "a2.8"],
    ["detect-expanded-collisions", "a2.9"],
    ["plan-expansion-rewrites", "a2.10"],
    ["validate-expansion-boundary", "a2.11"],
    ["freeze-expansion-facts", "a2.12"],
    ["rewrite-type-values", "e2.6.1"],
    ["rewrite-calls-and-pipes", "e2.6.2"],
    ["rewrite-core-control", "e2.6.3"],
    ["normalize-post-expansion", "e2.7"],
    ["prune-construct-declarations", "e2.8"],
    ["prune-file-imports", "e2.9"],
    ["prune-module-declarations", "e2.10"],
    ["normalize-expansion-residuals", "e2.11"],
    ["finalize-expansion-tree", "e2.12"],
    ["index-post-expansion-layout", "a2.13"],
    ["index-top-level-symbols", "a3.1"],
    ["bind-top-level-symbols", "a3.2"],
    ["check-semantics", "a3.3"],
    ["plan-compile", "a3.4"],
    ["collect-lowering-metadata", "a4.1"],
    ["collect-binaryen-metadata", "a4.2"],
    ["prepare-backend-metadata-defaults", "a4.3"],
    ["lower-to-backend-ir", "e4.1"],
    ["build-binaryen-module", "e4.2"],
    ["validate-output-plan", "a5.1"],
    ["build-backend-artifacts", "e5.1"],
    ["analyze-js-emission-inputs", "a5.2"],
    ["emit-output", "e5.2"],
]));

function mirrorLegacyPassKey(container, key, value) {
    const legacyKey = LEGACY_PASS_KEY_ALIASES.get(key);
    if (!legacyKey || legacyKey === key) return;
    container[legacyKey] = value;
}

export function createCompilerContext(state) {
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

function ensureStageBundleContainer(artifacts) {
    if (!artifacts.stageBundles || typeof artifacts.stageBundles !== "object") {
        artifacts.stageBundles = {};
    }
    return artifacts.stageBundles;
}

export function updateCompilerStageBundle(state, stageName, bundle) {
    const stageBundles = ensureStageBundleContainer(state.artifacts);
    stageBundles[stageName] = {
        ...(stageBundles[stageName] ?? {}),
        ...(bundle ?? {}),
    };
    return stageBundles[stageName];
}

export function readCompilerStageBundle(context, stageName) {
    return context?.artifacts?.stageBundles?.[stageName] ?? null;
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

export async function runCompilerAnalysis(state, key, fn) {
    state.analyses[key] = await fn(createCompilerContext(state));
    mirrorLegacyPassKey(state.analyses, key, state.analyses[key]);
}

export async function runCompilerRewrite(state, key, fn) {
    const previousTree = state.tree;
    const result = await fn(createCompilerContext(state));
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
        state.disposeLegacyTree = result.disposeLegacyTree ?? (() => {});
    }
    if (result.artifacts && typeof result.artifacts === "object") {
        state.artifacts = { ...state.artifacts, ...result.artifacts };
    }
    state.artifacts[key] = result;
    mirrorLegacyPassKey(state.artifacts, key, result);
    return result;
}

export async function runCompilerStageSteps(state, steps, handlers = {}) {
    for (const step of steps) {
        if (step.kind === "analysis") {
            await handlers.runAnalysis(state, step.key, step.run);
            continue;
        }
        if (step.kind === "rewrite") {
            await handlers.runRewrite(state, step.key, step.run);
            continue;
        }
        throw new Error(`Unknown compiler stage step kind "${step.kind}".`);
    }
}

export function snapshotPipelineState(state) {
    return {
        source: state.source,
        legacyTree: state.legacyTree,
        stageTree: state.tree,
        analyses: state.analyses,
        artifacts: state.artifacts,
        dispose() {
            state.artifacts.stage2Expansion?.dispose?.();
            state.artifacts.stage4Binaryen?.ir?.dispose?.();
            state.artifacts.stage5?.ir?.dispose?.();
            state.disposeLegacyTree?.();
        },
    };
}

export function disposePipelineState(state) {
    state.artifacts.stage2Expansion?.dispose?.();
    state.artifacts.stage4Binaryen?.ir?.dispose?.();
    state.artifacts.stage5?.ir?.dispose?.();
    state.disposeLegacyTree?.();
}
