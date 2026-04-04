// TODO(architecture): SCARY: this analysis pass is analysis-on-analysis over multiple Stage-2 facts.
// It MUST split into a new explicit compiler stage instead of stacking more analysis in this file.

// a2.12 Freeze Expansion Facts:
// publish one immutable Stage-2 artifact consumed by downstream stages and tooling.
export async function runA212FreezeExpansionFacts(context) {
    const expansion = context.artifacts.expansion ?? null;
    const treeIndex = context.analyses["a2.7"] ?? null;
    const declarationIndex = context.analyses["a2.8"] ?? null;
    const collisions = context.analyses["a2.9"] ?? null;
    const rewritePlan = context.analyses["a2.10"] ?? null;
    const boundary = context.analyses["a2.11"] ?? null;

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
