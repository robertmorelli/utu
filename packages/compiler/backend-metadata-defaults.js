import { runTreeWalkAnalysisPass } from "./analysis-pass-utils.js";
import { rootNode } from "./stage-tree.js";

// TODO(architecture): SCARY: this analysis pass stacks a4.1/a3.3 facts and then performs another tree walk.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

export function createBackendMetadataDefaults({
    loweringMetadata = {},
    semantic = {},
    treeOrNode = null,
    options = {},
} = {}) {
    const mode = normalizeMode(loweringMetadata.backendOptions?.mode ?? options.mode ?? "program");
    const treeFacts = collectLegacyTreeFacts(rootNode(treeOrNode));
    return {
        mode,
        metadataDefaults: {
            sourceKind: semantic.sourceKind ?? treeFacts.sourceKind ?? (mode === "program" ? "program" : undefined),
            hasMain: semantic.hasMain ?? treeFacts.hasMain,
            hasLibrary: semantic.hasLibrary ?? treeFacts.hasLibrary,
            exports: normalizeExports(semantic.exports ?? []),
            tests: normalizeRunnableEntries(semantic.tests ?? [], "__utu_test_"),
            benches: normalizeRunnableEntries(semantic.benches ?? [], "__utu_bench_"),
        },
    };
}

export function normalizeMode(mode) {
    if (!mode || mode === "normal") return "program";
    return mode;
}

export function normalizeExports(entries = []) {
    return entries
        .map((entry) => {
            if (typeof entry === "string") {
                return { name: entry, exportName: entry };
            }
            const name = entry?.name ?? entry?.exportName ?? null;
            const exportName = entry?.exportName ?? name;
            return name && exportName ? { name, exportName } : null;
        })
        .filter(Boolean);
}

export function normalizeRunnableEntries(entries = [], prefix) {
    return entries
        .map((entry, index) => {
            if (typeof entry === "string") {
                return { name: entry, exportName: `${prefix}${index}` };
            }
            const name = entry?.name ?? null;
            const exportName = entry?.exportName ?? (name ? `${prefix}${index}` : null);
            return name && exportName ? { name, exportName } : null;
        })
        .filter(Boolean);
}

export function mergeBackendMetadata(defaults = {}, artifactMetadata = {}) {
    const base = artifactMetadata && typeof artifactMetadata === "object" ? artifactMetadata : {};
    return {
        ...base,
        sourceKind: base.sourceKind ?? defaults.sourceKind,
        hasMain: base.hasMain ?? defaults.hasMain ?? false,
        hasLibrary: base.hasLibrary ?? defaults.hasLibrary ?? false,
        exports: normalizeExports(base.exports ?? defaults.exports ?? []),
        tests: normalizeRunnableEntries(base.tests ?? defaults.tests ?? [], "__utu_test_"),
        benches: normalizeRunnableEntries(base.benches ?? defaults.benches ?? [], "__utu_bench_"),
    };
}

function collectLegacyTreeFacts(root) {
    if (!root) {
        return {
            sourceKind: null,
            hasMain: false,
            hasLibrary: false,
        };
    }

    return runTreeWalkAnalysisPass("a4.3", { tree: root }, {
        root,
        initialState: () => ({
            hasMain: false,
            hasLibrary: false,
        }),
        childrenOf: (node) => node?.namedChildren ?? node?.children ?? [],
        visit: (node, { state }) => {
            if (node.type === "library_decl") state.hasLibrary = true;
            if (node.type === "fn_decl") {
                const nameNode = (node.namedChildren ?? []).find((child) => child?.type === "identifier");
                if (nameNode?.text === "main") state.hasMain = true;
            }
        },
        finalize: ({ hasMain, hasLibrary }) => ({
            sourceKind: hasLibrary ? "library" : "program",
            hasMain,
            hasLibrary,
        }),
    });
}
