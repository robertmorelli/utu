import { childOfType, childrenOfType, kids, namedChildren } from './expansion-shared.js';

const UNSUPPORTED_MODULE_ITEM_LABELS = Object.freeze({
    module_decl: 'nested modules',
    file_import_decl: 'file imports',
    construct_decl: 'construct declarations',
    library_decl: 'library declarations',
    test_decl: 'test declarations',
    bench_decl: 'bench declarations',
});

export function discoverExpansionItems(expander, items, ctx, inModule) {
    for (const item of items) {
        discoverExpansionItem(expander, item, ctx, inModule);
    }
}

export function discoverExpansionItem(expander, node, ctx, inModule) {
    if (inModule && Object.hasOwn(UNSUPPORTED_MODULE_ITEM_LABELS, node.type)) {
        throw new Error(`${UNSUPPORTED_MODULE_ITEM_LABELS[node.type]} are not supported inside modules in v1`);
    }
    switch (node.type) {
        case 'module_decl':
        case 'file_import_decl':
            return;
        case 'library_decl':
            discoverExpansionItems(expander, kids(node), ctx, false);
            return;
        case 'construct_decl':
            if (!inModule) expander.applyConstruct(node, ctx);
            return;
        case 'struct_decl':
            discoverStructDecl(expander, node, ctx);
            return;
        case 'proto_decl':
            discoverProtoDecl(expander, node, ctx);
            return;
        case 'type_decl':
            discoverTypeDecl(expander, node, ctx);
            return;
        case 'fn_decl':
            discoverFunctionDecl(expander, node, ctx);
            return;
        case 'global_decl':
            discoverGlobalDecl(expander, node, ctx);
            return;
        case 'jsgen_decl':
            discoverJsgenDecl(expander, node, ctx);
            return;
        case 'test_decl':
            if (!inModule) discoverTestDecl(expander, node, ctx);
            return;
        case 'bench_decl':
            if (!inModule) discoverBenchDecl(expander, node, ctx);
            return;
        default:
            for (const child of namedChildren(node)) {
                discoverExpansionExpr(expander, child, ctx);
            }
    }
}

export function discoverExpansionType(expander, node, ctx) {
    if (!node) return;
    switch (node.type) {
        case 'module_ref':
        case 'instantiated_module_ref':
        case 'inline_module_type_path':
            expander.resolveNamespaceFromModuleRef(node, ctx);
            return;
        case 'qualified_type_ref': {
            const moduleRef = childOfType(node, 'module_ref') ?? childOfType(node, 'instantiated_module_ref');
            if (moduleRef) expander.resolveNamespaceFromModuleRef(moduleRef, ctx);
            return;
        }
        default:
            for (const child of namedChildren(node)) {
                discoverExpansionType(expander, child, ctx);
            }
    }
}

