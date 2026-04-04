import { childOfType, childrenOfType, kids } from '../core.js';
import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class CollectSymbolsMixin {
    collectSymbols(items, ctx, handlers) {
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
                case 'fn_decl': {
                    const assocNode = childOfType(item, 'associated_fn_name');
                    const returnInfo = this.describeReturn(childOfType(item, 'return_type'), ctx);
                    if (assocNode) {
                        const [ownerNode, nameNode] = kids(assocNode);
                        const protocolOwner = this.resolveProtocolOwnerName(ownerNode.text, ctx);
                        if (protocolOwner) {
                            handlers.onProtocolImpl?.(protocolOwner, nameNode.text, item, returnInfo);
                            break;
                        }
                        handlers.onAssoc(ownerNode.text, nameNode.text, returnInfo);
                        break;
                    }
                    const nameNode = childOfType(item, 'identifier');
                    if (nameNode) handlers.onFunction(nameNode.text, returnInfo);
                    break;
                }
                case 'global_decl': {
                    const nameNode = childOfType(item, 'identifier');
                    if (nameNode) {
                        handlers.onValue(nameNode.text, this.describeType(kids(item).at(-1), ctx));
                    }
                    break;
                }
                case 'jsgen_decl': {
                    const returnTypeNode = childOfType(item, 'return_type');
                    const nameNode = childOfType(item, 'identifier');
                    if (!nameNode) break;
                    const info = returnTypeNode
                        ? this.describeReturn(returnTypeNode, ctx)
                        : this.describeType(kids(item).at(-1), ctx);
                    if (returnTypeNode) {
                        handlers.onFunction(nameNode.text, info);
                    } else {
                        handlers.onValue(nameNode.text, info);
                    }
                    break;
                }
            }
        }
    }
}

installMixin(ModuleExpander, CollectSymbolsMixin);
