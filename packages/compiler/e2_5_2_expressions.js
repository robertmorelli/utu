import {
    BUILTIN_METHOD_RETURN_INFO,
    childOfType,
    childrenOfType,
    findAnonBetween,
    hasAnon,
    kids,
    namedChildren,
    sameTypeInfo,
} from "./stage2/expansion/core.js";

export const stage252ExpressionMethods = {
    resolveBareValue(name, ctx) {
        if (this.isLocalValue(ctx, name)) return name;
        if (ctx.namespace?.freeValueNames.has(name)) return ctx.namespace.freeValueNames.get(name);
        if (this.topLevelValueNames.has(name)) return name;
        if (ctx.openValues.has(name)) return ctx.openValues.get(name).freeValueNames.get(name);
        return name;
    },

    resolveValueType(name, ctx) {
        const local = this.lookupLocal(ctx, name);
        if (local !== undefined) return local;
        if (ctx.namespace?.freeValueTypes.has(name)) return ctx.namespace.freeValueTypes.get(name);
        if (this.topLevelValueTypes.has(name)) return this.topLevelValueTypes.get(name);
        if (ctx.openValues.has(name)) return ctx.openValues.get(name).freeValueTypes.get(name) ?? null;
        return null;
    },

    resolveFunctionReturn(name, ctx) {
        if (ctx.namespace?.freeFnReturns.has(name)) return ctx.namespace.freeFnReturns.get(name);
        if (this.topLevelFnReturns.has(name)) return this.topLevelFnReturns.get(name);
        if (ctx.openValues.has(name)) return ctx.openValues.get(name).freeFnReturns.get(name) ?? null;
        return null;
    },

    resolveNamespaceValueReturn(namespace, memberName) {
        return namespace?.freeFnReturns.get(memberName)
            ?? (namespace?.promotedTypeName ? namespace.assocReturns.get(`${namespace.promotedTypeName}.${memberName}`) : null)
            ?? null;
    },

    resolveAssociatedByOwner(ownerName, memberName, ctx) {
        const entry = this.resolveAssociatedEntry(ownerName, memberName, ctx);
        return entry?.callee;
    },

    resolveNamespaceValue(namespace, memberName) {
        return namespace?.freeValueNames.get(memberName)
            ?? (namespace?.promotedTypeName ? namespace.assocNames.get(`${namespace.promotedTypeName}.${memberName}`) : null)
            ?? null;
    },

    resolveNamespaceAssoc(namespace, ownerName, memberName) {
        const key = `${ownerName}.${memberName}`;
        const callee = namespace?.assocNames.get(key);
        return callee ? { callee, returnInfo: namespace.assocReturns.get(key) ?? null } : null;
    },

    resolveAssociatedEntry(ownerName, memberName, ctx) {
        const local = this.resolveNamespaceAssoc(ctx.namespace, ownerName, memberName);
        if (local) return local;
        if (this.topLevelAssocNames.has(`${ownerName}.${memberName}`)) {
            return {
                callee: this.topLevelAssocNames.get(`${ownerName}.${memberName}`),
                returnInfo: this.topLevelAssocReturns.get(`${ownerName}.${memberName}`) ?? null,
            };
        }
        if (ctx.openTypes.has(ownerName)) {
            const opened = this.resolveNamespaceAssoc(ctx.openTypes.get(ownerName), ownerName, memberName);
            if (opened) return opened;
        }
        const promoted = this.resolveMaybeNamespaceName(ownerName, ctx);
        return promoted?.promotedTypeName ? this.resolveNamespaceAssoc(promoted, promoted.promotedTypeName, memberName) : null;
    },

    resolveAssociatedEntryFromInfo(info, memberName, ctx) {
        if (!info?.owner) return null;
        if (info.namespace) {
            const resolved = this.resolveNamespaceAssoc(info.namespace, info.owner, memberName);
            if (resolved) return resolved;
        }
        return this.resolveAssociatedEntry(info.owner, memberName, ctx);
    },

    resolveProtocolDispatchFromInfo(info, memberName, totalArgCount = 1) {
        if (!info?.text) return null;
        if (this.topLevelProtocolNames.has(info.text)) {
            const member = this.topLevelProtocolMembers.get(this.protocolMemberKey(info.text, memberName));
            return member?.arity === totalArgCount
                ? { callee: this.mangleProtocolDispatch(info.text, memberName, info.text), returnInfo: member.returnInfo }
                : null;
        }
        const entries = this.topLevelProtocolImplsByTypeMember.get(this.protocolTypeMemberKey(info.text, memberName)) ?? [];
        const matchingEntries = entries.filter((entry) => (this.topLevelProtocolMembers.get(this.protocolMemberKey(entry.protocol, entry.member))?.arity ?? 1) === totalArgCount);
        if (matchingEntries.length === 0) {
            const protocols = new Set([...(this.topLevelTaggedTypeProtocols.get(info.text) ?? new Set())]
                .filter((protocol) => this.topLevelProtocolMembers.get(this.protocolMemberKey(protocol, memberName))?.arity === totalArgCount));
            const matches = [...protocols];
            if (matches.length === 0) return null;
            if (matches.length > 1) {
                throw new Error(`Ambiguous protocol method ".${memberName}()" on type "${info.text}" across protocols: ${matches.sort().join(", ")}`);
            }
            const protocol = matches[0];
            return {
                callee: this.mangleProtocolDispatch(protocol, memberName, info.text),
                returnInfo: this.topLevelProtocolMembers.get(this.protocolMemberKey(protocol, memberName))?.returnInfo ?? null,
            };
        }
        if (matchingEntries.length > 1) {
            const protocols = matchingEntries.map((entry) => entry.protocol).sort().join(", ");
            throw new Error(`Ambiguous protocol method ".${memberName}()" on type "${info.text}" across protocols: ${protocols}`);
        }
        const entry = matchingEntries[0];
        return { callee: this.mangleProtocolDispatch(entry.protocol, entry.member, entry.selfType), returnInfo: entry.returnInfo };
    },

    inferJoinedExprInfo(nodes, ctx) {
        const infos = nodes.map((node) => this.inferExprInfo(node, ctx)).filter(Boolean);
        if (infos.length === 0) return null;
        const [first] = infos;
        return infos.every((info) => sameTypeInfo(info, first)) ? first : first;
    },

    resolveFieldExprInfo(node, ctx) {
        const [baseNode, memberNode] = kids(node);
        const baseInfo = this.inferExprInfo(baseNode, ctx);
        if (!baseInfo?.text || !memberNode) return null;
        if (this.topLevelProtocolNames.has(baseInfo.text)) {
            return this.topLevelProtocolMembers.get(this.protocolMemberKey(baseInfo.text, memberNode.text))?.returnInfo ?? null;
        }
        const field = this.topLevelStructFieldTypes.get(baseInfo.text)?.get(memberNode.text) ?? null;
        if (field) return field.typeInfo;
        const protocols = [...(this.topLevelTaggedTypeProtocols.get(baseInfo.text) ?? new Set())]
            .filter((protocol) => this.topLevelProtocolMembers.get(this.protocolMemberKey(protocol, memberNode.text))?.getter);
        if (protocols.length !== 1) return null;
        return this.topLevelProtocolMembers.get(this.protocolMemberKey(protocols[0], memberNode.text))?.returnInfo ?? null;
    },

    inferExprInfo(node, ctx) {
        if (!node) return null;
        switch (node.type) {
            case "identifier":
                return this.resolveValueType(node.text, ctx);
            case "paren_expr":
                return this.inferExprInfo(kids(node)[0], ctx);
            case "struct_init":
                return this.describeType(kids(node)[0], ctx);
            case "field_expr":
                return this.resolveFieldExprInfo(node, ctx);
            case "index_expr": {
                const objectInfo = this.inferExprInfo(kids(node)[0], ctx);
                const elemText = objectInfo?.text?.startsWith("array[") ? objectInfo.text.slice(6, -1) : null;
                if (!elemText) return null;
                return objectInfo?.text?.startsWith("array[")
                    ? { text: elemText, owner: this.topLevelTypeNames.has(elemText) || this.topLevelProtocolNames.has(elemText) ? elemText : null, namespace: null }
                    : null;
            }
            case "call_expr":
                return this.inferCallExprInfo(node, ctx);
            case "promoted_module_call_expr":
                return this.resolveNamespaceValueReturn(this.resolveNamespaceFromModuleRef(node, ctx), childOfType(node, "identifier")?.text);
            case "if_expr":
                return this.inferJoinedExprInfo([kids(node)[1], kids(node)[2]].filter(Boolean), ctx);
            case "else_expr":
                return this.inferExprInfo(kids(node)[1], ctx) ?? this.stripNullable(this.inferExprInfo(kids(node)[0], ctx));
            case "promote_expr":
                return this.inferExprInfo(kids(node)[2], ctx) ?? this.inferExprInfo(kids(node)[3], ctx) ?? null;
            case "match_expr":
                return this.inferJoinedExprInfo(childrenOfType(node, "match_arm").map((arm) => kids(arm).at(-1)), ctx);
            case "alt_expr":
                return this.inferJoinedExprInfo(childrenOfType(node, "alt_arm").map((arm) => kids(arm).at(-1)), ctx);
            case "block_expr":
                return this.inferExprInfo(childOfType(node, "block"), ctx);
            case "block": {
                const body = kids(node);
                return body.length ? this.inferExprInfo(body.at(-1), ctx) : null;
            }
            default:
                return null;
        }
    },

    inferCallExprInfo(node, ctx) {
        const callee = kids(node)[0];
        const argNodes = kids(childOfType(node, "arg_list"));
        if (!callee) return null;
        if (callee.type === "identifier") return this.resolveFunctionReturn(callee.text, ctx);
        if (callee.type === "type_member_expr") {
            const protocolCall = this.resolveProtocolTypeMemberCall(callee, argNodes, ctx);
            if (protocolCall) return protocolCall.returnInfo;
            const memberNode = childOfType(callee, "identifier");
            const ownerNode = kids(callee).find((child) => child !== memberNode);
            return memberNode ? this.resolveAssociatedReturn(ownerNode, memberNode.text, ctx) : null;
        }
        if (callee.type === "field_expr") {
            const [baseNode, memberNode] = kids(callee);
            if (baseNode?.type === "identifier" && memberNode && !this.isLocalValue(ctx, baseNode.text)) {
                return this.resolveNamespaceValueReturn(this.resolveMaybeNamespaceName(baseNode.text, ctx), memberNode.text);
            }
            return this.resolveMethodCall(callee, ctx, argNodes.length + 1)?.returnInfo ?? null;
        }
        if (callee.type === "promoted_module_call_expr") {
            return this.resolveNamespaceValueReturn(this.resolveNamespaceFromModuleRef(callee, ctx), childOfType(callee, "identifier")?.text);
        }
        return null;
    },

    resolveAssociatedReturn(ownerNode, memberName, ctx) {
        if (!ownerNode) return null;
        if (["qualified_type_ref", "inline_module_type_path", "instantiated_module_ref"].includes(ownerNode.type)) {
            const namespace = this.resolveNamespaceFromModuleRef(ownerNode, ctx);
            const ownerName = childOfType(ownerNode, "type_ident")?.text ?? namespace.promotedTypeName;
            return this.resolveNamespaceAssoc(namespace, ownerName, memberName)?.returnInfo ?? null;
        }
        return this.resolveAssociatedEntry(ownerNode.text, memberName, ctx)?.returnInfo ?? null;
    },

    emitCallExpr(node, ctx) {
        const callee = kids(node)[0];
        const argNodes = kids(childOfType(node, "arg_list"));
        const args = argNodes.map((arg) => this.emitExpr(arg, ctx));
        if (callee?.type === "field_expr") {
            const moduleValue = this.resolveModuleField(callee, ctx);
            if (moduleValue) return `${moduleValue}(${args.join(", ")})`;
            const method = this.resolveMethodCall(callee, ctx, argNodes.length + 1);
            if (method) return `${method.callee}(${[this.emitExpr(kids(callee)[0], ctx), ...args].join(", ")})`;
        }
        if (callee?.type === "type_member_expr") {
            const protocolCall = this.resolveProtocolTypeMemberCall(callee, argNodes, ctx);
            if (protocolCall) return `${protocolCall.callee}(${args.join(", ")})`;
            return `${this.resolveTypeMemberExpr(callee, ctx)}(${args.join(", ")})`;
        }
        return `${this.emitExpr(callee, ctx)}(${args.join(", ")})`;
    },

    emitFieldExpr(node, ctx) {
        const moduleValue = this.resolveModuleField(node, ctx);
        if (moduleValue) return moduleValue;
        return `${this.emitExpr(kids(node)[0], ctx)}.${kids(node)[1].text}`;
    },

    resolveMethodCall(node, ctx, totalArgCount = 1) {
        const [baseNode, memberNode] = kids(node);
        const info = this.inferExprInfo(baseNode, ctx);
        if (!info?.text || !memberNode) return null;
        const builtin = this.resolveBuiltinMethodDispatch(info, memberNode.text);
        if (builtin) return builtin;
        if (!info.owner) return null;
        const direct = this.resolveAssociatedEntryFromInfo(info, memberNode.text, ctx);
        return direct
            ?? this.resolveProtocolDispatchFromInfo(info, memberNode.text, totalArgCount)
            ?? null;
    },

    resolveBuiltinMethodDispatch(info, memberName) {
        if (!info?.text?.startsWith("array[")) return null;
        const builtinKey = `array.${memberName}`;
        if (!BUILTIN_METHOD_RETURN_INFO.has(builtinKey)) return null;
        return {
            callee: builtinKey,
            returnInfo: BUILTIN_METHOD_RETURN_INFO.get(builtinKey),
        };
    },

    resolveModuleField(node, ctx) {
        const [baseNode, memberNode] = kids(node);
        if (baseNode?.type !== "identifier" || !memberNode || this.isLocalValue(ctx, baseNode.text)) return null;
        const namespace = this.resolveMaybeNamespaceName(baseNode.text, ctx);
        return this.resolveNamespaceValue(namespace, memberNode.text);
    },

    resolveTypeMemberExpr(node, ctx) {
        const memberNode = childOfType(node, "identifier");
        const ownerNode = kids(node).find((child) => child !== memberNode);
        if (!memberNode || !ownerNode) return undefined;
        if (memberNode.text === "null") {
            if (["type_ident", "qualified_type_ref", "inline_module_type_path", "instantiated_module_ref"].includes(ownerNode.type)) {
                return `ref.null ${this.emitType(ownerNode, ctx)}`;
            }
            return undefined;
        }
        if (["qualified_type_ref", "inline_module_type_path", "instantiated_module_ref"].includes(ownerNode.type)) {
            const namespace = this.resolveNamespaceFromModuleRef(ownerNode, ctx);
            const ownerName = childOfType(ownerNode, "type_ident")?.text ?? namespace.promotedTypeName;
            return this.resolveNamespaceAssoc(namespace, ownerName, memberNode.text)?.callee;
        }
        return this.resolveAssociatedEntry(ownerNode.text, memberNode.text, ctx)?.callee;
    },

    emitNamespaceCallExpr(node, ctx) {
        const namespace = node.children[0]?.text ?? "builtin";
        const methodNode = childOfType(node, "identifier");
        const argsNode = childOfType(node, "arg_list");
        return `${namespace}.${methodNode.text}${hasAnon(node, "(") ? `(${kids(argsNode).map((arg) => this.emitExpr(arg, ctx)).join(", ")})` : ""}`;
    },

    emitPromotedModuleCall(node, ctx) {
        const memberNode = childOfType(node, "identifier");
        const argsNode = childOfType(node, "arg_list");
        const namespace = this.resolveNamespaceFromModuleRef(node, ctx);
        const callee = this.resolveNamespaceValue(namespace, memberNode.text);
        return `${callee}(${kids(argsNode).map((arg) => this.emitExpr(arg, ctx)).join(", ")})`;
    },

    emitPipeExpr(node, ctx) {
        const valueNode = kids(node)[0];
        const targetNode = childOfType(node, "pipe_target");
        const { callee, args } = this.parsePipeTarget(targetNode, ctx);
        const value = this.emitExpr(valueNode, ctx);
        const placeholderCount = args.filter((arg) => arg.kind === "placeholder").length;
        const finalArgs = placeholderCount === 0
            ? [value, ...args.map((arg) => this.emitExpr(arg.node, ctx))]
            : args.map((arg) => arg.kind === "placeholder" ? value : this.emitExpr(arg.node, ctx));
        return `${callee}(${finalArgs.join(", ")})`;
    },

    parsePipeTarget(node, ctx) {
        const argsNode = childOfType(node, "pipe_args");
        const pathParts = kids(node).filter((child) => child !== argsNode);
        const args = this.parsePipeArgs(argsNode);
        if (pathParts.length === 1) {
            const child = pathParts[0];
            if (child.type === "identifier") return { callee: this.resolveBareValue(child.text, ctx), args };
            if (["module_ref", "instantiated_module_ref"].includes(child.type)) {
                const { name, argNodes } = this.getModuleRef(child);
                if (argNodes.length === 0 && !ctx.aliases.has(name) && !this.moduleTemplates.has(name)) {
                    return { callee: this.resolveBareValue(name, ctx), args };
                }
            }
        }
        if (pathParts.length === 2) {
            const [first, second] = pathParts;
            if (first.type === "type_ident") {
                return { callee: this.resolveAssociatedByOwner(first.text, second.text, ctx), args };
            }
            if (first.type === "identifier") {
                const namespace = this.resolveMaybeNamespaceName(first.text, ctx);
                if (namespace) {
                    return { callee: this.resolveNamespaceValue(namespace, second.text), args };
                }
            }
            if (["module_ref", "instantiated_module_ref"].includes(first.type)) {
                const namespace = this.resolveNamespaceFromModuleRef(first, ctx);
                return { callee: this.resolveNamespaceValue(namespace, second.text), args };
            }
        }
        if (pathParts.length === 3 && pathParts[0].type === "identifier" && pathParts[1].type === "type_ident") {
            const namespace = this.resolveMaybeNamespaceName(pathParts[0].text, ctx);
            const ownerName = pathParts[1].text;
            const memberName = pathParts[2].text;
            return { callee: namespace?.assocNames.get(`${ownerName}.${memberName}`), args };
        }
        if (pathParts.length === 3 && ["module_ref", "instantiated_module_ref"].includes(pathParts[0].type)) {
            const namespace = this.resolveNamespaceFromModuleRef(pathParts[0], ctx);
            const ownerName = pathParts[1].text;
            const memberName = pathParts[2].text;
            return { callee: namespace.assocNames.get(`${ownerName}.${memberName}`), args };
        }
        return { callee: undefined, args };
    },

    parsePipeArgs(node) {
        if (!node) return [];
        return namedChildren(node)
            .flatMap((child) => ["pipe_args_no_placeholder", "pipe_args_with_placeholder"].includes(child.type) ? namedChildren(child) : [child])
            .filter((child) => child.type === "pipe_arg" || child.type === "pipe_arg_placeholder")
            .map((child) => child.type === "pipe_arg_placeholder"
                ? { kind: "placeholder" }
                : { kind: "arg", node: kids(child)[0] });
    },

    emitExpr(node, ctx) {
        switch (node.type) {
            case "literal":
                return node.text;
            case "identifier":
                return this.resolveBareValue(node.text, ctx);
            case "instantiated_module_ref":
                return node.text;
            case "promoted_module_call_expr":
                return this.emitPromotedModuleCall(node, ctx);
            case "paren_expr":
                return `(${this.emitExpr(kids(node)[0], ctx)})`;
            case "assert_expr":
                return `assert ${this.emitExpr(kids(node)[0], ctx)}`;
            case "unary_expr": {
                const op = childOfType(node, "unary_op").text;
                const exprNode = kids(node).find((child) => child.type !== "unary_op");
                return op === "not"
                    ? `not ${this.emitExpr(exprNode, ctx)}`
                    : `${op}${this.emitExpr(exprNode, ctx)}`;
            }
            case "binary_expr": {
                const [left, right] = kids(node);
                return `${this.emitExpr(left, ctx)} ${findAnonBetween(node, left, right)} ${this.emitExpr(right, ctx)}`;
            }
            case "tuple_expr":
                return `(${kids(node).map((child) => this.emitExpr(child, ctx)).join(", ")})`;
            case "pipe_expr":
                return this.emitPipeExpr(node, ctx);
            case "else_expr":
                return `${this.emitExpr(kids(node)[0], ctx)} \\ ${this.emitExpr(kids(node)[1], ctx)}`;
            case "call_expr":
                return this.emitCallExpr(node, ctx);
            case "type_member_expr":
                return this.resolveTypeMemberExpr(node, ctx);
            case "field_expr":
                return this.emitFieldExpr(node, ctx);
            case "index_expr":
                return `${this.emitExpr(kids(node)[0], ctx)}[${this.emitExpr(kids(node)[1], ctx)}]`;
            case "namespace_call_expr":
                return this.emitNamespaceCallExpr(node, ctx);
            case "ref_null_expr":
                return `ref.null ${this.emitType(kids(node)[0], ctx)}`;
            case "if_expr":
                return this.emitIfExpr(node, ctx);
            case "promote_expr":
                return this.emitPromoteExpr(node, ctx);
            case "match_expr":
                return this.emitMatchExpr(node, ctx);
            case "alt_expr":
                return this.emitAltExpr(node, ctx);
            case "block_expr":
                return this.emitBlockExpr(node, ctx);
            case "for_expr":
                return this.emitForExpr(node, ctx);
            case "while_expr":
                return this.emitWhileExpr(node, ctx);
            case "break_expr":
                return "break";
            case "emit_expr":
                return `emit ${this.emitExpr(kids(node)[0], ctx)}`;
            case "bind_expr":
                return this.emitBindExpr(node, ctx);
            case "struct_init":
                return this.emitStructInit(node, ctx);
            case "array_init":
                return this.emitArrayInit(node, ctx);
            case "assign_expr":
                return `${this.emitExpr(kids(node)[0], ctx)} ${findAnonBetween(node, kids(node)[0], kids(node)[1])} ${this.emitExpr(kids(node)[1], ctx)}`;
            case "fatal_expr":
                return "fatal";
            case "block":
                return this.emitBlock(node, this.pushScope(ctx), true);
            default:
                return node.text;
        }
    },

    emitIfExpr(node, ctx) {
        const parts = kids(node);
        const cond = parts[0];
        const thenBlock = parts[1];
        const elseBranch = parts[2];
        return `if ${this.emitExpr(cond, ctx)} ${this.emitBlock(thenBlock, this.pushScope(ctx), true)}${elseBranch ? ` else ${elseBranch.type === "if_expr" ? this.emitExpr(elseBranch, ctx) : this.emitBlock(elseBranch, this.pushScope(ctx), true)}` : ""}`;
    },

    emitPromoteExpr(node, ctx) {
        const parts = kids(node);
        const expr = parts[0];
        const capture = parts[1];
        const ident = childOfType(capture, "identifier");
        const thenBlock = parts[2];
        const elseBlock = parts[3] ?? null;
        const inner = this.pushScope(ctx);
        if (ident?.text && ident.text !== "_") this.declareLocal(inner, ident.text, this.stripNullable(this.inferExprInfo(expr, ctx)));
        return `promote ${this.emitExpr(expr, ctx)} |${ident.text}| ${this.emitBlock(thenBlock, inner, true)}${elseBlock ? ` else ${this.emitBlock(elseBlock, this.pushScope(ctx), true)}` : ""}`;
    },

    emitMatchExpr(node, ctx) {
        const [subject, ...arms] = kids(node);
        const renderedArms = arms.map((arm) => {
            const named = kids(arm);
            const pattern = named.length === 1 ? "_" : named[0].text;
            return `${pattern} => ${this.emitExpr(named.at(-1), ctx)},`;
        });
        return `match ${this.emitExpr(subject, ctx)} { ${renderedArms.join(" ")} }`;
    },

    emitAltExpr(node, ctx) {
        const [subject, ...arms] = kids(node);
        const renderedArms = arms.map((arm) => this.emitAltArm(arm, ctx));
        return `alt ${this.emitExpr(subject, ctx)} { ${renderedArms.join(" ")} }`;
    },

    emitAltArm(node, ctx) {
        const inner = this.pushScope(ctx);
        const named = kids(node);
        const patternNode = named[0] ?? null;
        const identNode = patternNode?.type === "identifier" ? patternNode : null;
        const typeNode = named.find((child) => child.type === "type_ident" || child.type === "qualified_type_ref") ?? null;
        const exprNode = named.at(-1);
        if (identNode && identNode.text !== "_") this.declareLocal(inner, identNode.text, typeNode ? this.describeType(typeNode, ctx) : null);
        const patternText = identNode?.text ?? (hasAnon(node, "_") ? "_" : typeNode ? "_" : patternNode?.text ?? "_");
        const head = typeNode
            ? `${patternText}: ${this.emitType(typeNode, ctx)}`
            : patternText;
        return `${head} => ${this.emitExpr(exprNode, inner)},`;
    },

    emitBlockExpr(node, ctx) {
        const labelNode = childOfType(node, "identifier");
        const blockNode = childOfType(node, "block");
        return `${labelNode ? `${labelNode.text}: ` : ""}${this.emitBlock(blockNode, this.pushScope(ctx), true)}`;
    },

    resolveProtocolTypeMemberCall(node, argNodes, ctx) {
        const memberNode = childOfType(node, "identifier");
        const ownerNode = kids(node).find((child) => child !== memberNode);
        const protocolName = this.resolveProtocolOwnerNode(ownerNode, ctx);
        if (!memberNode || !protocolName) return null;
        if (argNodes.length === 0) throw new Error(`Protocol call "${protocolName}.${memberNode.text}" requires a receiver as its first argument`);
        const selfInfo = this.inferExprInfo(argNodes[0], ctx);
        if (!selfInfo?.text) throw new Error(`Could not resolve the receiver type for protocol call "${protocolName}.${memberNode.text}"`);
        const method = this.topLevelProtocolMembers.get(this.protocolMemberKey(protocolName, memberNode.text));
        const setter = this.topLevelProtocolSetterMembers.get(this.protocolMemberKey(protocolName, memberNode.text));
        if (method?.arity === argNodes.length) {
            if (selfInfo.text === protocolName) {
                return { callee: this.mangleProtocolDispatch(protocolName, memberNode.text, protocolName), returnInfo: method.returnInfo };
            }
            const impl = this.topLevelProtocolImplsByKey.get(this.protocolImplKey(protocolName, memberNode.text, selfInfo.text));
            if (impl) {
                return { callee: this.mangleProtocolDispatch(protocolName, memberNode.text, selfInfo.text), returnInfo: impl.returnInfo };
            }
            if (this.topLevelTaggedTypeProtocols.get(selfInfo.text)?.has(protocolName)) {
                return { callee: this.mangleProtocolDispatch(protocolName, memberNode.text, selfInfo.text), returnInfo: method.returnInfo };
            }
            throw new Error(`Type "${selfInfo.text}" does not implement protocol "${protocolName}" method "${memberNode.text}"`);
        }
        if (setter?.arity === argNodes.length
            && (selfInfo.text === protocolName || this.topLevelTaggedTypeProtocols.get(selfInfo.text)?.has(protocolName))) {
            return {
                callee: this.mangleProtocolSetterDispatch(protocolName, memberNode.text, selfInfo.text === protocolName ? protocolName : selfInfo.text),
                returnInfo: null,
            };
        }
        throw new Error(`Type "${selfInfo.text}" does not implement protocol "${protocolName}" method "${memberNode.text}"`);
    },

    resolveProtocolOwnerNode(node, ctx) {
        if (!node) return null;
        if (node.type === "type_ident") return this.resolveProtocolOwnerName(node.text, ctx);
        if (!["qualified_type_ref", "inline_module_type_path", "instantiated_module_ref"].includes(node.type)) return null;
        const namespace = this.resolveNamespaceFromModuleRef(node, ctx);
        const ownerName = childOfType(node, "type_ident")?.text ?? namespace.promotedTypeName;
        if (!ownerName) return null;
        const resolvedName = namespace.typeNames.get(ownerName) ?? ownerName;
        return this.topLevelProtocolNames.has(resolvedName) ? resolvedName : null;
    },

    protocolSelfType(node, ctx) {
        const firstParam = childrenOfType(childOfType(node, "param_list"), "param")[0];
        const typeNode = firstParam ? kids(firstParam)[1] : null;
        return typeNode ? this.emitType(typeNode, ctx) : null;
    },

    protocolImplKey(protocol, member, selfType) {
        return `${protocol}.${member}:${selfType}`;
    },

    protocolMemberKey(protocol, member) {
        return `${protocol}.${member}`;
    },

    protocolTypeMemberKey(selfType, member) {
        return `${selfType}.${member}`;
    },

    emitForExpr(node, ctx) {
        const forCtx = this.pushScope(ctx);
        const sources = childrenOfType(childOfType(node, "for_sources"), "for_source");
        if (sources.length !== 1) throw new Error("for loops support exactly one range source in v1");
        const captureNode = childOfType(node, "capture");
        if (childrenOfType(captureNode, "identifier").length > 1) throw new Error("for loops support at most one capture in v1");
        for (const ident of childrenOfType(captureNode, "identifier")) this.declareLocal(forCtx, ident.text);
        return `for (${this.emitForSources(childOfType(node, "for_sources"), ctx)})${captureNode ? ` |${childrenOfType(captureNode, "identifier").map((child) => child.text).join(", ")}|` : ""} ${this.emitBlock(childOfType(node, "block"), forCtx, true)}`;
    },

    emitForSources(node, ctx) {
        return childrenOfType(node, "for_source")
            .map((source) => {
                const [start, end] = kids(source);
                const operator = findAnonBetween(source, start, end) === "..." ? "..." : "..<";
                return `${this.emitExpr(start, ctx)}${operator}${this.emitExpr(end, ctx)}`;
            })
            .join(", ");
    },

    emitWhileExpr(node, ctx) {
        const condition = kids(node).find((child) => child.type !== "block");
        return `while (${condition ? this.emitExpr(condition, ctx) : ""}) ${this.emitBlock(childOfType(node, "block"), this.pushScope(ctx), true)}`;
    },

    emitBindExpr(node, ctx) {
        const targets = childrenOfType(node, "bind_target");
        const valueNode = kids(node).at(-1);
        const rendered = `let ${targets.map((target) => `${childOfType(target, "identifier").text}: ${this.emitType(kids(target).at(-1), ctx)}`).join(", ")} = ${this.emitExpr(valueNode, ctx)}`;
        for (const target of targets) this.declareLocal(ctx, childOfType(target, "identifier").text, this.describeType(kids(target).at(-1), ctx));
        return rendered;
    },

    emitStructInit(node, ctx) {
        const typeNode = kids(node)[0];
        const typeName = this.emitType(typeNode, ctx);
        const fieldInits = childrenOfType(node, "field_init").map((field) => `${childOfType(field, "identifier").text}: ${this.emitExpr(kids(field).at(-1), ctx)}`);
        return `${typeName} { ${fieldInits.join(", ")} }`;
    },

    emitArrayInit(node, ctx) {
        const [typeNode, methodNode] = kids(node);
        return `array[${this.emitType(typeNode, ctx)}].${methodNode.text}(${kids(childOfType(node, "arg_list")).map((arg) => this.emitExpr(arg, ctx)).join(", ")})`;
    },

    emitBlock(node, ctx, reuseCurrentScope = false) {
        const blockCtx = reuseCurrentScope ? ctx : this.pushScope(ctx);
        const statements = [];
        for (const stmt of kids(node)) {
            statements.push(`${this.emitExpr(stmt, blockCtx)};`);
        }
        return `{\n${statements.map((stmt) => `    ${stmt}`).join("\n")}\n}`;
    },
};
