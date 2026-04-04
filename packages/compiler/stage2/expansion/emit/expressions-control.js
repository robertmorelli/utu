import {
    childOfType,
    childrenOfType,
    findAnonBetween,
    hasAnon,
    kids,
} from '../core.js';
import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';

class ExpressionsControlMixin {
    emitIfExpr(node, ctx) {
        const parts = kids(node);
        const cond = parts[0];
        const thenBlock = parts[1];
        const elseBranch = parts[2];
        return `if ${this.emitExpr(cond, ctx)} ${this.emitBlock(thenBlock, this.pushScope(ctx), true)}${elseBranch ? ` else ${elseBranch.type === 'if_expr' ? this.emitExpr(elseBranch, ctx) : this.emitBlock(elseBranch, this.pushScope(ctx), true)}` : ''}`;
    }

    emitPromoteExpr(node, ctx) {
        const parts = kids(node);
        const expr = parts[0];
        const capture = parts[1];
        const ident = childOfType(capture, 'identifier');
        const thenBlock = parts[2];
        const elseBlock = parts[3] ?? null;
        const inner = this.pushScope(ctx);
        if (ident?.text && ident.text !== '_') this.declareLocal(inner, ident.text, this.stripNullable(this.inferExprInfo(expr, ctx)));
        return `promote ${this.emitExpr(expr, ctx)} |${ident.text}| ${this.emitBlock(thenBlock, inner, true)}${elseBlock ? ` else ${this.emitBlock(elseBlock, this.pushScope(ctx), true)}` : ''}`;
    }

    emitMatchExpr(node, ctx) {
        const [subject, ...arms] = kids(node);
        const renderedArms = arms.map((arm) => {
            const named = kids(arm);
            const pattern = named.length === 1 ? '_' : named[0].text;
            return `${pattern} => ${this.emitExpr(named.at(-1), ctx)},`;
        });
        return `match ${this.emitExpr(subject, ctx)} { ${renderedArms.join(' ')} }`;
    }

    emitAltExpr(node, ctx) {
        const [subject, ...arms] = kids(node);
        const renderedArms = arms.map((arm) => this.emitAltArm(arm, ctx));
        return `alt ${this.emitExpr(subject, ctx)} { ${renderedArms.join(' ')} }`;
    }

    emitAltArm(node, ctx) {
        const inner = this.pushScope(ctx);
        const named = kids(node);
        const patternNode = named[0] ?? null;
        const identNode = patternNode?.type === 'identifier' ? patternNode : null;
        const typeNode = named.find((child) => child.type === 'type_ident' || child.type === 'qualified_type_ref') ?? null;
        const exprNode = named.at(-1);
        if (identNode && identNode.text !== '_') this.declareLocal(inner, identNode.text, typeNode ? this.describeType(typeNode, ctx) : null);
        const patternText = identNode?.text ?? (hasAnon(node, '_') ? '_' : typeNode ? '_' : patternNode?.text ?? '_');
        const head = typeNode
            ? `${patternText}: ${this.emitType(typeNode, ctx)}`
            : patternText;
        return `${head} => ${this.emitExpr(exprNode, inner)},`;
    }

    emitBlockExpr(node, ctx) {
        const labelNode = childOfType(node, 'identifier');
        const blockNode = childOfType(node, 'block');
        return `${labelNode ? `${labelNode.text}: ` : ''}${this.emitBlock(blockNode, this.pushScope(ctx), true)}`;
    }

    resolveProtocolTypeMemberCall(node, argNodes, ctx) {
        const memberNode = childOfType(node, 'identifier');
        const ownerNode = kids(node).find((child) => child !== memberNode);
        const protocolName = this.resolveProtocolOwnerNode(ownerNode, ctx);
        if (!memberNode || !protocolName) return null;
        if (argNodes.length === 0) throw new Error(`Protocol call "${protocolName}.${memberNode.text}" requires a receiver as its first argument`);
        const selfInfo = this.inferExprInfo(argNodes[0], ctx);
        if (!selfInfo?.text) throw new Error(`Could not resolve the receiver type for protocol call "${protocolName}.${memberNode.text}"`);
        const method = this.topLevelProtocolMembers.get(this.protocolMemberKey(protocolName, memberNode.text));
        const setter = this.topLevelProtocolSetterMembers.get(this.protocolMemberKey(protocolName, memberNode.text));
        if (method?.arity === argNodes.length) {
            if (selfInfo.text === protocolName)
                return { callee: this.mangleProtocolDispatch(protocolName, memberNode.text, protocolName), returnInfo: method.returnInfo };
            const impl = this.topLevelProtocolImplsByKey.get(this.protocolImplKey(protocolName, memberNode.text, selfInfo.text));
            if (impl)
                return { callee: this.mangleProtocolDispatch(protocolName, memberNode.text, selfInfo.text), returnInfo: impl.returnInfo };
            if (this.topLevelTaggedTypeProtocols.get(selfInfo.text)?.has(protocolName)) {
                return { callee: this.mangleProtocolDispatch(protocolName, memberNode.text, selfInfo.text), returnInfo: method.returnInfo };
            }
            throw new Error(`Type "${selfInfo.text}" does not implement protocol "${protocolName}" method "${memberNode.text}"`);
        }
        if (setter?.arity === argNodes.length
            && (selfInfo.text === protocolName || this.topLevelTaggedTypeProtocols.get(selfInfo.text)?.has(protocolName))) {
            return { callee: this.mangleProtocolSetterDispatch(protocolName, memberNode.text, selfInfo.text === protocolName ? protocolName : selfInfo.text), returnInfo: null };
        }
        throw new Error(`Type "${selfInfo.text}" does not implement protocol "${protocolName}" method "${memberNode.text}"`);
    }

