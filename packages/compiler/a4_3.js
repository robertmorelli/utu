import { runEmptyAnalysisPass, runTreeWalkAnalysisPass } from "./a1_1.js";
import { rootNode } from "./a1_4.js";

// TODO(architecture): SCARY: this analysis pass stacks a4.1/a3.3 facts and then performs another tree walk.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

// a4.3 Prepare Backend Metadata Defaults:
// normalize semantic metadata defaults for backend artifacts consumed by later stages.
export async function runA43PrepareBackendMetadataDefaults(context) {
    runEmptyAnalysisPass("a4.3", context);
    const a41 = context.analyses["a4.1"] ?? {};
    const semantic = context.analyses["a3.3"] ?? {};
    const legacyRoot = rootNode(context.legacyTree ?? context.artifacts.parse?.legacyTree ?? null);
    const treeFacts = collectLegacyTreeFacts(legacyRoot);
    const mode = normalizeMode(a41.backendOptions?.mode ?? context.options?.mode ?? "program");

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
