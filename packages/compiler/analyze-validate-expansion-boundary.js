// TODO(architecture): SCARY: this analysis pass is aggregating plan-expansion,
// index-expanded-tree, and detect-expanded-collisions instead of owning one walk.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

// ensure post-expansion tree shape is suitable for the semantic stages and
// aggregate expansion diagnostics.
export async function runValidateExpansionBoundary(context) {
    const plan = context.analyses["plan-expansion"] ?? {};
    const treeIndex = context.analyses["index-expanded-tree"] ?? {};
    const collisions = context.analyses["detect-expanded-collisions"] ?? {};
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
            phase: "validate-expansion-boundary",
            message: "Expansion cleanup left module, construct, or file-import declarations in the expanded tree.",
        });
    }

    return {
        shouldCanonicalize,
        recovered,
        diagnostics,
        residualModuleSyntaxCount: treeIndex.residualModuleSyntaxCount ?? 0,
    };
}
