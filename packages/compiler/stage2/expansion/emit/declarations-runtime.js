import { childOfType, kids } from '../core.js';
import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class DeclarationRuntimeMixin {
    emitGlobalDecl(node, ctx, inModule) {
        const [nameNode, typeNode, valueNode] = kids(node);
        const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
        return `let ${name}: ${this.emitType(typeNode, ctx)} = ${this.emitExpr(valueNode, ctx)}`;
    }

    emitImportDecl(node, ctx, inModule) {
        return this.emitExternDecl('escape', childOfType(node, 'string_lit')?.text ?? '', node, ctx, inModule);
    }

    emitJsgenDecl(node, ctx, inModule) {
        return this.emitExternDecl('escape', childOfType(node, 'jsgen_lit').text, node, ctx, inModule);
    }

    emitExternDecl(keyword, sourceText, node, ctx, inModule) {
        const nameNode = childOfType(node, 'identifier');
        const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
        const returnTypeNode = childOfType(node, 'return_type');
        const prefix = sourceText ? `${keyword} ${sourceText} ${name}` : `${keyword} ${name}`;
        return returnTypeNode
            ? `${prefix}(${this.emitImportParamList(childOfType(node, 'import_param_list'), ctx)}) ${this.emitReturnType(returnTypeNode, ctx)}`
            : `${prefix}: ${this.emitType(kids(node).at(-1), ctx)}`;
    }
}

installMixin(ModuleExpander, DeclarationRuntimeMixin);
