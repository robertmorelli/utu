export const DOCUMENT_INDEX_ANALYSIS_STAGES = Object.freeze({
    COLLECT_DECLARATIONS: "a.index.collect-declarations",
    WALK_SEMANTICS: "a.index.walk-semantics",
});

export function runDocumentIndexCollectionStage(rootNode, collectTopLevelDeclarations, registerTaggedTypeProtocolAssocKeys) {
    for (const item of rootNode?.namedChildren ?? [])
        collectTopLevelDeclarations(item);
    registerTaggedTypeProtocolAssocKeys();
}

export function runDocumentIndexSemanticStage(rootNode, walkTopLevelItem) {
    for (const item of rootNode?.namedChildren ?? [])
        walkTopLevelItem(item);
}
