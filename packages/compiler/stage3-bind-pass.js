import { runStage3IndexPass } from "./stage3-index-pass.js";

// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over a3.1.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

export function runStage3BindPass(context) {
    const analyses = context?.analyses ?? {};
    const index = analyses["a3.1"] ?? runStage3IndexPass(context);
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
                phase: "a3.2",
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

// a3.2 Bind:
// resolve names, members, and declaration references against indexed symbols.
export async function runA32Bind(context) {
    return runStage3BindPass(context);
}
