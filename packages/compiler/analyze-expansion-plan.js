import { namedChildren, rootNode } from "./stage-tree.js";

const EXPANSION_TRIGGER_NODE_TYPES = new Set([
    "file_import_decl",
    "module_decl",
    "construct_decl",
    "proto_decl",
    "associated_fn_name",
    "qualified_type_ref",
    "type_member_expr",
]);

export const EXPANSION_MODES = Object.freeze({
    EDITOR: "editor",
    VALIDATION: "validation",
    COMPILE: "compile",
});

const DEFAULT_EXPANSION_MODE = EXPANSION_MODES.COMPILE;
const EXPANSION_COMPILE_MODE_ALIASES = new Set(["normal", "program", "test", "bench"]);

export function needsExpansion(treeOrNode) {
    const node = rootNode(treeOrNode);
    if (!node) return false;
    if (EXPANSION_TRIGGER_NODE_TYPES.has(node.type)) return true;
    if (node.type === "call_expr") {
        const callee = namedChildren(node)[0];
        if (callee?.type === "field_expr" || callee?.type === "type_member_expr") return true;
    }
    return (node.children ?? []).some((child) => needsExpansion(child));
}

export function resolveExpansionMode(options = {}) {
    if (options.mode) {
        return EXPANSION_COMPILE_MODE_ALIASES.has(options.mode)
            ? EXPANSION_MODES.COMPILE
            : options.mode;
    }
    if (options.intent === "compile") return EXPANSION_MODES.COMPILE;
    return EXPANSION_MODES.VALIDATION;
}

export function isExpansionMode(value) {
    return value === EXPANSION_MODES.EDITOR
        || value === EXPANSION_MODES.VALIDATION
        || value === EXPANSION_MODES.COMPILE;
}

export function isTolerantExpansionMode(mode) {
    return mode === EXPANSION_MODES.EDITOR || mode === EXPANSION_MODES.VALIDATION;
}

export function normalizeExpansionOptions(options = {}) {
    const mode = resolveExpansionMode(options) ?? DEFAULT_EXPANSION_MODE;
    if (!isExpansionMode(mode)) {
        throw new Error(`Unknown expand mode "${mode}"`);
    }
    return {
        mode,
        recover: options.recover ?? isTolerantExpansionMode(mode),
    };
}

export async function runPlanExpansion(context) {
    const options = normalizeExpansionOptions(context.options ?? {});
    const parseRoot = context.tree ?? context.legacyTree?.rootNode ?? context.artifacts.parse?.legacyTree?.rootNode ?? null;
    const hasModuleFeatures = needsExpansion(parseRoot);
    return {
        ...options,
        hasModuleFeatures,
        shouldExpand: hasModuleFeatures,
    };
}
