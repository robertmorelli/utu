import { parseTree } from "../document/tree-sitter.js";
import { containsModuleFeature, rootNode, kids } from "./stage2/expansion/core.js";
import { collectTopLevelDeclarationsFromExpander } from "./stage2/top-level-facts.js";
import { collectSymbolFactsFromExpander } from "./stage2/symbol-facts.js";
import {
    createStage2ExpansionState,
    disposeStage2ExpansionState,
    runStage2ExpansionStep,
} from "./stage2/expansion-state.js";
import { materializeStage2ExpandedSource } from "./stage2/materialize-source.js";

// TODO(architecture): SCARY: this analysis layer reuses a2.5 and then re-checks expansion by walking the tree again.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

export const EXPAND_MODES = Object.freeze({
    EDITOR: "editor",
    VALIDATION: "validation",
    COMPILE: "compile",
});

export const EXPAND_STATUSES = Object.freeze({
    UNCHANGED: "unchanged",
    EXPANDED: "expanded",
    RECOVERED: "recovered",
});

const DEFAULT_EXPAND_MODE = EXPAND_MODES.COMPILE;
const COMPILE_MODE_ALIASES = new Set(["normal", "program", "test", "bench"]);

export function resolveExpandMode(options = {}) {
    if (options.mode) {
        return COMPILE_MODE_ALIASES.has(options.mode)
            ? EXPAND_MODES.COMPILE
            : options.mode;
    }
    if (options.intent === "compile") return EXPAND_MODES.COMPILE;
    return EXPAND_MODES.VALIDATION;
}

export function isExpandMode(value) {
    return value === EXPAND_MODES.EDITOR
        || value === EXPAND_MODES.VALIDATION
        || value === EXPAND_MODES.COMPILE;
}

export function normalizeExpandOptions(options = {}) {
    const mode = resolveExpandMode(options) ?? DEFAULT_EXPAND_MODE;
    if (!isExpandMode(mode)) {
        throw new Error(`Unknown expand mode "${mode}"`);
    }
    return {
        mode,
        recover: options.recover ?? isTolerantExpandMode(mode),
    };
}

export function needsExpansion(treeOrNode) {
    return containsModuleFeature(rootNode(treeOrNode));
}

export async function expandSource(treeOrNode, source, options = {}) {
    return (await expandSourceWithDiagnostics(treeOrNode, source, options)).source;
}

export async function expandSourceWithDiagnostics(treeOrNode, source, options = {}) {
    const { mode, recover } = normalizeExpandOptions(options);
    const root = rootNode(treeOrNode);
    const shouldExpand = containsModuleFeature(root);
    if (!shouldExpand) return createExpandResult({ mode, source, changed: false });
    try {
        const expandedSource = await runStage2ExpansionPipeline(root, source, options);
        return createExpandResult({
            mode,
            source: expandedSource,
            changed: expandedSource !== source,
        });
    } catch (error) {
        if (!recover) throw error;
        return createExpandResult({
            mode,
            source,
            changed: false,
            diagnostics: [createExpandDiagnostic(error)],
            recovered: true,
            error,
        });
    }
}

export function createExpandDiagnostic(error) {
    return {
        message: error?.message || String(error),
        severity: "error",
        source: "utu",
        phase: "expand",
    };
}

export function createExpandResult({
    mode,
    source,
    changed,
    diagnostics = [],
    recovered = false,
    error = null,
}) {
    return {
        mode,
        source,
        changed,
        diagnostics,
        recovered,
        error,
        status: recovered
            ? EXPAND_STATUSES.RECOVERED
            : changed
                ? EXPAND_STATUSES.EXPANDED
                : EXPAND_STATUSES.UNCHANGED,
    };
}

// a2.6 Prepare Declaration Expansion:
// normalize Stage-2 expansion options and gate whether expansion work is required.
export async function runA26PrepareDeclarationExpansion(context) {
    const expansionPlan = context.analyses["a2.5"] ?? null;
    const treeOrNode = context.artifacts.parse?.legacyTree ?? context.legacyTree ?? null;
    const options = normalizeExpandOptions(expansionPlan ?? context.options ?? {});
    const hasModuleFeatures = needsExpansion(treeOrNode);
    return {
        ...options,
        hasModuleFeatures,
        shouldExpand: hasModuleFeatures,
    };
}

export async function runStage2DeclarationExpansion({
    treeOrNode,
    source,
    uri = null,
    loadImport = null,
    parseSource = null,
    options = {},
} = {}) {
    const { mode, recover } = normalizeExpandOptions(options);
    if (!needsExpansion(treeOrNode)) {
        return createExpandResult({
            mode,
            source,
            changed: false,
        });
    }
    return expandSourceWithDiagnostics(treeOrNode, source, {
        uri,
        loadImport,
        parseSource,
        mode,
        recover,
    });
}

function isTolerantExpandMode(mode) {
    return mode === EXPAND_MODES.EDITOR || mode === EXPAND_MODES.VALIDATION;
}

async function runStage2ExpansionPipeline(root, source, options = {}) {
    const expansionState = createStage2ExpansionState({
        treeOrNode: root,
        source,
        uri: options.uri ?? null,
        loadImport: options.loadImport ?? null,
        parseSource: options.parseSource ?? null,
        expandOptions: options,
    });
    try {
        await runStage2ExpansionStep(expansionState, async (expander) => {
            await expander.loadRootFileImports();
            collectTopLevelDeclarationsFromExpander(expander);
            collectSymbolFactsFromExpander(expander);
        });
        const materialized = await materializeStage2ExpandedSource(expansionState);
        return materialized.source;
    } finally {
        disposeStage2ExpansionState(expansionState);
    }
}
