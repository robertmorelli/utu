import { ensureStage2TopLevelDeclarations } from "./expansion-state.js";

export async function collectStage2TopLevelDeclarations(expansionState) {
    if (!expansionState?.shouldExpand) {
        return {
            moduleNames: [],
            typeNames: [],
            valueNames: [],
            protocolNames: [],
        };
    }
    await ensureStage2TopLevelDeclarations(expansionState);
    return expansionState.topLevelDeclarations;
}
