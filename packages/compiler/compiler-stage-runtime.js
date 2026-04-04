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

function resolveArtifactContainer(target) {
    if (!target || typeof target !== "object") {
        return null;
    }
    return target.artifacts && typeof target.artifacts === "object"
        ? target.artifacts
        : target;
}

export function mergeCompilerArtifacts(existingArtifacts, incomingArtifacts) {
    return {
        ...(existingArtifacts ?? {}),
        ...(incomingArtifacts ?? {}),
    };
}

export function readCompilerArtifact(target, artifactName) {
    const artifacts = resolveArtifactContainer(target);
    if (!artifacts) return null;
    return Object.hasOwn(artifacts, artifactName) ? artifacts[artifactName] : null;
}

export function writeCompilerArtifact(target, artifactName, value) {
    const artifacts = resolveArtifactContainer(target);
    if (!artifacts) return value;
    artifacts[artifactName] = value;
    return value;
}

export function deleteCompilerArtifact(target, artifactName) {
    const artifacts = resolveArtifactContainer(target);
    if (!artifacts) return;
    delete artifacts[artifactName];
}

function disposeCompilerArtifacts(state) {
    readCompilerArtifact(state, "expansionSession")?.dispose?.();
    readCompilerArtifact(state, "binaryenArtifact")?.ir?.dispose?.();
    readCompilerArtifact(state, "backendArtifacts")?.ir?.dispose?.();
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
        state.artifacts = mergeCompilerArtifacts(state.artifacts, result.artifacts);
    }
    state.artifacts[key] = result;
    return result;
}

export async function runCompilerPipelineSteps(state, steps, {
    runAnalysis = runCompilerAnalysis,
    runRewrite = runCompilerRewrite,
    beforeStepHooks = null,
    afterStepHooks = null,
    stopAfterStepKey = null,
    shouldStop = null,
} = {}) {
    for (const step of steps) {
        const before = beforeStepHooks?.get(step.key);
        if (before) await before(state, step);

        if (step.kind === "analysis") {
            await runAnalysis(state, step.key, step.run);
        } else if (step.kind === "rewrite") {
            await runRewrite(state, step.key, step.run);
        } else {
            throw new Error(`Unknown compiler pipeline step kind "${step.kind}".`);
        }

        const after = afterStepHooks?.get(step.key);
        if (after) await after(state, step);

        if (stopAfterStepKey && step.key === stopAfterStepKey) {
            return;
        }
        if (shouldStop?.(step, state)) {
            return;
        }
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
            disposeCompilerArtifacts(state);
            state.disposeLegacyTree?.();
        },
    };
}

export function disposePipelineState(state) {
    disposeCompilerArtifacts(state);
    state.disposeLegacyTree?.();
}
