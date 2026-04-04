import { childOfType, moduleNameNode, namedChildren } from './expansion-shared.js';
import { discoverExpansionItem, discoverExpansionItems } from './expansion-discovery.js';

const LOOP_PASS_NAMES = Object.freeze([
    'load-root-imports',
    'collect-root-definitions',
    'discover-root-constructs',
    'discover-root-namespace-instantiations',
    'populate-pending-namespaces',
    'discover-nested-namespace-instantiations',
]);

const FINALIZE_PASS_NAME = 'finalize-expansion-facts';
const DEFAULT_MAX_ITERATIONS = 64;

export async function runExpansionFixedPoint(state) {
    ensureExpansionWorkState(state);
    if (!state?.shouldExpand) {
        state.fixedPoint = {
            converged: true,
            iterations: 0,
            passRuns: [],
            maxIterations: state?.maxIterations ?? DEFAULT_MAX_ITERATIONS,
        };
        return state;
    }
    if (state.fixedPoint?.converged) return state;

    let converged = false;
    while (state.iteration < state.maxIterations) {
        state.iteration += 1;
        let iterationChanged = false;
        for (const passName of LOOP_PASS_NAMES) {
            const result = await runExpansionPass(state, passName);
            iterationChanged ||= result.changed;
        }
        state.changedSinceLastIteration = iterationChanged;
        if (!iterationChanged) {
            converged = true;
            break;
        }
    }

    if (!converged) {
        const pendingNamespaceCount = state.pendingNamespaceKeys.size + state.pendingNestedNamespaceKeys.size;
        const pendingImportCount = state.pendingImportKeys.size;
        const diagnostic = {
            severity: 'error',
            source: 'utu',
            message: `Expansion fixed point did not converge after ${state.maxIterations} iteration(s) (pending imports: ${pendingImportCount}, pending namespaces: ${pendingNamespaceCount}).`,
        };
        state.diagnostics.push(diagnostic);
        state.recovered = true;
        state.error = new Error(diagnostic.message);
        state.fixedPoint = {
            converged: false,
            iterations: state.iteration,
            passRuns: [...state.fixedPointPassRuns],
            maxIterations: state.maxIterations,
            diagnostics: [...state.diagnostics],
        };
        throw state.error;
    }

    await runExpansionPass(state, FINALIZE_PASS_NAME);
    state.fixedPoint = {
        converged: true,
        iterations: state.iteration,
        passRuns: [...state.fixedPointPassRuns],
        maxIterations: state.maxIterations,
        diagnostics: [...state.diagnostics],
    };
    return state;
}

export async function runExpansionPass(state, passName) {
    ensureExpansionWorkState(state);
    const runner = PASS_RUNNERS.get(passName);
    if (!runner) {
        throw new Error(`Unknown expansion fixed-point pass "${passName}"`);
    }
    const rawResult = await runner(state);
    const result = {
        passName,
        changed: Boolean(rawResult?.changed),
        diagnostics: [...(rawResult?.diagnostics ?? [])],
        stats: rawResult?.stats ?? {},
        iteration: state.iteration,
    };
    if (result.diagnostics.length > 0) {
        state.diagnostics.push(...result.diagnostics);
    }
    state.fixedPointPassRuns.push(result);
    return result;
}

const PASS_RUNNERS = Object.freeze(new Map([
    ['load-root-imports', passLoadRootImports],
    ['collect-root-definitions', passCollectRootDefinitions],
    ['discover-root-constructs', passDiscoverRootConstructs],
    ['discover-root-namespace-instantiations', passDiscoverRootNamespaceInstantiations],
    ['populate-pending-namespaces', passPopulatePendingNamespaces],
    ['discover-nested-namespace-instantiations', passDiscoverNestedNamespaceInstantiations],
    [FINALIZE_PASS_NAME, passFinalizeExpansionFacts],
]));

