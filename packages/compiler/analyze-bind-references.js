import { runAnalyzeIndexSymbolsAndDeclarations } from "./analyze-index-symbols-and-declarations.js";

export function runAnalyzeBindReferences(context) {
    const analyses = context?.analyses ?? {};
    const index = analyses["index-top-level-symbols"] ?? runAnalyzeIndexSymbolsAndDeclarations(context);
    const duplicates = new Map();
    for (const symbol of index.symbols) {
        const count = duplicates.get(symbol.name) ?? 0;
        duplicates.set(symbol.name, count + 1);
    }
    const diagnostics = [];
    for (const [name, count] of duplicates) {
        if (count > 1) {
            diagnostics.push({
                severity: "warning",
                source: "utu",
                phase: "bind-top-level-symbols",
                message: `Duplicate top-level declaration "${name}" (${count} declarations).`,
            });
        }
    }
    return {
        symbolBindings: index.symbolsByName,
        duplicates,
        diagnostics,
    };
}
