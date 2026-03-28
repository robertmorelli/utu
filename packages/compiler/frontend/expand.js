import { ModuleExpander, containsModuleFeature, rootNode } from "./expand/shared.js";
import "./expand/collect.js";
import "./expand/emit-declarations.js";
import "./expand/emit-expressions.js";

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

export const DEFAULT_EXPAND_MODE = EXPAND_MODES.COMPILE;

export function isExpandMode(value) {
    return value === EXPAND_MODES.EDITOR
        || value === EXPAND_MODES.VALIDATION
        || value === EXPAND_MODES.COMPILE;
}

export function isTolerantExpandMode(mode) {
    return mode === EXPAND_MODES.EDITOR || mode === EXPAND_MODES.VALIDATION;
}

export function needsExpansion(treeOrNode) {
    return containsModuleFeature(rootNode(treeOrNode));
}

export function expandSource(treeOrNode, source, options = {}) {
    return expandSourceWithDiagnostics(treeOrNode, source, options).source;
}

export function expandSourceWithDiagnostics(treeOrNode, source, options = {}) {
    const { mode, recover } = normalizeExpandOptions(options);
    const root = rootNode(treeOrNode);
    const shouldExpand = containsModuleFeature(root);
    if (!shouldExpand) return createExpandResult({ mode, source, changed: false });
    try {
        const expandedSource = new ModuleExpander(root, source).expand();
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

function normalizeExpandOptions(options = {}) {
    const mode = options.mode ?? DEFAULT_EXPAND_MODE;
    if (!isExpandMode(mode)) {
        throw new Error(`Unknown expand mode "${mode}"`);
    }
    return {
        mode,
        recover: options.recover ?? isTolerantExpandMode(mode),
    };
}

function createExpandResult({
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

function createExpandDiagnostic(error) {
    return {
        message: error?.message || String(error),
        severity: "error",
        source: "utu",
        phase: "expand",
    };
}
