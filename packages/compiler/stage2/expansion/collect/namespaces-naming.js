import {
    childOfType,
    hashText,
    kids,
    moduleNameNode,
    snakeCase,
} from '../core.js';
import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class CollectNamespacesNamingMixin {
    mangleTopLevelAssoc(owner, member) {
        return `__utu_assoc_${snakeCase(owner)}_${snakeCase(member)}`;
    }

    mangleProtocolDispatch(protocol, member, selfType) {
        return `__utu_proto_dispatch_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
    }

    mangleProtocolSetterDispatch(protocol, member, selfType) {
        return `__utu_proto_set_dispatch_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
    }

    resolveProtocolOwnerName(name, ctx) {
        if (this.topLevelProtocolNames.has(name)) return name;
        const mapped = ctx.namespace?.typeNames.get(name);
        return mapped && this.topLevelProtocolNames.has(mapped) ? mapped : null;
    }

    getModuleRef(node) {
        const instNode = node?.type === 'instantiated_module_ref' ? node : childOfType(node, 'instantiated_module_ref');
        const target = instNode ?? node;
        const argsNode = childOfType(target, 'module_type_arg_list');
        return { name: moduleNameNode(target).text, argNodes: argsNode ? kids(argsNode) : [] };
    }

    flattenLibraryItems(items) {
        return items.flatMap((item) => item.type === 'library_decl' ? kids(item) : [item]);
    }
}

installMixin(ModuleExpander, CollectNamespacesNamingMixin);