function ensureExpansionWorkState(state) {
    if (!state) return;
    state.rootItems ??= [...namedChildren(state.root)];
    state.rootLinearItems ??= state.expander.flattenLibraryItems(state.rootItems);
    state.rootItemContexts ??= [];
    state.importWorkItems ??= new Map();
    state.pendingImportKeys ??= new Set();
    state.processedImportKeys ??= new Set();
    state.pendingNamespaceKeys ??= new Set();
    state.processedNamespaceKeys ??= new Set();
    state.pendingNestedNamespaceKeys ??= new Set();
    state.processedNestedNamespaceKeys ??= new Set();
    state.knownRootConstructs ??= new Set();
    state.knownRootModuleRefs ??= new Set();
    state.iteration ??= 0;
    state.maxIterations ??= DEFAULT_MAX_ITERATIONS;
    state.changedSinceLastIteration ??= false;
    state.fixedPointPassRuns ??= [];
    state.rootDefinitionsCollected ??= false;
    state.rootConstructsDiscovered ??= false;
    state.rootNamespaceInstantiationsDiscovered ??= false;
    state.expansionFactsFinalized ??= false;
}

async function passLoadRootImports(state) {
    initializeRootImportWork(state);
    if (state.pendingImportKeys.size === 0) {
        state.importsLoaded = true;
        return emptyPassResult({ pendingImportCount: 0, processedImportCount: state.processedImportKeys.size });
    }

    let processedCount = 0;
    for (const key of [...state.pendingImportKeys]) {
        const workItem = state.importWorkItems.get(key);
        if (!workItem) {
            state.pendingImportKeys.delete(key);
            state.processedImportKeys.add(key);
            continue;
        }
        const binding = await state.expander.resolveFileImportBinding(workItem.node, state.uri);
        state.expander.registerModuleTemplate(binding.template);
        state.pendingImportKeys.delete(key);
        state.processedImportKeys.add(key);
        processedCount += 1;
    }
    state.importsLoaded = state.pendingImportKeys.size === 0;
    return {
        changed: processedCount > 0,
        diagnostics: [],
        stats: {
            pendingImportCount: state.pendingImportKeys.size,
            processedImportCount: state.processedImportKeys.size,
            loadedImportCount: processedCount,
        },
    };
}

function passCollectRootDefinitions(state) {
    if (state.rootDefinitionsCollected) {
        return emptyPassResult({
            moduleCount: state.expander.moduleTemplates.size,
            typeCount: state.expander.topLevelTypeNames.size,
            protocolCount: state.expander.topLevelProtocolNames.size,
        });
    }
    state.expander.collectTopLevelDefinitionNames();
    state.rootDefinitionsCollected = true;
    return {
        changed: true,
        diagnostics: [],
        stats: {
            moduleCount: state.expander.moduleTemplates.size,
            typeCount: state.expander.topLevelTypeNames.size,
            protocolCount: state.expander.topLevelProtocolNames.size,
        },
    };
}

function passDiscoverRootConstructs(state) {
    if (state.rootConstructsDiscovered) {
        return emptyPassResult({
            constructCount: state.knownRootConstructs.size,
            namespaceCount: state.expander.namespaceOrder.length,
        });
    }

    const ctx = state.expander.createRootContext();
    const contexts = [];
    let constructCount = 0;
    let namespaceCount = 0;
    for (const item of state.rootLinearItems) {
        contexts.push(snapshotContext(state.expander, ctx));
        if (item.type !== 'construct_decl') continue;
        const beforeNamespaceCount = state.expander.namespaceOrder.length;
        const namespace = state.expander.applyConstruct(item, ctx);
        if (namespace?.key) state.knownRootConstructs.add(namespace.key);
        addNamespaceKeys(state.knownRootModuleRefs, state.expander.namespaceOrder.slice(beforeNamespaceCount));
        constructCount += 1;
        namespaceCount += state.expander.namespaceOrder.length - beforeNamespaceCount;
    }

    state.rootContext = ctx;
    state.rootItemContexts = contexts;
    state.rootConstructsDiscovered = true;
    return {
        changed: constructCount > 0 || namespaceCount > 0,
        diagnostics: [],
        stats: {
            constructCount,
            namespaceCount: state.expander.namespaceOrder.length,
        },
    };
}

