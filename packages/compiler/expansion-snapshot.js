import { analyzeSourceLayout } from "./source-layout.js";
import {
    childOfType,
    collectNodeCounts,
    flattenTopLevelItems,
    namedChildren,
} from "./header-reference-utils.js";

const EXPANSION_SYNTAX_NODES = new Set([
    "module_decl",
    "construct_decl",
    "file_import_decl",
    "promoted_module_call_expr",
    "namespace_call_expr",
    "pipe_expr",
    "type_member_expr",
]);

const RESIDUAL_MODULE_DECLARATION_NODES = [
    "module_decl",
    "construct_decl",
    "file_import_decl",
];

const DECL_KIND_BY_NODE = {
    fn_decl: "function",
    global_decl: "global",
    jsgen_decl: "jsgen",
    struct_decl: "struct",
    type_decl: "type",
    proto_decl: "protocol",
};

function clonePassRun(passRun) {
    return passRun
        ? {
            ...passRun,
            diagnostics: [...(passRun.diagnostics ?? [])],
            stats: { ...(passRun.stats ?? {}) },
        }
        : passRun;
}

function cloneFixedPoint(fixedPoint) {
    if (!fixedPoint) return null;
    return {
        ...fixedPoint,
        diagnostics: [...(fixedPoint.diagnostics ?? [])],
        passRuns: [...(fixedPoint.passRuns ?? [])].map(clonePassRun),
    };
}

function snapshotWorklist(expansionState) {
    if (!expansionState) return null;
    return {
        iteration: expansionState.iteration ?? 0,
        maxIterations: expansionState.maxIterations ?? 0,
        changedSinceLastIteration: Boolean(expansionState.changedSinceLastIteration),
        pendingImportKeys: [...(expansionState.pendingImportKeys ?? [])].sort(),
        processedImportKeys: [...(expansionState.processedImportKeys ?? [])].sort(),
        pendingNamespaceKeys: [...(expansionState.pendingNamespaceKeys ?? [])].sort(),
        processedNamespaceKeys: [...(expansionState.processedNamespaceKeys ?? [])].sort(),
        pendingNestedNamespaceKeys: [...(expansionState.pendingNestedNamespaceKeys ?? [])].sort(),
        processedNestedNamespaceKeys: [...(expansionState.processedNestedNamespaceKeys ?? [])].sort(),
        knownRootConstructs: [...(expansionState.knownRootConstructs ?? [])].sort(),
        knownRootModuleRefs: [...(expansionState.knownRootModuleRefs ?? [])].sort(),
    };
}

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

function snapshotNamespaceSummary(namespace) {
    return {
        key: namespace.key,
        displayText: namespace.displayText,
        templateName: namespace.template?.name ?? null,
        typeNames: Object.fromEntries(namespace.typeNames),
        freeValueNames: Object.fromEntries(namespace.freeValueNames),
        assocNames: Object.fromEntries(namespace.assocNames),
        exportedTypes: [...namespace.exportedTypes],
        exportedValues: [...namespace.exportedValues],
        promotedTypeName: namespace.promotedTypeName ?? null,
        promotedType: namespace.promotedType ?? null,
    };
}

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

function emptyTopLevelFacts() {
    return {
        typeNames: [],
        protocolNames: [],
        taggedTypes: [],
        structFields: [],
    };
}

