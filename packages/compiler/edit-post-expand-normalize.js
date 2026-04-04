import { runExpansionCommentStripRewrite } from "./expansion-rewrite-pass.js";

// enforce one stable post-expansion tree shape for later semantic stages.
export async function runNormalizePostExpansion(context) {
    return runExpansionCommentStripRewrite("normalize-post-expansion", context);
}