function passDiscoverRootNamespaceInstantiations(state) {
    if (state.rootNamespaceInstantiationsDiscovered) {
        return emptyPassResult({
            knownRootModuleRefCount: state.knownRootModuleRefs.size,
        });
    }

    let discoveredCount = 0;
    state.rootLinearItems.forEach((item, index) => {
        if (item.type === 'construct_decl') return;
        const itemCtx = state.rootItemContexts[index] ?? state.expander.createRootContext();
        const beforeNamespaceCount = state.expander.namespaceOrder.length;
        discoverExpansionItem(state.expander, item, itemCtx, false);
        const discovered = state.expander.namespaceOrder.slice(beforeNamespaceCount);
        addNamespaceKeys(state.knownRootModuleRefs, discovered);
        discoveredCount += discovered.length;
    });

    state.rootNamespaceInstantiationsDiscovered = true;
    return {
        changed: discoveredCount > 0,
        diagnostics: [],
        stats: {
            discoveredNamespaceCount: discoveredCount,
            knownRootModuleRefCount: state.knownRootModuleRefs.size,
        },
    };
}

function passPopulatePendingNamespaces(state) {
    if (state.pendingNamespaceKeys.size === 0) {
        state.namespacesPrimed = state.processedNamespaceKeys.size === state.expander.namespaceOrder.length;
        return emptyPassResult({
            pendingNamespaceCount: 0,
            processedNamespaceCount: state.processedNamespaceKeys.size,
        });
    }

    let populatedCount = 0;
    let queuedNestedCount = 0;
    for (const key of [...state.pendingNamespaceKeys]) {
        const namespace = state.expander.namespaceCache.get(key);
        state.pendingNamespaceKeys.delete(key);
        if (!namespace) {
            state.processedNamespaceKeys.add(key);
            continue;
        }
        const alreadyPopulated = namespace.valuesPopulated;
        if (!alreadyPopulated) {
            const ctx = state.expander.createNamespaceContext(namespace);
            state.expander.populateNamespaceTypes(namespace, ctx);
            state.expander.populateNamespaceDeclarations(namespace, ctx);
            state.expander.populateNamespaceValues(namespace, ctx);
            populatedCount += 1;
        }
        state.processedNamespaceKeys.add(key);
        if (!namespace.nestedDiscoveryComplete && !state.pendingNestedNamespaceKeys.has(key) && !state.processedNestedNamespaceKeys.has(key)) {
            state.pendingNestedNamespaceKeys.add(key);
            queuedNestedCount += 1;
        }
    }

    state.namespacesPrimed = state.processedNamespaceKeys.size === state.expander.namespaceOrder.length;
    return {
        changed: populatedCount > 0 || queuedNestedCount > 0,
        diagnostics: [],
        stats: {
            pendingNamespaceCount: state.pendingNamespaceKeys.size,
            processedNamespaceCount: state.processedNamespaceKeys.size,
            populatedNamespaceCount: populatedCount,
            queuedNestedCount,
        },
    };
}

function passDiscoverNestedNamespaceInstantiations(state) {
    if (state.pendingNestedNamespaceKeys.size === 0) {
        return emptyPassResult({
            pendingNestedCount: 0,
            processedNestedCount: state.processedNestedNamespaceKeys.size,
        });
    }

    let discoveredCount = 0;
    for (const key of [...state.pendingNestedNamespaceKeys]) {
        const namespace = state.expander.namespaceCache.get(key);
        state.pendingNestedNamespaceKeys.delete(key);
        state.processedNestedNamespaceKeys.add(key);
        if (!namespace || namespace.nestedDiscoveryComplete) continue;
        const ctx = state.expander.createNamespaceContext(namespace);
        const beforeNamespaceCount = state.expander.namespaceOrder.length;
        discoverExpansionItems(state.expander, namespace.template.items, ctx, true);
        const discovered = state.expander.namespaceOrder.slice(beforeNamespaceCount);
        discoveredCount += discovered.length;
        namespace.nestedDiscoveryComplete = true;
    }

    return {
        changed: discoveredCount > 0,
        diagnostics: [],
        stats: {
            pendingNestedCount: state.pendingNestedNamespaceKeys.size,
            processedNestedCount: state.processedNestedNamespaceKeys.size,
            discoveredNamespaceCount: discoveredCount,
        },
    };
}

