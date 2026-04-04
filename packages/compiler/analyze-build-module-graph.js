import { namedChildren } from "./header-snapshot.js";

// TODO(architecture): SCARY: this analysis pass depends on a2.1 and then performs another tree walk itself.
// It MUST split into a new explicit compiler stage until this file owns at most one tree walk.

// a2.2 Build Module Graph:
// connect discovered declarations into a symbolic module/import dependency graph.
export async function runA22BuildModuleGraph(context) {
    const discovered = context.analyses["a2.1"]?.header ?? null;
    const modules = (discovered?.modules ?? []).map(({ name }) => name);
    const moduleSet = new Set(modules);
    const edges = [];
    const root = context.tree ?? context.legacyTree?.rootNode ?? context.artifacts.parse?.legacyTree?.rootNode ?? null;

    if (root) {
        walk(root, (node) => {
            if (node.type !== "file_import_decl") return;
            const [importedModuleName, capturedModuleName, specifierNode] = namedChildren(node);
            const from = capturedModuleName?.text ?? importedModuleName?.text ?? null;
            const to = importedModuleName?.text ?? null;
            const specifier = specifierNode?.text?.startsWith('"')
                ? specifierNode.text.slice(1, -1)
                : null;
            if (!from || !to) return;
            edges.push({
                kind: "file_import",
                from,
                to,
                specifier,
                knownTarget: moduleSet.has(to),
            });
        });
    }

    for (const construct of discovered?.constructs ?? []) {
        const from = construct.alias ?? "<open>";
        const to = construct.target ?? null;
        if (!to) continue;
        edges.push({
            kind: "construct",
            from,
            to,
            knownTarget: moduleSet.has(to),
        });
    }

    return {
        modules,
        edges,
        unresolvedTargets: [...new Set(edges.filter((edge) => !edge.knownTarget).map((edge) => edge.to))],
    };
}

function walk(node, visit) {
    visit(node);
    for (const child of node.children ?? []) {
        walk(child, visit);
    }
}
