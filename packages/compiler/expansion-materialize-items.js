import { childOfType, kids } from "./expansion-shared.js";

const UNSUPPORTED_MODULE_ITEM_LABELS = Object.freeze({
    module_decl: "nested modules",
    file_import_decl: "file imports",
    construct_decl: "construct declarations",
    library_decl: "library declarations",
    test_decl: "test declarations",
    bench_decl: "bench declarations",
});

export function emitExpansionItem(expander, node, ctx, inModule) {
    if (inModule && Object.hasOwn(UNSUPPORTED_MODULE_ITEM_LABELS, node.type)) {
        throw new Error(`${UNSUPPORTED_MODULE_ITEM_LABELS[node.type]} are not supported inside modules in v1`);
    }
    switch (node.type) {
        case "module_decl":
            return "";
        case "file_import_decl":
            return "";
        case "construct_decl":
            if (!inModule) {
                expander.applyConstruct(node, ctx);
            }
            return "";
        case "struct_decl":
            return expander.emitStructDecl(node, ctx, inModule);
        case "proto_decl":
            return expander.emitProtoDecl(node, ctx, inModule);
        case "type_decl":
            return `${expander.emitTypeDecl(node, ctx, inModule)};`;
        case "fn_decl":
            return expander.emitFnDecl(node, ctx, inModule);
        case "global_decl":
            return `${expander.emitGlobalDecl(node, ctx, inModule)};`;
        case "jsgen_decl":
            return `${expander.emitJsgenDecl(node, ctx, inModule)};`;
        case "library_decl":
            return inModule ? "" : emitExpansionLibraryDecl(expander, node, ctx);
        case "test_decl":
            return inModule ? "" : emitExpansionTestDecl(expander, node, ctx);
        case "bench_decl":
            return inModule ? "" : emitExpansionBenchDecl(expander, node, ctx);
        default:
            return "";
    }
}

export function emitExpansionTestDecl(expander, node, ctx) {
    return `test ${childOfType(node, "string_lit").text} ${expander.emitBlock(childOfType(node, "block"), expander.pushScope(ctx), true)}`;
}

export function emitExpansionBenchDecl(expander, node, ctx) {
    return `bench ${childOfType(node, "string_lit").text} { ${emitExpansionSetupDecl(expander, childOfType(node, "setup_decl"), expander.pushScope(ctx))} }`;
}

export function emitExpansionSetupDecl(expander, node, ctx) {
    const parts = [];
    for (const child of kids(node)) {
        if (child.type === "measure_decl") {
            parts.push(`measure ${expander.emitBlock(childOfType(child, "block"), expander.pushScope(ctx), true)}`);
            continue;
        }
        parts.push(`${expander.emitExpr(child, ctx)};`);
    }
    return `setup { ${parts.join(" ")} }`;
}

export function emitExpansionLibraryDecl(expander, node, ctx) {
    const parts = [];
    for (const child of kids(node)) {
        if (child.type === "construct_decl") {
            expander.applyConstruct(child, ctx);
            continue;
        }
        const emitted = emitExpansionItem(expander, child, ctx, false);
        if (emitted) parts.push(emitted);
    }
    return `library {\n${parts.map(indentExpansionBlock).join("\n\n")}\n}`;
}

export function indentExpansionBlock(source) {
    return source
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
}
