import { childOfType, childrenOfType, kids } from './stage2-expansion-shared.js';

export function collectSymbols(items, ctx, handlers) {
    for (const item of items) {
        switch (item.type) {
            case 'library_decl':
                this.collectSymbols(kids(item), ctx, handlers);
                break;
            case 'module_decl':
            case 'file_import_decl':
                break;
            case 'construct_decl':
                handlers.onConstruct?.(item);
                break;
            case 'struct_decl':
                handlers.onType(childOfType(item, 'type_ident').text);
                break;
            case 'proto_decl':
                handlers.onType?.(childOfType(item, 'type_ident').text);
                break;
            case 'type_decl':
                handlers.onType(childOfType(item, 'type_ident').text);
                for (const variant of childrenOfType(childOfType(item, 'variant_list'), 'variant')) {
                    handlers.onType(childOfType(variant, 'type_ident').text);
                }
                break;
            case 'fn_decl':
                this.collectFunctionSymbol(item, ctx, handlers);
                break;
            case 'global_decl':
                this.collectValueSymbol(item, kids(item).at(-1), ctx, handlers.onValue);
                break;
            case 'jsgen_decl': {
                const returnTypeNode = childOfType(item, 'return_type');
                this.collectValueSymbol(item, returnTypeNode ?? kids(item).at(-1), ctx, returnTypeNode ? handlers.onFunction : handlers.onValue, returnTypeNode);
                break;
            }
        }
    }
}

export function collectFunctionSymbol(node, ctx, handlers) {
    const assocNode = childOfType(node, 'associated_fn_name');
    const returnInfo = this.describeReturn(childOfType(node, 'return_type'), ctx);
    if (assocNode) {
        const [ownerNode, nameNode] = kids(assocNode);
        const protocolOwner = this.resolveProtocolOwnerName(ownerNode.text, ctx);
        if (protocolOwner) {
            handlers.onProtocolImpl?.(protocolOwner, nameNode.text, node, returnInfo);
            return;
        }
        handlers.onAssoc(ownerNode.text, nameNode.text, returnInfo);
        return;
    }
    const nameNode = childOfType(node, 'identifier');
    if (nameNode) handlers.onFunction(nameNode.text, returnInfo);
}

export function collectValueSymbol(node, valueTypeNode, ctx, register, returnTypeNode = null) {
    const nameNode = childOfType(node, 'identifier');
    if (!nameNode) return;
    register(nameNode.text, returnTypeNode ? this.describeReturn(returnTypeNode, ctx) : this.describeType(valueTypeNode, ctx));
}
