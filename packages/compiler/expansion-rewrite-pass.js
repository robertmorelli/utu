import { runTreeWalkRewritePass } from "./rewrite-pass.js";

function hasRecoveredExpansion(context) {
    return Boolean(context.artifacts.expansion?.recovered);
}

function getPlannedRewriteEntry(context, passName) {
    const plan = context.analyses["plan-expansion-rewrites"]?.rewritePlan;
    if (!Array.isArray(plan)) return null;
    return plan.find((entry) => entry?.pass === passName) ?? null;
}

function normalizeNodeTypes(nodeTypes) {
    return Array.isArray(nodeTypes)
        ? nodeTypes.filter((nodeType) => typeof nodeType === "string" && nodeType.length > 0)
        : [];
}

export async function runStage2IdentityRewrite(passName, context) {
    const plan = getPlannedRewriteEntry(context, passName);
    if (plan && plan.active === false) {
        return runTreeWalkRewritePass(passName, context, (node) => node);
    }
    return runTreeWalkRewritePass(passName, context, (node) => node);
}

export async function runStage2CommentStripRewrite(passName, context) {
    const plan = getPlannedRewriteEntry(context, passName);
    if (plan && plan.active === false) {
        return runTreeWalkRewritePass(passName, context, (node) => node);
    }
    return runTreeWalkRewritePass(passName, context, (node) => (node.type === "comment" ? null : node));
}

export async function runStage2DropNodeTypesRewrite(passName, context, nodeTypes, {
    skipWhenRecovered = true,
    useRewritePlan = false,
} = {}) {
    const plan = getPlannedRewriteEntry(context, passName);
    const effectiveNodeTypes = useRewritePlan
        ? normalizeNodeTypes(plan?.nodeTypes)
        : normalizeNodeTypes(nodeTypes);
    if (plan && plan.active === false) {
        return runTreeWalkRewritePass(passName, context, (node) => node);
    }
    const shouldSkip = skipWhenRecovered && hasRecoveredExpansion(context);
    const dropSet = new Set(effectiveNodeTypes);
    return runTreeWalkRewritePass(passName, context, (node) => {
        if (node.type === "comment") return null;
        if (!shouldSkip && dropSet.has(node.type)) return null;
        return node;
    });
}

// e2.6 Expand Expression Sugar:
// rewrite syntax-owned module/namespace expression sugar without semantic guessing.
export async function runE26ExpandExpressionSugar(context) {
    return runStage2IdentityRewrite("e2.6", context);
}
