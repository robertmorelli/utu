import { namedChildren, rootNode } from "./stage-tree.js";

const STAGE2_MODULE_FEATURE_NODES = new Set([
    "file_import_decl",
    "module_decl",
    "construct_decl",
    "proto_decl",
    "associated_fn_name",
    "qualified_type_ref",
    "type_member_expr",
]);

export const STAGE2_EXPAND_MODES = Object.freeze({
    EDITOR: "editor",
    VALIDATION: "validation",
    COMPILE: "compile",
});

const DEFAULT_STAGE2_EXPAND_MODE = STAGE2_EXPAND_MODES.COMPILE;
const STAGE2_COMPILE_MODE_ALIASES = new Set(["normal", "program", "test", "bench"]);

export function needsStage2Expansion(treeOrNode) {
    const node = rootNode(treeOrNode);
    if (!node) return false;
    if (STAGE2_MODULE_FEATURE_NODES.has(node.type)) return true;
    if (node.type === "call_expr") {
        const callee = namedChildren(node)[0];
        if (callee?.type === "field_expr" || callee?.type === "type_member_expr") return true;
    }
    return (node.children ?? []).some((child) => needsStage2Expansion(child));
}

export function resolveStage2ExpandMode(options = {}) {
    if (options.mode) {
        return STAGE2_COMPILE_MODE_ALIASES.has(options.mode)
            ? STAGE2_EXPAND_MODES.COMPILE
            : options.mode;
    }
    if (options.intent === "compile") return STAGE2_EXPAND_MODES.COMPILE;
    return STAGE2_EXPAND_MODES.VALIDATION;
}

export function isStage2ExpandMode(value) {
    return value === STAGE2_EXPAND_MODES.EDITOR
        || value === STAGE2_EXPAND_MODES.VALIDATION
        || value === STAGE2_EXPAND_MODES.COMPILE;
}

export function isTolerantStage2ExpandMode(mode) {
    return mode === STAGE2_EXPAND_MODES.EDITOR || mode === STAGE2_EXPAND_MODES.VALIDATION;
}

export function normalizeStage2ExpandOptions(options = {}) {
    const mode = resolveStage2ExpandMode(options) ?? DEFAULT_STAGE2_EXPAND_MODE;
    if (!isStage2ExpandMode(mode)) {
        throw new Error(`Unknown expand mode "${mode}"`);
    }
    return {
        mode,
        recover: options.recover ?? isTolerantStage2ExpandMode(mode),
    };
}

export async function runA25PlanDeclarationExpansion(context) {
    const options = normalizeStage2ExpandOptions(context.options ?? {});
    const parseRoot = context.tree ?? context.legacyTree?.rootNode ?? context.artifacts.parse?.legacyTree?.rootNode ?? null;
    const hasModuleFeatures = needsStage2Expansion(parseRoot);
    return {
        ...options,
        hasModuleFeatures,
        shouldExpand: hasModuleFeatures,
    };
}
