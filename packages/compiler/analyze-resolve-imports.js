export async function runA23ResolveImports(context) {
    const header = context.analyses["discover-expansion-declarations"]?.header ?? {};
    const graph = context.analyses["build-module-graph"] ?? {};
    const uri = context.uri ?? "memory://utu";
    const loadImport = context.loadImport ?? null;
    const resolvedFileImports = [];
    const diagnostics = [];

    for (const fileImport of header.fileImports ?? []) {
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
