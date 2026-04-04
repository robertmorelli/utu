import {
    containsModuleFeature,
    rootNode,
} from "./stage2-shared.js";

export const EXPAND_MODES = Object.freeze({
    EDITOR: "editor",
    VALIDATION: "validation",
    COMPILE: "compile",
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

export function isTolerantExpandMode(mode) {
    return mode === EXPAND_MODES.EDITOR || mode === EXPAND_MODES.VALIDATION;
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

export async function prepareStage2DeclarationExpansion(context) {
    const expansionPlan = context.analyses["a2.5"] ?? null;
    const treeOrNode = context.artifacts.parse?.legacyTree ?? context.legacyTree ?? context.tree ?? null;
    const options = normalizeExpandOptions(expansionPlan ?? context.options ?? {});
    const hasModuleFeatures = needsExpansion(treeOrNode);
    return {
        ...options,
        hasModuleFeatures,
        shouldExpand: hasModuleFeatures,
    };
}
