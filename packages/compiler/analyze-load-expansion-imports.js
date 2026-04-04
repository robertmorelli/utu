import { parseTree } from "../document/tree-sitter.js";
import { ensureStage2Imports } from "./expansion-session.js";

function collectModuleTemplateSummary(expander) {
    return [...(expander?.moduleTemplates?.values?.() ?? [])]
        .map((template) => ({
            name: template.name,
            typeParams: [...template.typeParams],
            itemCount: template.items.length,
            bindingNames: [...(template.moduleBindings?.keys?.() ?? [])].sort(),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

async function snapshotLoadedFiles(expansionState) {
    const loadedFiles = [];
    for (const [cacheKey, descriptorPromise] of expansionState?.expander?.loadedFiles ?? []) {
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

export async function runA214LoadExpansionImports(context) {
    const expansionState = context.artifacts.stage2Expansion ?? null;
    if (expansionState && !expansionState.parseSource) {
        expansionState.parseSource = async (sourceText) => {
            const parsed = parseTree(
                context.parser,
                sourceText,
                "Tree-sitter returned no syntax tree for the rewritten document.",
            );
            return {
                root: parsed.tree.rootNode,
                dispose: parsed.dispose,
            };
        };
    }
    if (!expansionState?.shouldExpand) {
        return {
            loadedFileCount: 0,
            importedModuleCount: 0,
            loadedFiles: [],
            moduleBindings: [],
            parseCache: [],
        };
    }
    await ensureStage2Imports(expansionState);
    return {
        loadedFileCount: expansionState.expander.loadedFiles.size,
        importedModuleCount: expansionState.expander.moduleTemplates.size,
        loadedFiles: await snapshotLoadedFiles(expansionState),
        moduleBindings: collectModuleTemplateSummary(expansionState.expander),
        parseCache: [...expansionState.expander.loadedFiles.keys()].sort(),
    };
}
