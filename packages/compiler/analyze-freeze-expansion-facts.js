// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over
// multiple expansion facts.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

// publish one immutable expansion artifact consumed by downstream stages and tooling.
export async function runFreezeExpansionFacts(context) {
    const expansion = context.artifacts.expansion ?? null;
    const treeIndex = context.analyses["index-expanded-tree"] ?? null;
    const declarationIndex = context.analyses["index-expanded-declarations"] ?? null;
    const collisions = context.analyses["detect-expanded-collisions"] ?? null;
    const rewritePlan = context.analyses["plan-expansion-rewrites"] ?? null;
    const boundary = context.analyses["validate-expansion-boundary"] ?? null;

    const facts = Object.freeze({
        changed: Boolean(expansion?.changed),
        recovered: Boolean(expansion?.recovered),
        residualModuleSyntaxCount: treeIndex?.residualModuleSyntaxCount ?? 0,
        declarationCount: declarationIndex?.declarationCount ?? 0,
        duplicateDeclarationCount: (collisions?.duplicateDeclarations ?? []).length,
        kindCollisionCount: (collisions?.kindCollisions ?? []).length,
        activeRewritePasses: (rewritePlan?.rewritePlan ?? [])
            .filter((entry) => entry.active)
            .map((entry) => entry.pass),
        diagnosticsCount: (boundary?.diagnostics ?? []).length,
    });

    return {
        facts,
    };
}
