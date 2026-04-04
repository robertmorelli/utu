// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over a2.1 and a2.2.
// It MUST split into a new explicit compiler stage instead of layering more analysis in this file.

// a2.3 Resolve Imports:
// resolve symbolic imports to concrete files/modules and validate reachability.
export async function runA23ResolveImports(context) {
    const header = context.analyses["a2.1"]?.header ?? {};
    const graph = context.analyses["a2.2"] ?? {};
    const uri = context.uri ?? "memory://utu";
    const loadImport = context.loadImport ?? null;

    const fileImports = header.fileImports ?? [];
    const resolvedFileImports = [];
    const diagnostics = [];

    for (const fileImport of fileImports) {
        const entry = {
            sourceModuleName: fileImport.sourceModuleName ?? null,
            localName: fileImport.localName ?? null,
            specifier: fileImport.specifier ?? null,
            uri: null,
            resolved: false,
        };
        if (typeof loadImport !== "function" || !entry.specifier) {
            resolvedFileImports.push(entry);
            continue;
        }
        try {
            const loaded = await loadImport(uri, entry.specifier);
            entry.uri = loaded?.uri ?? null;
            entry.resolved = Boolean(loaded?.source || loaded?.root);
            if (!entry.resolved) {
                diagnostics.push({
                    severity: "warning",
                    source: "utu",
                    phase: "a2.3",
                    message: `Import "${entry.specifier}" did not return source/root from loader.`,
                });
            }
        } catch (error) {
            diagnostics.push({
                severity: "error",
                source: "utu",
                phase: "a2.3",
                message: `Failed to resolve import "${entry.specifier}": ${error?.message ?? String(error)}`,
            });
        }
        resolvedFileImports.push(entry);
    }

    return {
        hasLoader: typeof loadImport === "function",
        resolvedFileImports,
        unresolvedGraphTargets: graph.unresolvedTargets ?? [],
        diagnostics,
    };
}
