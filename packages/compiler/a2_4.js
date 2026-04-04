// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over a2.1 and a2.3.
// It MUST split into a new explicit compiler stage instead of layering more analysis in this file.

// a2.4 Construct Namespaces:
// build namespace/template facts used by declaration and expression expansion.
export async function runA24ConstructNamespaces(context) {
    const header = context.analyses["a2.1"]?.header ?? {};
    const resolved = context.analyses["a2.3"] ?? {};
    const modules = header.modules ?? [];
    const constructs = header.constructs ?? [];
    const fileImports = header.fileImports ?? [];

    const aliases = new Map();
    for (const construct of constructs) {
        if (construct.alias && construct.target) aliases.set(construct.alias, construct.target);
    }
    for (const fileImport of fileImports) {
        if (fileImport.localName && fileImport.sourceModuleName) {
            aliases.set(fileImport.localName, fileImport.sourceModuleName);
        }
    }

    return {
        modules: modules.map(({ name }) => name),
        aliases: Object.fromEntries(aliases),
        unresolvedImports: (resolved.resolvedFileImports ?? [])
            .filter((entry) => !entry.resolved)
            .map((entry) => entry.specifier)
            .filter(Boolean),
    };
}