    resolveProtocolOwnerNode(node, ctx) {
        if (!node) return null;
        if (node.type === 'type_ident') return this.resolveProtocolOwnerName(node.text, ctx);
        if (!['qualified_type_ref', 'inline_module_type_path', 'instantiated_module_ref'].includes(node.type))
            return null;
        const namespace = this.resolveNamespaceFromModuleRef(node, ctx);
        const ownerName = childOfType(node, 'type_ident')?.text ?? namespace.promotedTypeName;
        if (!ownerName) return null;
        const resolvedName = namespace.typeNames.get(ownerName) ?? ownerName;
        return this.topLevelProtocolNames.has(resolvedName) ? resolvedName : null;
    }

    protocolSelfType(node, ctx) {
        const firstParam = childrenOfType(childOfType(node, 'param_list'), 'param')[0];
        const typeNode = firstParam ? kids(firstParam)[1] : null;
        return typeNode ? this.emitType(typeNode, ctx) : null;
    }

    protocolImplKey(protocol, member, selfType) {
        return `${protocol}.${member}:${selfType}`;
    }

    protocolMemberKey(protocol, member) {
        return `${protocol}.${member}`;
    }

    protocolTypeMemberKey(selfType, member) {
        return `${selfType}.${member}`;
    }

    emitForExpr(node, ctx) {
        const forCtx = this.pushScope(ctx);
        const sources = childrenOfType(childOfType(node, 'for_sources'), 'for_source');
        if (sources.length !== 1)
            throw new Error('for loops support exactly one range source in v1');
        const captureNode = childOfType(node, 'capture');
        if (childrenOfType(captureNode, 'identifier').length > 1)
            throw new Error('for loops support at most one capture in v1');
        for (const ident of childrenOfType(captureNode, 'identifier')) this.declareLocal(forCtx, ident.text);
        return `for (${this.emitForSources(childOfType(node, 'for_sources'), ctx)})${captureNode ? ` |${childrenOfType(captureNode, 'identifier').map((child) => child.text).join(', ')}|` : ''} ${this.emitBlock(childOfType(node, 'block'), forCtx, true)}`;
    }

    emitForSources(node, ctx) {
        return childrenOfType(node, 'for_source')
            .map((source) => {
                const [start, end] = kids(source);
                const operator = findAnonBetween(source, start, end) === '...' ? '...' : '..<';
                return `${this.emitExpr(start, ctx)}${operator}${this.emitExpr(end, ctx)}`;
            })
            .join(', ');
    }

    emitWhileExpr(node, ctx) {
        const condition = kids(node).find((child) => child.type !== 'block');
        return `while (${condition ? this.emitExpr(condition, ctx) : ''}) ${this.emitBlock(childOfType(node, 'block'), this.pushScope(ctx), true)}`;
    }

    emitBindExpr(node, ctx) {
        const targets = childrenOfType(node, 'bind_target');
        const valueNode = kids(node).at(-1);
        const rendered = `let ${targets.map((target) => `${childOfType(target, 'identifier').text}: ${this.emitType(kids(target).at(-1), ctx)}`).join(', ')} = ${this.emitExpr(valueNode, ctx)}`;
        for (const target of targets) this.declareLocal(ctx, childOfType(target, 'identifier').text, this.describeType(kids(target).at(-1), ctx));
        return rendered;
    }

    emitStructInit(node, ctx) {
        const typeNode = kids(node)[0];
        const typeName = this.emitType(typeNode, ctx);
        const fieldInits = childrenOfType(node, 'field_init').map((field) => `${childOfType(field, 'identifier').text}: ${this.emitExpr(kids(field).at(-1), ctx)}`);
        return `${typeName} { ${fieldInits.join(', ')} }`;
    }

    emitArrayInit(node, ctx) {
        const [typeNode, methodNode] = kids(node);
        return `array[${this.emitType(typeNode, ctx)}].${methodNode.text}(${kids(childOfType(node, 'arg_list')).map((arg) => this.emitExpr(arg, ctx)).join(', ')})`;
    }

    emitBlock(node, ctx, reuseCurrentScope = false) {
        const blockCtx = reuseCurrentScope ? ctx : this.pushScope(ctx);
        const statements = [];
        for (const stmt of kids(node)) {
            statements.push(`${this.emitExpr(stmt, blockCtx)};`);
        }
        return `{\n${statements.map((stmt) => `    ${stmt}`).join('\n')}\n}`;
    }
}

installMixin(ModuleExpander, ExpressionsControlMixin);
