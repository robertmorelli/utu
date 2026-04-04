import { ensureStage2TopLevelDeclarations } from "./expansion-state.js";

function mapEntries(map) {
    return [...map.entries()].map(([name, value]) => ({ name, value }));
}

export async function collectStage2SymbolFacts(expansionState) {
    if (!expansionState?.shouldExpand) {
        return {
            valueTypes: [],
            functionReturns: [],
            associatedReturns: [],
            protocolMembers: [],
        };
    }
    await ensureStage2TopLevelDeclarations(expansionState);
    const facts = {
        valueTypes: mapEntries(expansionState.expander.topLevelValueTypes),
        functionReturns: mapEntries(expansionState.expander.topLevelFnReturns),
        associatedReturns: mapEntries(expansionState.expander.topLevelAssocReturns),
        protocolMembers: mapEntries(expansionState.expander.topLevelProtocolMembers),
    };
    expansionState.symbolFacts = facts;
    return facts;
}
