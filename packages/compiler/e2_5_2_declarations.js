import { childOfType, childrenOfType, kids } from "./stage2/expansion/core.js";

export const stage252DeclarationMethods = {
    emitFnDecl(node, ctx, inModule) {
        const assocNode = childOfType(node, "associated_fn_name");
        const protocolOwner = assocNode ? kids(assocNode)[0]?.text ?? null : null;
        const resolvedProtocolOwner = protocolOwner ? this.resolveProtocolOwnerName(protocolOwner, ctx) : null;
        const name = assocNode
            ? resolvedProtocolOwner
                ? this.emitProtocolImplName(node, ctx, inModule)
                : this.emitAssociatedFnName(assocNode, ctx, inModule)
            : inModule
                ? ctx.namespace.freeValueNames.get(childOfType(node, "identifier").text)
                : childOfType(node, "identifier").text;
        const params = childrenOfType(childOfType(node, "param_list"), "param");
        const fnCtx = this.pushScope(ctx);
        for (const param of params) {
            this.declareLocal(fnCtx, childOfType(param, "identifier").text, this.describeType(kids(param)[1], ctx));
        }
        return `fun ${name}(${params.map((param) => this.emitParam(param, ctx)).join(", ")}) ${this.emitReturnType(childOfType(node, "return_type"), ctx)} ${this.emitBlock(childOfType(node, "block"), fnCtx, true)}`;
    },

    emitProtocolImplName(node, ctx, inModule) {
        const assocNode = childOfType(node, "associated_fn_name");
        const [ownerNode, nameNode] = kids(assocNode);
        if (inModule) {
            return `${ctx.namespace.typeNames.get(ownerNode.text) ?? ownerNode.text}.${nameNode.text}`;
        }
        return `${ownerNode.text}.${nameNode.text}`;
    },

    emitAssociatedFnName(node, ctx, inModule) {
        const [ownerNode, nameNode] = kids(node);
        if (inModule) {
            return ctx.namespace.assocNames.get(`${ownerNode.text}.${nameNode.text}`);
        }
        const key = `${ownerNode.text}.${nameNode.text}`;
        return this.topLevelAssocNames.get(key);
    },

    emitParam(node, ctx) {
        const [nameNode, typeNode] = kids(node);
        return `${nameNode.text}: ${this.emitType(typeNode, ctx)}`;
    },

    emitImportParamList(node, ctx) {
        if (!node) return "";
        return kids(node)
            .map((child) => child.type === "param"
                ? this.emitParam(child, ctx)
                : this.emitType(child, ctx))
            .join(", ");
    },

    emitReturnType(node, ctx) {
        if (!node || childOfType(node, "void_type")) return "void";
        const parts = [];
        for (let index = 0; index < node.children.length; index += 1) {
            const child = node.children[index];
            if (!child.isNamed || child.type === "void_type") continue;
            let part = this.emitType(child, ctx);
            if (node.children[index + 1]?.type === "#") {
                const errorType = node.children[index + 2]?.isNamed ? this.emitType(node.children[index + 2], ctx) : "null";
                part += ` # ${errorType}`;
                index += node.children[index + 2]?.isNamed ? 2 : 1;
            }
            parts.push(part);
        }
        return parts.join(", ");
    },

    emitGlobalDecl(node, ctx, inModule) {
        const [nameNode, typeNode, valueNode] = kids(node);
        const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
        return `let ${name}: ${this.emitType(typeNode, ctx)} = ${this.emitExpr(valueNode, ctx)}`;
    },

    emitJsgenDecl(node, ctx, inModule) {
        return this.emitExternDecl("escape", childOfType(node, "jsgen_lit").text, node, ctx, inModule);
    },

    emitExternDecl(keyword, sourceText, node, ctx, inModule) {
        const nameNode = childOfType(node, "identifier");
        const name = inModule ? ctx.namespace.freeValueNames.get(nameNode.text) : nameNode.text;
        const returnTypeNode = childOfType(node, "return_type");
        const prefix = sourceText ? `${keyword} ${sourceText} ${name}` : `${keyword} ${name}`;
        return returnTypeNode
            ? `${prefix}(${this.emitImportParamList(childOfType(node, "import_param_list"), ctx)}) ${this.emitReturnType(returnTypeNode, ctx)}`
            : `${prefix}: ${this.emitType(kids(node).at(-1), ctx)}`;
    },
};
