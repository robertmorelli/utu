import { runStage2CommentStripRewrite } from "./e2_6.js";

// e2.7 Post-Expand Normalize:
// enforce one stable post-expansion tree shape for later semantic stages.
export async function runE27PostExpandNormalize(context) {
    return runStage2CommentStripRewrite("e2.7", context);
}
