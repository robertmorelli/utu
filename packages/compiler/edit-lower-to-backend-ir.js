// TODO(detangle): e4.1 shares stage-tree rewrite helpers with e4.2/e5.1/e5.2.
// Split stage-owned rewrite helpers before inlining this stage-local implementation.
import { runTreeWalkRewritePass } from "./rewrite-pass.js";

// e4.1 Lower To Backend IR:
// reserve a dedicated stage-4 rewrite slot for backend-targeted lowering.
export async function runE41LowerToBackendIr(context) {
    return runTreeWalkRewritePass("e4.1", context, (node) => node);
}
