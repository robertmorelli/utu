import { ModuleExpander } from "./module-expander.js";
import {
    childOfType,
    containsModuleFeature,
    kids,
    rootNode,
} from "./core.js";
import "./module-loading.js";
import "./collect/top-level.js";
import "./collect/symbols.js";
import "./collect/namespaces-open.js";
import "./collect/namespaces-expand.js";
import "./collect/namespaces-naming.js";
import "./collect/namespaces-types.js";
import "./emit/declarations-items.js";
import "./emit/declarations-types.js";
import "./emit/declarations-functions.js";
import "./emit/declarations-runtime.js";
import "./emit/type-info.js";
import "./emit/expressions-core.js";
import "./emit/expressions-values.js";
import "./emit/expressions-calls.js";
import "./emit/expressions-pipe.js";
import "./emit/expressions-resolution.js";
import "./emit/expressions-control.js";

const NAMESPACE_SOURCE_CONTEXT = "__stage2SourceContext";

export function createStage2ExpansionDiagnostic(error) {
    return {
        message: error?.message || String(error),
        severity: "error",
        source: "utu",
        phase: "expand",
    };
}

export function createStage2ExpansionState({
    treeOrNode,
    source,
    uri = null,
    loadImport = null,
    parseSource = null,
    expandOptions = {},
} = {}) {
    const root = rootNode(treeOrNode);
    const hasModuleFeatures = containsModuleFeature(root);
    const shouldExpand = expandOptions.shouldExpand ?? hasModuleFeatures;
    return {
        root,
        source,
        uri,
        loadImport,
        parseSource,
        mode: expandOptions.mode ?? null,
        recover: Boolean(expandOptions.recover),
        hasModuleFeatures,
        shouldExpand,
        recovered: false,
        error: null,
        diagnostics: [],
        expander: shouldExpand ? new ModuleExpander(root, source, { uri, loadImport, parseSource }) : null,
        typeDeclarationUnits: [],
        functionRuntimeDeclarationUnits: [],
        materializedSource: source,
    };
}

export function summarizeStage2ExpansionState(state) {
    const materializedSource = state?.materializedSource ?? state?.source ?? "";
    return {
        mode: state?.mode ?? null,
        hasModuleFeatures: Boolean(state?.hasModuleFeatures),
        shouldExpand: Boolean(state?.shouldExpand),
        recovered: Boolean(state?.recovered),
        error: state?.error ?? null,
        diagnostics: [...(state?.diagnostics ?? [])],
        changed: materializedSource !== (state?.source ?? materializedSource),
    };
}

export async function runStage2ExpansionTask(state, fn) {
    if (!state?.shouldExpand || !state?.expander || state.recovered) return null;
    try {
        return await fn(state.expander, state);
    } catch (error) {
        if (!state.recover) throw error;
        state.recovered = true;
        state.error = error;
        state.diagnostics.push(createStage2ExpansionDiagnostic(error));
        return null;
    }
}