export function discoverExpansionExpr(expander, node, ctx) {
    if (!node) return;
    switch (node.type) {
        case 'literal':
        case 'identifier':
        case 'type_ident':
        case 'fatal_expr':
        case 'break_expr':
            return;
        case 'module_ref':
        case 'instantiated_module_ref':
        case 'qualified_type_ref':
        case 'inline_module_type_path':
            discoverExpansionType(expander, node, ctx);
            return;
        case 'paren_expr':
        case 'assert_expr':
        case 'emit_expr':
        case 'unary_expr':
        case 'block_expr': {
            const child = kids(node).at(-1);
            if (child?.type === 'block') {
                discoverBlock(expander, child, expander.pushScope(ctx), true);
                return;
            }
            for (const part of namedChildren(node)) {
                discoverExpansionExpr(expander, part, ctx);
            }
            return;
        }
        case 'tuple_expr':
        case 'binary_expr':
        case 'else_expr':
        case 'index_expr':
        case 'assign_expr':
            for (const child of namedChildren(node)) {
                discoverExpansionExpr(expander, child, ctx);
            }
            return;
        case 'field_expr': {
            const [baseNode] = kids(node);
            discoverMaybeNamespaceBase(expander, baseNode, ctx);
            discoverExpansionExpr(expander, baseNode, ctx);
            return;
        }
        case 'type_member_expr': {
            const memberNode = childOfType(node, 'identifier');
            const ownerNode = kids(node).find((child) => child !== memberNode);
            discoverMaybeNamespaceBase(expander, ownerNode, ctx);
            if (ownerNode) {
                if (ownerNode.type === 'type_ident') return;
                discoverExpansionExpr(expander, ownerNode, ctx);
            }
            return;
        }
        case 'call_expr': {
            const callee = kids(node)[0];
            const argNodes = kids(childOfType(node, 'arg_list'));
            discoverExpansionExpr(expander, callee, ctx);
            for (const arg of argNodes) {
                discoverExpansionExpr(expander, arg, ctx);
            }
            return;
        }
        case 'promoted_module_call_expr': {
            expander.resolveNamespaceFromModuleRef(node, ctx);
            for (const arg of kids(childOfType(node, 'arg_list'))) {
                discoverExpansionExpr(expander, arg, ctx);
            }
            return;
        }
        case 'pipe_expr': {
            discoverExpansionExpr(expander, kids(node)[0], ctx);
            discoverPipeTarget(expander, childOfType(node, 'pipe_target'), ctx);
            return;
        }
        case 'ref_null_expr':
            discoverExpansionType(expander, kids(node)[0], ctx);
            return;
        case 'if_expr': {
            const [condition, thenBlock, elseBranch] = kids(node);
            discoverExpansionExpr(expander, condition, ctx);
            discoverBlock(expander, thenBlock, expander.pushScope(ctx), true);
            if (!elseBranch) return;
            if (elseBranch.type === 'if_expr') {
                discoverExpansionExpr(expander, elseBranch, ctx);
                return;
            }
            discoverBlock(expander, elseBranch, expander.pushScope(ctx), true);
            return;
        }
        case 'promote_expr': {
            const [expr, capture, thenBlock, elseBlock] = kids(node);
            discoverExpansionExpr(expander, expr, ctx);
            const inner = expander.pushScope(ctx);
            const ident = childOfType(capture, 'identifier');
            if (ident?.text && ident.text !== '_') expander.declareLocal(inner, ident.text, null);
            discoverBlock(expander, thenBlock, inner, true);
            if (elseBlock) discoverBlock(expander, elseBlock, expander.pushScope(ctx), true);
            return;
        }
        case 'match_expr': {
            const [subject, ...arms] = kids(node);
            discoverExpansionExpr(expander, subject, ctx);
            for (const arm of arms) {
                const expr = kids(arm).at(-1);
                discoverExpansionExpr(expander, expr, ctx);
            }
            return;
        }
        case 'alt_expr': {
            const [subject, ...arms] = kids(node);
            discoverExpansionExpr(expander, subject, ctx);
            for (const arm of arms) {
                discoverAltArm(expander, arm, ctx);
            }
            return;
        }
        case 'for_expr': {
            const forCtx = expander.pushScope(ctx);
            for (const source of childrenOfType(childOfType(node, 'for_sources'), 'for_source')) {
                const [start, end] = kids(source);
                discoverExpansionExpr(expander, start, ctx);
                discoverExpansionExpr(expander, end, ctx);
            }
            for (const ident of childrenOfType(childOfType(node, 'capture'), 'identifier')) {
                expander.declareLocal(forCtx, ident.text, null);
            }
            discoverBlock(expander, childOfType(node, 'block'), forCtx, true);
            return;
        }
        case 'while_expr': {
            const condition = kids(node).find((child) => child.type !== 'block');
            discoverExpansionExpr(expander, condition, ctx);
            discoverBlock(expander, childOfType(node, 'block'), expander.pushScope(ctx), true);
            return;
        }
        case 'bind_expr': {
            const targets = childrenOfType(node, 'bind_target');
            const valueNode = kids(node).at(-1);
            discoverExpansionExpr(expander, valueNode, ctx);
            for (const target of targets) {
                const ident = childOfType(target, 'identifier');
                const typeNode = kids(target).at(-1);
                discoverExpansionType(expander, typeNode, ctx);
                if (ident?.text) expander.declareLocal(ctx, ident.text, null);
            }
            return;
        }
        case 'struct_init': {
            const typeNode = kids(node)[0];
            discoverExpansionType(expander, typeNode, ctx);
            for (const fieldInit of childrenOfType(node, 'field_init')) {
                discoverExpansionExpr(expander, kids(fieldInit).at(-1), ctx);
            }
            return;
        }
        case 'array_init': {
            discoverExpansionType(expander, kids(node)[0], ctx);
            for (const arg of kids(childOfType(node, 'arg_list'))) {
                discoverExpansionExpr(expander, arg, ctx);
            }
            return;
        }
        case 'block':
            discoverBlock(expander, node, expander.pushScope(ctx), true);
            return;
        default:
            for (const child of namedChildren(node)) {
                discoverExpansionExpr(expander, child, ctx);
            }
    }
}

function discoverStructDecl(expander, node, ctx) {
    for (const field of childrenOfType(childOfType(node, 'field_list'), 'field')) {
        discoverExpansionType(expander, kids(field).at(-1), ctx);
    }
}

function discoverProtoDecl(expander, node, ctx) {
    const memberList = childOfType(node, 'proto_member_list');
    if (!memberList) return;
    for (const member of childrenOfType(memberList, 'proto_member').map((entry) => kids(entry)[0]).filter(Boolean)) {
        if (member.type === 'proto_method') {
            for (const typeNode of kids(childOfType(member, 'type_list'))) {
                discoverExpansionType(expander, typeNode, ctx);
            }
            discoverReturnType(expander, childOfType(member, 'return_type'), ctx);
            continue;
        }
        discoverExpansionType(expander, kids(member).at(-1), ctx);
    }
}

