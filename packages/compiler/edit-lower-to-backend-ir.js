// TODO(detangle): lower-to-backend-ir shares stage-tree rewrite helpers with
// build-binaryen-module, build-backend-artifacts, and emit-output.
// Split stage-owned rewrite helpers before inlining this stage-local implementation.
import { runTreeWalkRewritePass } from "./rewrite-pass.js";

// reserve a dedicated lowering rewrite slot for backend-targeted transforms.
export async function runLowerToBackendIr(context) {
    return runTreeWalkRewritePass("lower-to-backend-ir", context, (node) => node);
}
