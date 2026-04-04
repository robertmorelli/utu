// TODO(architecture): SCARY: this analysis pass is aggregating a2.5/a2.7/a2.9 instead of owning one walk.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

// a2.11 Validate Expansion Boundary:
// ensure post-expansion tree shape is suitable for stage 3 and aggregate stage-2 diagnostics.
export async function runA211ValidateExpansionBoundary(context) {
    const plan = context.analyses["a2.5"] ?? {};
    const treeIndex = context.analyses["a2.7"] ?? {};
    const collisions = context.analyses["a2.9"] ?? {};
    const expansion = context.artifacts.expansion ?? null;
    const recovered = Boolean(expansion?.recovered);
    const shouldCanonicalize = Boolean(plan.shouldExpand) && !recovered;
    const diagnostics = [
        ...(expansion?.diagnostics ?? []),
        ...(collisions.diagnostics ?? []),
    ];

    if (shouldCanonicalize && treeIndex.hasResidualModuleSyntax) {
        diagnostics.push({
            severity: "error",
            source: "utu",
            phase: "a2.11",
            message: "Stage 2 expansion left module/construct/file-import declarations in the expanded tree.",
        });
    }

    return {
        shouldCanonicalize,
        recovered,
        diagnostics,
        residualModuleSyntaxCount: treeIndex.residualModuleSyntaxCount ?? 0,
    };
}
