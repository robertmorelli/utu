import { kids } from "../stage2-expansion-shared.js";
import {
    runStage2ExpansionStep,
    summarizeStage2ExpansionState,
} from "./expansion-state.js";
import {
    captureNamespaceSourceContext,
    resolveConstructNamespace,
} from "./namespaces.js";

function collectProtocolDispatchTableSummary(expander) {
    return [...expander.topLevelProtocolImplsByKey.values()]
        .map((entry) => ({
            protocol: entry.protocol,
            member: entry.member,
            selfType: entry.selfType,
            callee: expander.mangleProtocolDispatch(entry.protocol, entry.member, entry.selfType),
        }))
        .sort((left, right) => `${left.protocol}.${left.member}:${left.selfType}`.localeCompare(`${right.protocol}.${right.member}:${right.selfType}`));
}

export function collectSymbolFactsFromExpander(expander) {
    const ctx = expander.createRootContext();
    const items = expander.flattenLibraryItems(kids(expander.root));

    expander.collectSymbols(items, ctx, {
        onConstruct: (item) => {
            const namespace = resolveConstructNamespace(expander, item, ctx);
            captureNamespaceSourceContext(expander, namespace, ctx);
            expander.applyConstruct(item, ctx);
        },
        onType: (name) => expander.topLevelTypeNames.add(name),
        onValue: (name, type) => {
            expander.topLevelValueNames.add(name);
            expander.topLevelValueTypes.set(name, type);
        },
        onFunction: (name, returnInfo) => {
            expander.topLevelValueNames.add(name);
            expander.topLevelFnReturns.set(name, returnInfo);
        },
        onAssoc: (owner, member, returnInfo) => {
            const key = `${owner}.${member}`;
            expander.topLevelAssocNames.set(key, expander.mangleTopLevelAssoc(owner, member));
            expander.topLevelAssocReturns.set(key, returnInfo);
        },
        onProtocolImpl: (protocol, member, node, returnInfo) => {
            expander.collectTopLevelProtocolImpl(protocol, member, node, ctx, returnInfo);
        },
    });
}

export async function collectStage2SymbolFacts(expansion) {
    await runStage2ExpansionStep(expansion, (expander) => {
        collectSymbolFactsFromExpander(expander);
    });

    const expander = expansion?.expander;
    return {
        ...summarizeStage2ExpansionState(expansion),
        valueTypes: expander ? Object.fromEntries(
            [...expander.topLevelValueTypes.entries()].map(([name, info]) => [name, info?.text ?? null]),
        ) : {},
        fnReturns: expander ? Object.fromEntries(
            [...expander.topLevelFnReturns.entries()].map(([name, info]) => [name, info?.text ?? null]),
        ) : {},
        assocReturns: expander ? Object.fromEntries(
            [...expander.topLevelAssocReturns.entries()].map(([name, info]) => [name, info?.text ?? null]),
        ) : {},
        protocolDispatchTables: expander ? collectProtocolDispatchTableSummary(expander) : [],
    };
}