export async function snapshotStage2LoadedFiles(state) {
    if (!state?.expander) return [];
    const loadedFiles = [];
    for (const [cacheKey, descriptorPromise] of state.expander.loadedFiles) {
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

export async function loadStage2ExpansionImports(state) {
    await runStage2ExpansionTask(state, async (expander) => {
        await expander.loadRootFileImports();
    });
    return {
        ...summarizeStage2ExpansionState(state),
        loadedFiles: await snapshotStage2LoadedFiles(state),
        moduleBindings: state?.expander ? collectStage2ModuleTemplateSummary(state.expander) : [],
        parseCache: state?.expander ? [...state.expander.loadedFiles.keys()].sort() : [],
    };
}

export function resolveConstructNamespace(expander, node, ctx) {
    const moduleRef = childOfType(node, "module_ref") ?? childOfType(node, "instantiated_module_ref");
    return moduleRef ? expander.resolveNamespaceFromModuleRef(moduleRef, ctx) : null;
}

export function captureNamespaceSourceContext(expander, namespace, ctx) {
    if (!namespace || namespace[NAMESPACE_SOURCE_CONTEXT]) return;
    namespace[NAMESPACE_SOURCE_CONTEXT] = expander.cloneContext(ctx, {
        localValueScopes: [],
    });
}

export function createNamespaceEmitContext(expander, namespace) {
    const baseCtx = namespace?.[NAMESPACE_SOURCE_CONTEXT] ?? expander.createRootContext();
    return expander.cloneContext(baseCtx, {
        namespace,
        typeParams: new Map([...(baseCtx.typeParams ?? new Map()), ...namespace.typeParams]),
        moduleBindings: namespace.template?.moduleBindings ?? baseCtx.moduleBindings,
        localValueScopes: [],
    });
}

function emitTypeDeclaration(expander, node, ctx, inModule) {
    switch (node.type) {
        case "struct_decl":
            return expander.emitStructDecl(node, ctx, inModule);
        case "proto_decl":
            return expander.emitProtoDecl(node, ctx, inModule);
        case "type_decl":
            return `${expander.emitTypeDecl(node, ctx, inModule)};`;
        default:
            return "";
    }
}

function emitFunctionOrRuntimeDeclaration(expander, node, ctx, inModule) {
    switch (node.type) {
        case "fn_decl":
            return expander.emitFnDecl(node, ctx, inModule);
        case "global_decl":
            return `${expander.emitGlobalDecl(node, ctx, inModule)};`;
        case "jsgen_decl":
            return `${expander.emitJsgenDecl(node, ctx, inModule)};`;
        default:
            return "";
    }
}

function collectDeclarationUnitsForRoot(expander, emitUnit) {
    const ctx = expander.createRootContext();
    const items = expander.flattenLibraryItems(kids(expander.root));
    const units = [];

    for (const item of items) {
        if (item.type === "construct_decl") {
            const namespace = resolveConstructNamespace(expander, item, ctx);
            captureNamespaceSourceContext(expander, namespace, ctx);
            expander.applyConstruct(item, ctx);
            continue;
        }
        if (item.type === "module_decl" || item.type === "file_import_decl") continue;
        const source = emitUnit(expander, item, ctx, false);
        if (source) units.push({ scope: "top-level", kind: item.type, source });
    }

    return units;
}

function collectDeclarationUnitsForNamespaces(expander, emitUnit) {
    const units = [];
    for (const namespace of expander.namespaceOrder) {
        const ctx = createNamespaceEmitContext(expander, namespace);
        for (const item of namespace.template.items) {
            const source = emitUnit(expander, item, ctx, true);
            if (!source) continue;
            units.push({
                scope: namespace.displayText,
                kind: item.type,
                source,
            });
        }
    }
    return units;
}

export async function emitStage2TypeDeclarations(state) {
    await runStage2ExpansionTask(state, (expander, currentState) => {
        currentState.typeDeclarationUnits = [
            ...collectDeclarationUnitsForNamespaces(expander, emitTypeDeclaration),
            ...collectDeclarationUnitsForRoot(expander, emitTypeDeclaration),
        ];
    });

    return {
        ...summarizeStage2ExpansionState(state),
        typeDeclarations: [...(state?.typeDeclarationUnits ?? [])],
    };
}

export async function emitStage2FunctionAndRuntimeDeclarations(state) {
    await runStage2ExpansionTask(state, (expander, currentState) => {
        currentState.functionRuntimeDeclarationUnits = [
            ...collectDeclarationUnitsForNamespaces(expander, emitFunctionOrRuntimeDeclaration),
            ...collectDeclarationUnitsForRoot(expander, emitFunctionOrRuntimeDeclaration),
        ];
    });

    return {
        ...summarizeStage2ExpansionState(state),
        functionAndRuntimeDeclarations: [...(state?.functionRuntimeDeclarationUnits ?? [])],
    };
}

function recomputeNamespaceSources(expander) {
    for (const namespace of expander.namespaceOrder) {
        const ctx = createNamespaceEmitContext(expander, namespace);
        namespace.source = namespace.template.items
            .map((item) => expander.emitItem(item, ctx, true))
            .filter(Boolean)
            .join("\n\n");
    }
}

export async function materializeStage2ExpandedSource(state) {
    await runStage2ExpansionTask(state, (expander, currentState) => {
        recomputeNamespaceSources(expander);
        const ctx = expander.createRootContext();
        const topLevelOutputs = [];

        for (const item of kids(expander.root)) {
            if (item.type === "module_decl" || item.type === "file_import_decl") continue;
            if (item.type === "construct_decl") {
                const namespace = resolveConstructNamespace(expander, item, ctx);
                captureNamespaceSourceContext(expander, namespace, ctx);
                expander.applyConstruct(item, ctx);
                continue;
            }
            const emitted = expander.emitItem(item, ctx, false);
            if (emitted) topLevelOutputs.push(emitted);
        }

        currentState.materializedSource = [
            ...expander.namespaceOrder.map((namespace) => namespace.source),
            ...topLevelOutputs,
        ].filter(Boolean).join("\n\n");
    });

    return {
        ...summarizeStage2ExpansionState(state),
        source: state?.materializedSource ?? state?.source ?? "",
    };
}

export function disposeStage2ExpansionState(state) {
    for (const dispose of state?.expander?.loadedFileDisposers?.splice?.(0) ?? []) {
        try {
            dispose?.();
        } catch {}
    }
}