function emptySymbolFacts() {
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

export async function snapshotExpansionState(expansionState) {
    if (!expansionState?.shouldExpand) {
        return {
            shouldExpand: false,
            recovered: Boolean(expansionState?.recovered),
            diagnostics: [...(expansionState?.diagnostics ?? [])],
            fixedPoint: cloneFixedPoint(expansionState?.fixedPoint ?? null),
            worklist: snapshotWorklist(expansionState),
            imports: {
                loadedFileCount: 0,
                importedModuleCount: 0,
                loadedFiles: [],
                moduleBindings: [],
                parseCache: [],
            },
            topLevel: {
                moduleNames: [],
                typeNames: [],
                valueNames: [],
                protocolNames: [],
                moduleTemplates: [],
                topLevelFacts: emptyTopLevelFacts(),
            },
            namespaces: {
                namespaces: [],
                namespaceCache: [],
                namespaceOrder: [],
                nameMangles: [],
            },
            symbolFacts: emptySymbolFacts(),
        };
    }

    const expander = expansionState.expander;
    const namespaces = expander.namespaceOrder.map(snapshotNamespaceSummary);
    const namespaceModel = expansionState.namespaceModel ?? {
        namespaces: expander.namespaceOrder.map((namespace) => ({
            key: namespace.key,
            displayText: namespace.displayText,
            templateName: namespace.template.name,
            promotedType: namespace.promotedType ?? null,
            exportedTypes: [...namespace.exportedTypes],
            exportedValues: [...namespace.exportedValues],
        })),
    };

    return {
        shouldExpand: true,
        recovered: Boolean(expansionState.recovered),
        diagnostics: [...(expansionState.diagnostics ?? [])],
        fixedPoint: cloneFixedPoint(expansionState.fixedPoint),
        worklist: snapshotWorklist(expansionState),
        imports: {
            loadedFileCount: expander.loadedFiles.size,
            importedModuleCount: expander.moduleTemplates.size,
            loadedFiles: await snapshotLoadedFiles(expansionState),
            moduleBindings: collectModuleTemplateSummary(expander),
            parseCache: [...expander.loadedFiles.keys()].sort(),
        },
        topLevel: {
            ...(expansionState.topLevelDeclarations ?? {
                moduleNames: [...expander.moduleTemplates.keys()].sort(),
                typeNames: [...expander.topLevelTypeNames].sort(),
                valueNames: [...expander.topLevelValueNames].sort(),
                protocolNames: [...expander.topLevelProtocolNames].sort(),
            }),
            moduleTemplates: collectModuleTemplateSummary(expander),
            topLevelFacts: {
                typeNames: [...expander.topLevelTypeNames].sort(),
                protocolNames: [...expander.topLevelProtocolNames].sort(),
                taggedTypes: [...expander.topLevelTaggedTypeProtocols.entries()]
                    .map(([typeName, protocols]) => ({
                        typeName,
                        protocols: [...protocols].sort(),
                    }))
                    .sort((left, right) => left.typeName.localeCompare(right.typeName)),
                structFields: [...expander.topLevelStructFieldTypes.entries()]
                    .map(([typeName, fields]) => ({
                        typeName,
                        fields: [...fields.entries()].map(([name, info]) => ({
                            name,
                            type: info?.typeInfo?.text ?? null,
                            mut: Boolean(info?.mut),
                        })),
                    }))
                    .sort((left, right) => left.typeName.localeCompare(right.typeName)),
            },
        },
        namespaces: {
            ...namespaceModel,
            namespaceCache: namespaces,
            namespaceOrder: namespaces.map((namespace) => namespace.displayText),
            nameMangles: namespaces.map((namespace) => ({
                namespace: namespace.displayText,
                typeNames: namespace.typeNames,
                valueNames: namespace.freeValueNames,
                assocNames: namespace.assocNames,
            })),
        },
        symbolFacts: {
            ...(expansionState.symbolFacts ?? {
                valueTypes: mapEntries(expander.topLevelValueTypes),
                functionReturns: mapEntries(expander.topLevelFnReturns),
                associatedReturns: mapEntries(expander.topLevelAssocReturns),
                protocolMembers: mapEntries(expander.topLevelProtocolMembers),
            }),
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
        },
    };
}

export async function snapshotExpansionForTooling(expansionState, {
    materializedSource = expansionState?.materialized ?? null,
} = {}) {
    return {
        state: await snapshotExpansionState(expansionState),
        declarationEmission: {
            ready: Boolean(expansionState?.shouldExpand),
            recovered: Boolean(expansionState?.recovered),
            diagnostics: [...(expansionState?.diagnostics ?? [])],
        },
        emissionPreparation: expansionState?.emissionPreparation ?? null,
        typeDeclarations: expansionState?.typeDeclarations ?? {
            blocks: [],
            source: "",
        },
        functionAndRuntimeDeclarations: expansionState?.functionDeclarations ?? {
            blocks: [],
            source: "",
        },
        topLevelEmission: expansionState?.topLevelEmission ?? {
            typeBlocks: [],
            valueBlocks: [],
            otherBlocks: [],
        },
        materializedSource,
    };
}

function functionName(node) {
    const assocNode = childOfType(node, "associated_fn_name");
    if (assocNode) {
        const owner = childOfType(assocNode, "type_ident") ?? childOfType(assocNode, "identifier");
        const children = assocNode.children ?? [];
        const member = children.find((child) => child?.isNamed && child !== owner) ?? null;
        if (!owner || !member) return null;
        return `${owner.text}.${member.text}`;
    }
    return childOfType(node, "identifier")?.text ?? null;
}

function declarationName(node) {
    if (node.type === "fn_decl") return functionName(node);
    if (node.type === "jsgen_decl" || node.type === "global_decl") {
        return childOfType(node, "identifier")?.text ?? null;
    }
    if (node.type === "struct_decl" || node.type === "type_decl" || node.type === "proto_decl") {
        return childOfType(node, "type_ident")?.text ?? null;
    }
    return null;
}

function collectExpandedDeclarations(tree) {
    const entries = [];
    const countsByKind = {};
    const names = new Map();

    for (const item of flattenTopLevelItems(tree)) {
        const kind = DECL_KIND_BY_NODE[item.type] ?? null;
        if (!kind) continue;
        const name = declarationName(item);
        if (!name) continue;
        entries.push({ kind, name, nodeType: item.type });
        countsByKind[kind] = (countsByKind[kind] ?? 0) + 1;
        names.set(name, (names.get(name) ?? 0) + 1);
    }

    const duplicates = [...names.entries()]
        .filter(([, count]) => count > 1)
        .map(([name, count]) => ({ name, count }));

    return {
        declarations: entries,
        declarationCount: entries.length,
        countsByKind,
        duplicates,
    };
}

function collectExpandedCollisions(declarationIndex) {
    const collisionsByName = new Map();

    for (const entry of declarationIndex.declarations ?? []) {
        if (!collisionsByName.has(entry.name)) collisionsByName.set(entry.name, new Set());
        collisionsByName.get(entry.name).add(entry.kind);
    }

    const kindCollisions = [...collisionsByName.entries()]
        .filter(([, kinds]) => kinds.size > 1)
        .map(([name, kinds]) => ({ name, kinds: [...kinds].sort() }));

    const diagnostics = [
        ...(declarationIndex.duplicates ?? []).map(({ name, count }) => ({
            severity: "warning",
            source: "utu",
            phase: "canonicalize-expanded-tree",
            message: `Expanded tree contains duplicate declaration "${name}" (${count} declarations).`,
        })),
        ...kindCollisions.map(({ name, kinds }) => ({
            severity: "warning",
            source: "utu",
            phase: "canonicalize-expanded-tree",
            message: `Expanded tree reuses declaration name "${name}" across kinds: ${kinds.join(", ")}.`,
        })),
    ];

    return {
        duplicateDeclarations: declarationIndex.duplicates ?? [],
        kindCollisions,
        diagnostics,
    };
}

function functionExportName(node) {
    const assocNode = childOfType(node, "associated_fn_name");
    if (assocNode) {
        const [ownerNode, memberNode] = namedChildren(assocNode);
        return ownerNode && memberNode ? `${ownerNode.text}.${memberNode.text}` : null;
    }
    return childOfType(node, "identifier")?.text ?? null;
}

function collectTopLevelSymbol(item) {
    if (item.type === "fn_decl") {
        const name = functionExportName(item);
        return name ? { kind: "function", name, nodeType: item.type } : null;
    }
    if (item.type === "global_decl") {
        const name = childOfType(item, "identifier")?.text ?? null;
        return name ? { kind: "global", name, nodeType: item.type } : null;
    }
    if (item.type === "jsgen_decl") {
        const name = childOfType(item, "identifier")?.text ?? null;
        if (!name) return null;
        return {
            kind: childOfType(item, "return_type") ? "importFunction" : "importValue",
            name,
            nodeType: item.type,
        };
    }
    if (item.type === "struct_decl" || item.type === "type_decl" || item.type === "proto_decl") {
        const name = childOfType(item, "type_ident")?.text ?? null;
        return name ? { kind: item.type.replace("_decl", ""), name, nodeType: item.type } : null;
    }
    return null;
}

function collectFinalLayout(tree) {
    const symbols = [];
    for (const item of namedChildren(tree ?? null)) {
        if (item.type === "library_decl") {
            for (const child of namedChildren(item)) {
                const symbol = collectTopLevelSymbol(child);
                if (symbol) symbols.push(symbol);
            }
            continue;
        }
        const symbol = collectTopLevelSymbol(item);
        if (symbol) symbols.push(symbol);
    }
    const layout = {
        ...analyzeSourceLayout(tree),
        symbols,
    };
    return {
        layout,
        symbols: layout.symbols,
        symbolsByName: new Map(layout.symbols.map((symbol) => [symbol.name, symbol])),
    };
}

export function snapshotCanonicalizedExpansion(tree, {
    expansion = null,
} = {}) {
    const counts = collectNodeCounts(tree, EXPANSION_SYNTAX_NODES);
    const residualModuleSyntaxCount = RESIDUAL_MODULE_DECLARATION_NODES
        .reduce((sum, type) => sum + (counts.byType[type] ?? 0), 0);
    const treeIndex = {
        totalNodes: counts.totalNodes,
        syntaxNodeCounts: counts.byType,
        residualModuleSyntaxCount,
        hasResidualModuleSyntax: residualModuleSyntaxCount > 0,
    };
    const declarationIndex = collectExpandedDeclarations(tree);
    const collisions = collectExpandedCollisions(declarationIndex);
    const recovered = Boolean(expansion?.recovered);
    const diagnostics = [
        ...(expansion?.diagnostics ?? []),
        ...(collisions.diagnostics ?? []),
    ];

    if (!recovered && treeIndex.hasResidualModuleSyntax) {
        diagnostics.push({
            severity: "error",
            source: "utu",
            phase: "canonicalize-expanded-tree",
            message: "Expansion canonicalization left module, construct, or file-import declarations in the expanded tree.",
        });
    }

    return {
        treeIndex,
        declarationIndex,
        collisions,
        validation: {
            recovered,
            diagnostics,
            residualModuleSyntaxCount: treeIndex.residualModuleSyntaxCount,
        },
        layout: collectFinalLayout(tree),
        facts: Object.freeze({
            changed: Boolean(expansion?.changed),
            recovered,
            residualModuleSyntaxCount: treeIndex.residualModuleSyntaxCount,
            declarationCount: declarationIndex.declarationCount,
            duplicateDeclarationCount: (collisions.duplicateDeclarations ?? []).length,
            kindCollisionCount: (collisions.kindCollisions ?? []).length,
            diagnosticsCount: diagnostics.length,
        }),
    };
}
