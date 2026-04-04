import {
    childOfType,
    childrenOfType,
    hasAnon,
    kids,
} from "./expansion/bootstrap.js";
import { collectStage2ModuleTemplateSummary } from "./load-imports.js";
import {
    runStage2ExpansionStep,
    summarizeStage2ExpansionState,
} from "./expansion-state.js";

function collectModuleTemplate(expander, node) {
    expander.registerModuleTemplate(expander.buildModuleTemplate(node));
}

function collectTopLevelStructFields(expander, node, ctx) {
    const nameNode = childOfType(node, "type_ident");
    if (!nameNode) return;
    const protocolNames = childrenOfType(childOfType(node, "protocol_list"), "type_ident").map((child) => child.text);
    if (hasAnon(node, "tag") && protocolNames.length > 0) {
        expander.topLevelTaggedTypeProtocols.set(nameNode.text, new Set(protocolNames));
    }
    const fields = new Map();
    for (const field of childrenOfType(childOfType(node, "field_list"), "field")) {
        const fieldName = childOfType(field, "identifier");
        const typeNode = kids(field).at(-1);
        if (!fieldName || !typeNode) continue;
        fields.set(fieldName.text, {
            typeInfo: expander.describeType(typeNode, ctx),
            mut: hasAnon(field, "mut"),
        });
    }
    expander.topLevelStructFieldTypes.set(nameNode.text, fields);
}

function collectTopLevelTypeFields(expander, node, ctx) {
    const nameNode = childOfType(node, "type_ident");
    if (!nameNode) return;
    const protocolNames = childrenOfType(childOfType(node, "protocol_list"), "type_ident").map((child) => child.text);
    if (hasAnon(node, "tag") && protocolNames.length > 0) {
        expander.topLevelTaggedTypeProtocols.set(nameNode.text, new Set(protocolNames));
    }
    for (const variant of childrenOfType(childOfType(node, "variant_list"), "variant")) {
        const variantName = childOfType(variant, "type_ident");
        if (!variantName) continue;
        const fields = new Map();
        for (const field of childrenOfType(childOfType(variant, "field_list"), "field")) {
            const fieldName = childOfType(field, "identifier");
            const typeNode = kids(field).at(-1);
            if (!fieldName || !typeNode) continue;
            fields.set(fieldName.text, {
                typeInfo: expander.describeType(typeNode, ctx),
                mut: hasAnon(field, "mut"),
            });
        }
        expander.topLevelStructFieldTypes.set(variantName.text, fields);
    }
}

function collectTopLevelProtocol(expander, node, ctx) {
    const nameNode = childOfType(node, "type_ident");
    if (!nameNode) return;
    expander.topLevelProtocolNames.add(nameNode.text);
    expander.collectProtocolMembers(nameNode.text, node, ctx);
}

export function collectTopLevelDeclarationsFromExpander(expander) {
    const ctx = expander.createRootContext();
    const items = expander.flattenLibraryItems(kids(expander.root));

    for (const item of items) {
        if (item.type === "module_decl") collectModuleTemplate(expander, item);
        if (item.type === "struct_decl") {
            const nameNode = childOfType(item, "type_ident");
            if (nameNode) expander.topLevelTypeNames.add(nameNode.text);
        }
        if (item.type === "type_decl") {
            const nameNode = childOfType(item, "type_ident");
            if (nameNode) expander.topLevelTypeNames.add(nameNode.text);
            for (const variant of childOfType(item, "variant_list")?.namedChildren ?? []) {
                if (variant.type !== "variant") continue;
                const variantName = childOfType(variant, "type_ident");
                if (variantName) expander.topLevelTypeNames.add(variantName.text);
            }
        }
        if (item.type === "proto_decl") {
            const nameNode = childOfType(item, "type_ident");
            if (nameNode) expander.topLevelProtocolNames.add(nameNode.text);
        }
    }

    for (const item of items) {
        if (item.type === "struct_decl") collectTopLevelStructFields(expander, item, ctx);
        if (item.type === "type_decl") collectTopLevelTypeFields(expander, item, ctx);
        if (item.type === "proto_decl") collectTopLevelProtocol(expander, item, ctx);
    }
}

export async function collectStage2TopLevelDeclarations(expansion) {
    await runStage2ExpansionStep(expansion, (expander) => {
        collectTopLevelDeclarationsFromExpander(expander);
    });

    const expander = expansion?.expander;
    return {
        ...summarizeStage2ExpansionState(expansion),
        moduleTemplates: expander ? collectStage2ModuleTemplateSummary(expander) : [],
        topLevelFacts: expander ? {
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
        } : {
            typeNames: [],
            protocolNames: [],
            taggedTypes: [],
            structFields: [],
        },
    };
}
