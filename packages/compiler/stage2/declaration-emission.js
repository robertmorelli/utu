import { kids } from "./expansion/bootstrap.js";
import {
    runStage2ExpansionStep,
    summarizeStage2ExpansionState,
} from "./expansion-state.js";
import {
    captureNamespaceSourceContext,
    createNamespaceEmitContext,
    resolveConstructNamespace,
} from "./namespaces.js";

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

export async function emitStage2TypeDeclarations(expansion) {
    await runStage2ExpansionStep(expansion, (expander, currentExpansion) => {
        currentExpansion.typeDeclarationUnits = [
            ...collectDeclarationUnitsForNamespaces(expander, emitTypeDeclaration),
            ...collectDeclarationUnitsForRoot(expander, emitTypeDeclaration),
        ];
    });

    return {
        ...summarizeStage2ExpansionState(expansion),
        typeDeclarations: [...(expansion?.typeDeclarationUnits ?? [])],
    };
}

export async function emitStage2FunctionAndRuntimeDeclarations(expansion) {
    await runStage2ExpansionStep(expansion, (expander, currentExpansion) => {
        currentExpansion.functionRuntimeDeclarationUnits = [
            ...collectDeclarationUnitsForNamespaces(expander, emitFunctionOrRuntimeDeclaration),
            ...collectDeclarationUnitsForRoot(expander, emitFunctionOrRuntimeDeclaration),
        ];
    });

    return {
        ...summarizeStage2ExpansionState(expansion),
        functionAndRuntimeDeclarations: [...(expansion?.functionRuntimeDeclarationUnits ?? [])],
    };
}