function passFinalizeExpansionFacts(state) {
    if (state.expansionFactsFinalized) {
        return emptyPassResult({
            namespaceCount: state.expander.namespaceOrder.length,
            valueCount: state.expander.topLevelValueNames.size,
        });
    }

    state.rootLinearItems.forEach((item, index) => {
        const itemCtx = state.rootItemContexts[index] ?? state.expander.createRootContext();
        if (item.type === 'struct_decl') state.expander.collectTopLevelStructFields(item, itemCtx);
        if (item.type === 'type_decl') state.expander.collectTopLevelTypeFields(item, itemCtx);
        if (item.type === 'proto_decl') state.expander.collectTopLevelProtocol(item, itemCtx);
    });

    const topLevelCtx = state.expander.createRootContext();
    state.expander.collectTopLevelValueFacts(topLevelCtx);
    state.topLevelCollected = true;
    state.topLevelDeclarations = snapshotExpansionTopLevelDeclarations(state);
    state.namespaceModel = {
        namespaces: state.expander.namespaceOrder.map((namespace) => ({
            key: namespace.key,
            displayText: namespace.displayText,
            templateName: namespace.template.name,
            promotedType: namespace.promotedType ?? null,
            exportedTypes: [...namespace.exportedTypes],
            exportedValues: [...namespace.exportedValues],
        })),
    };
    state.symbolFacts = {
        valueTypes: mapEntries(state.expander.topLevelValueTypes),
        functionReturns: mapEntries(state.expander.topLevelFnReturns),
        associatedReturns: mapEntries(state.expander.topLevelAssocReturns),
        protocolMembers: mapEntries(state.expander.topLevelProtocolMembers),
    };
    state.expansionFactsFinalized = true;
    return {
        changed: true,
        diagnostics: [],
        stats: {
            namespaceCount: state.expander.namespaceOrder.length,
            valueCount: state.expander.topLevelValueNames.size,
            typeCount: state.expander.topLevelTypeNames.size,
        },
    };
}

function initializeRootImportWork(state) {
    if (state.importWorkItems.size > 0 || state.processedImportKeys.size > 0 || state.pendingImportKeys.size > 0) {
        return;
    }
    state.rootItems.forEach((item, index) => {
        if (item.type !== 'file_import_decl') return;
        const importedName = moduleNameNode(childOfType(item, 'imported_module_name'))?.text ?? 'unknown';
        const specifier = childOfType(item, 'string_lit')?.text ?? '""';
        const key = `${index}:${importedName}:${specifier}`;
        state.importWorkItems.set(key, { key, node: item });
        state.pendingImportKeys.add(key);
    });
}

function snapshotContext(expander, ctx) {
    return expander.cloneContext(ctx, {
        aliases: new Map(ctx.aliases),
        openTypes: new Map(ctx.openTypes),
        openValues: new Map(ctx.openValues),
        localValueScopes: [],
    });
}

function snapshotExpansionTopLevelDeclarations(state) {
    return {
        moduleNames: [...state.expander.moduleTemplates.keys()].sort(),
        typeNames: [...state.expander.topLevelTypeNames].sort(),
        valueNames: [...state.expander.topLevelValueNames].sort(),
        protocolNames: [...state.expander.topLevelProtocolNames].sort(),
    };
}

function mapEntries(map) {
    return [...map.entries()].map(([name, value]) => ({ name, value }));
}

function addNamespaceKeys(target, namespaces) {
    for (const namespace of namespaces) {
        if (namespace?.key) target.add(namespace.key);
    }
}

function emptyPassResult(stats = {}) {
    return {
        changed: false,
        diagnostics: [],
        stats,
    };
}
