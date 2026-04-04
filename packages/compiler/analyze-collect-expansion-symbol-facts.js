import { readCompilerArtifact } from "./compiler-stage-runtime.js";
import { ensureExpansionTopLevelDeclarations } from "./expansion-session.js";

function mapEntries(map) {
    return [...map.entries()].map(([name, value]) => ({ name, value }));
}

function collectProtocolDispatchTableSummary(expander) {
    return [...(expander?.topLevelProtocolImplsByKey?.values?.() ?? [])]
        .map((entry) => ({
            protocol: entry.protocol,
            member: entry.member,
            selfType: entry.selfType,
            callee: expander.mangleProtocolDispatch(entry.protocol, entry.member, entry.selfType),
        }))
        .sort((left, right) => `${left.protocol}.${left.member}:${left.selfType}`.localeCompare(`${right.protocol}.${right.member}:${right.selfType}`));
}

export async function runCollectExpansionSymbolFacts(context) {
    const expansionState = readCompilerArtifact(context, "expansionSession");
    if (!expansionState?.shouldExpand) {
        return {
            valueTypes: {},
            functionReturns: [],
            associatedReturns: [],
            protocolMembers: [],
            fnReturns: {},
            assocReturns: {},
            protocolDispatchTables: [],
        };
    }
    await ensureExpansionTopLevelDeclarations(expansionState);
    const expander = expansionState.expander;
    const facts = {
        valueTypes: mapEntries(expander.topLevelValueTypes),
        functionReturns: mapEntries(expander.topLevelFnReturns),
        associatedReturns: mapEntries(expander.topLevelAssocReturns),
        protocolMembers: mapEntries(expander.topLevelProtocolMembers),
    };
    expansionState.symbolFacts = facts;
    return {
        ...facts,
        valueTypes: Object.fromEntries(
            [...expander.topLevelValueTypes.entries()].map(([name, info]) => [name, info?.text ?? null]),
        ),
        fnReturns: Object.fromEntries(
            [...expander.topLevelFnReturns.entries()].map(([name, info]) => [name, info?.text ?? null]),
        ),
        assocReturns: Object.fromEntries(
            [...expander.topLevelAssocReturns.entries()].map(([name, info]) => [name, info?.text ?? null]),
        ),
        protocolDispatchTables: collectProtocolDispatchTableSummary(expander),
    };
}
