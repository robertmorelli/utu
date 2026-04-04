import { ensureStage2Imports } from "./expansion-state.js";

export async function loadStage2ExpansionImports(expansionState) {
    if (!expansionState?.shouldExpand) {
        return {
            loadedFileCount: 0,
            importedModuleCount: 0,
        };
    }
    await ensureStage2Imports(expansionState);
    return {
        loadedFileCount: expansionState.expander.loadedFiles.size,
        importedModuleCount: expansionState.expander.moduleTemplates.size,
    };
}
