import { readCompilerArtifact } from "./compiler-stage-runtime.js";
import { ensureExpansionTopLevelDeclarations } from "./expansion-session.js";

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

export async function runCollectTopLevelExpansionFacts(context) {
    const expansionState = readCompilerArtifact(context, "expansionSession");
    if (!expansionState?.shouldExpand) {
        return {
            moduleNames: [],
            typeNames: [],
            valueNames: [],
            protocolNames: [],
            moduleTemplates: [],
            topLevelFacts: {
                typeNames: [],
                protocolNames: [],
                taggedTypes: [],
                structFields: [],
            },
        };
    }
    await ensureExpansionTopLevelDeclarations(expansionState);
    const expander = expansionState.expander;
    return {
        ...expansionState.topLevelDeclarations,
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
    };
}
