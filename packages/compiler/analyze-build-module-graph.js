import { childOfType, namedChildren, walk } from "./stage-tree.js";

function collectNamespaceReference(node) {
    if (!node) return null;
    if (node.type === "module_ref") return collectNamespaceReference(namedChildren(node)[0] ?? node);
    if (node.type === "qualified_type_ref" || node.type === "inline_module_type_path") {
        return collectNamespaceReference(namedChildren(node)[0] ?? node);
    }
    if (node.type === "instantiated_module_ref") return collectNamespaceReference(namedChildren(node)[0] ?? node);
    return node.text ?? null;
}

function collectFileImportDeclaration(item) {
    const sourceNode = childOfType(item, "imported_module_name");
    const captureNode = childOfType(item, "captured_module_name");
    const specifierNode = childOfType(item, "string_lit");
    const sourceModuleName = collectNamespaceReference(childOfType(sourceNode, "module_name") ?? sourceNode);
    const capturedModuleName = collectNamespaceReference(childOfType(captureNode, "module_name") ?? captureNode);
    if (!sourceModuleName || !specifierNode) return null;
    return {
        sourceModuleName,
        localName: capturedModuleName ?? sourceModuleName,
        specifier: specifierNode.text.slice(1, -1),
    };
}

export async function runBuildModuleGraph(context) {
    const discovered = context.analyses["discover-expansion-declarations"]?.header ?? null;
    const modules = (discovered?.modules ?? []).map(({ name }) => name);
    const moduleSet = new Set(modules);
    const edges = [];
    const root = context.tree ?? context.legacyTree?.rootNode ?? context.artifacts.parse?.legacyTree?.rootNode ?? null;

    walk(root, (node) => {
        if (node.type !== "file_import_decl") return;
        const fileImport = collectFileImportDeclaration(node);
        if (!fileImport?.sourceModuleName || !fileImport.localName) return;
        edges.push({
            kind: "file_import",
            from: fileImport.localName,
            to: fileImport.sourceModuleName,
            specifier: fileImport.specifier ?? null,
            knownTarget: moduleSet.has(fileImport.sourceModuleName),
        });
    });

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