function discoverTypeDecl(expander, node, ctx) {
    for (const variant of childrenOfType(childOfType(node, 'variant_list'), 'variant')) {
        for (const field of childrenOfType(childOfType(variant, 'field_list'), 'field')) {
            discoverExpansionType(expander, kids(field).at(-1), ctx);
        }
    }
}

function discoverFunctionDecl(expander, node, ctx) {
    const fnCtx = expander.pushScope(ctx);
    for (const param of childrenOfType(childOfType(node, 'param_list'), 'param')) {
        const nameNode = childOfType(param, 'identifier');
        const typeNode = kids(param)[1];
        discoverExpansionType(expander, typeNode, ctx);
        if (nameNode?.text) expander.declareLocal(fnCtx, nameNode.text, null);
    }
    discoverReturnType(expander, childOfType(node, 'return_type'), ctx);
    discoverBlock(expander, childOfType(node, 'block'), fnCtx, true);
}

function discoverGlobalDecl(expander, node, ctx) {
    const [, typeNode, valueNode] = kids(node);
    discoverExpansionType(expander, typeNode, ctx);
    discoverExpansionExpr(expander, valueNode, ctx);
}

function discoverJsgenDecl(expander, node, ctx) {
    discoverImportParamList(expander, childOfType(node, 'import_param_list'), ctx);
    const returnTypeNode = childOfType(node, 'return_type');
    if (returnTypeNode) {
        discoverReturnType(expander, returnTypeNode, ctx);
        return;
    }
    discoverExpansionType(expander, kids(node).at(-1), ctx);
}

function discoverTestDecl(expander, node, ctx) {
    discoverBlock(expander, childOfType(node, 'block'), expander.pushScope(ctx), true);
}

function discoverBenchDecl(expander, node, ctx) {
    discoverSetupDecl(expander, childOfType(node, 'setup_decl'), expander.pushScope(ctx));
}

function discoverSetupDecl(expander, node, ctx) {
    for (const child of kids(node)) {
        if (child.type === 'measure_decl') {
            discoverBlock(expander, childOfType(child, 'block'), expander.pushScope(ctx), true);
            continue;
        }
        discoverExpansionExpr(expander, child, ctx);
    }
}

function discoverReturnType(expander, node, ctx) {
    if (!node) return;
    for (const child of namedChildren(node)) {
        discoverExpansionType(expander, child, ctx);
    }
}

function discoverImportParamList(expander, node, ctx) {
    if (!node) return;
    for (const child of kids(node)) {
        if (child.type === 'param') {
            discoverExpansionType(expander, kids(child)[1], ctx);
            continue;
        }
        discoverExpansionType(expander, child, ctx);
    }
}

function discoverBlock(expander, node, ctx, reuseCurrentScope = false) {
    const blockCtx = reuseCurrentScope ? ctx : expander.pushScope(ctx);
    for (const stmt of kids(node)) {
        discoverExpansionExpr(expander, stmt, blockCtx);
    }
}

function discoverAltArm(expander, node, ctx) {
    const inner = expander.pushScope(ctx);
    const named = kids(node);
    const identNode = named[0]?.type === 'identifier' ? named[0] : null;
    const typeNode = named.find((child) => child.type === 'type_ident' || child.type === 'qualified_type_ref') ?? null;
    if (typeNode) discoverExpansionType(expander, typeNode, ctx);
    if (identNode?.text && identNode.text !== '_') expander.declareLocal(inner, identNode.text, null);
    discoverExpansionExpr(expander, named.at(-1), inner);
}

function discoverPipeTarget(expander, node, ctx) {
    if (!node) return;
    const argsNode = childOfType(node, 'pipe_args');
    const pathParts = kids(node).filter((child) => child !== argsNode);
    if (pathParts.length > 0) {
        discoverMaybeNamespaceBase(expander, pathParts[0], ctx);
    }
    for (const arg of namedChildren(argsNode)) {
        if (arg.type === 'pipe_arg') {
            discoverExpansionExpr(expander, kids(arg)[0], ctx);
        }
    }
}

function discoverMaybeNamespaceBase(expander, node, ctx) {
    if (!node) return;
    if (node.type === 'identifier' && !expander.isLocalValue(ctx, node.text)) {
        void expander.resolveMaybeNamespaceName(node.text, ctx);
        return;
    }
    if (node.type === 'module_ref' || node.type === 'instantiated_module_ref') {
        expander.resolveNamespaceFromModuleRef(node, ctx);
        return;
    }
    if (node.type === 'inline_module_type_path') {
        expander.resolveNamespaceFromModuleRef(node, ctx);
        return;
    }
    if (node.type === 'qualified_type_ref') {
        const moduleRef = childOfType(node, 'module_ref') ?? childOfType(node, 'instantiated_module_ref');
        if (moduleRef) expander.resolveNamespaceFromModuleRef(moduleRef, ctx);
    }
}
