import {
    runStage2ExpansionStep,
    summarizeStage2ExpansionState,
} from "./stage2-expansion-state.js";

async function snapshotStage2LoadedFiles(expansion) {
    const loadedFiles = [];
    for (const [cacheKey, descriptorPromise] of expansion?.expander?.loadedFiles ?? []) {
        let descriptor = null;
        try {
            descriptor = await descriptorPromise;
        } catch (error) {
            loadedFiles.push({
                cacheKey,
                uri: null,
                moduleNames: [],
                error: error?.message || String(error),
            });
            continue;
        }
        loadedFiles.push({
            cacheKey,
            uri: descriptor?.uri ?? null,
            moduleNames: [...(descriptor?.templatesByName?.keys?.() ?? [])].sort(),
        });
    }
    return loadedFiles;
}

export function collectStage2ModuleTemplateSummary(expander) {
    return [...expander.moduleTemplates.values()]
        .map((template) => ({
            name: template.name,
            typeParams: [...template.typeParams],
            itemCount: template.items.length,
            bindingNames: [...(template.moduleBindings?.keys?.() ?? [])].sort(),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

export async function loadStage2ExpansionImports(expansion) {
    await runStage2ExpansionStep(expansion, async (expander) => {
        await expander.loadRootFileImports();
    });
    return {
        ...summarizeStage2ExpansionState(expansion),
        loadedFiles: await snapshotStage2LoadedFiles(expansion),
        moduleBindings: expansion?.expander ? collectStage2ModuleTemplateSummary(expansion.expander) : [],
        parseCache: expansion?.expander ? [...expansion.expander.loadedFiles.keys()].sort() : [],
    };
}
