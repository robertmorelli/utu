import { prepareStage2DeclarationExpansion } from "./stage2-prepare-expansion.js";

// a2.6 Prepare Declaration Expansion:
// normalize expansion execution settings before the Stage-2 state machine is created.
export async function runA26PrepareDeclarationExpansion(context) {
    return prepareStage2DeclarationExpansion(context);
}
