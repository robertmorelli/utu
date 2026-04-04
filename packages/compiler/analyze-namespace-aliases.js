export async function runBuildNamespaceAliases(context) {
    const header = context.analyses["discover-expansion-declarations"]?.header ?? {};
    const resolved = context.analyses["resolve-imports"] ?? {};
    const aliases = new Map();

    for (const construct of header.constructs ?? []) {
        if (construct.alias && construct.target) aliases.set(construct.alias, construct.target);
    }
    for (const fileImport of header.fileImports ?? []) {
        if (fileImport.localName && fileImport.sourceModuleName) {
            aliases.set(fileImport.localName, fileImport.sourceModuleName);
        }
    }

    return {
        modules: (header.modules ?? []).map(({ name }) => name),
        aliases: Object.fromEntries(aliases),
        unresolvedImports: (resolved.resolvedFileImports ?? [])
            .filter((entry) => !entry.resolved)
            .map((entry) => entry.specifier)
            .filter(Boolean),
    };
}
