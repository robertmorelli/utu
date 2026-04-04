import {
    rootNode,
    namedChildren,
    childOfType,
    childrenOfType,
    findAnonBetween,
    hasAnon,
    walk,
    walkBlock,
    stringLiteralValue,
} from '../../a1_4.js';
import data from './watgen.data.json' with { type: 'json' };
import {
    EQREF_TYPE,
    HIDDEN_TAG_FIELD,
    TAGGED_ROOT_TYPE,
    protoDefaultTypeName,
    protoDispatchName,
    protoElemName,
    protoFuncTypeName,
    protoImplName,
    protocolSetterImplKey,
    protoSetterDispatchName,
    protoSetterElemName,
    protoSetterFuncTypeName,
    protoSetterTableName,
    protoSetterThunkName,
    protoSetterTrapName,
    protoTableName,
    protoThunkName,
    protoTrapName,
    protocolImplKey,
    protocolMethodKey,
    protocolSetterKey,
    substituteProtocolType,
    typeUsesNamed,
    typesEqual,
} from './protocol.js';
import {
    flattenTuple,
    literalInfo,
    namespaceInfo,
    parseAltArm,
    parseBindTargets,
    parseCapture,
    parseFnItem,
    parseForSources,
    parseIntLit,
    parseJsgenDecl,
    parseMatchArm,
    parsePipeTarget,
    parsePromoteCapture,
    parseProtoDecl,
    parseStructDecl,
    parseType,
    parseTypeDecl,
    pipeArgValues,
    pipeCallee,
} from './parse.js';
import { COMPILE_TARGETS, createStage3CompilePlan, normalizeStage3CompileTarget } from '../../a3_4.js';

export function watgen(treeOrNode, { mode = 'normal', profile = null, targetName = null, plan = null } = {}) {
    const target = normalizeStage3CompileTarget(mode);
    return new WatGen(rootNode(treeOrNode), target, profile, targetName, plan).generate();
}

const kids = namedChildren;

const SCALAR_WASM = data.scalarWasm;
const REF_WASM = data.refWasm;
const NULLABLE_REF_WASM = data.nullableRefWasm;
const REF_NULL_TARGETS = data.refNullTargets;
const I31_NS_OPS = data.i31NsOps;
const I31_NS_RETURN_TYPES = data.i31NsReturnTypes;
const SIMPLE_NS_OPS = data.simpleNsOps;
const SIMPLE_NS_RETURN_TYPES = data.simpleNsReturnTypes;
const REF_NS_OPS = data.refNsOps;
const REF_NS_RETURN_TYPES = data.refNsReturnTypes;
const DIRECT_BINARY_INSTRS = data.directBinaryInstrs;
const COMPARE_BINARY_INSTRS = data.compareBinaryInstrs;
const BINARY_INSTR_BUILDERS = {
    ...Object.fromEntries(Object.entries(DIRECT_BINARY_INSTRS).map(([op, suffix]) => [op, ({ base }) => `${base}.${suffix}`])),
    ...Object.fromEntries(Object.entries(COMPARE_BINARY_INSTRS).map(([op, suffix]) => [op, ({ base, isFloat, isUnsigned }) => isFloat ? `${base}.${suffix}` : `${base}.${suffix}_${isUnsigned ? 'u' : 's'}`])),
    '/': ({ base, isFloat, isUnsigned }) => isFloat ? `${base}.div` : `${base}.div_${isUnsigned ? 'u' : 's'}`,
    '%': ({ base, isFloat, isUnsigned }) => isFloat ? `${base}.rem` : `${base}.rem_${isUnsigned ? 'u' : 's'}`,
    '>>': ({ base, isUnsigned }) => `${base}.shr_${isUnsigned ? 'u' : 's'}`,
};
const VALID_CONST_WASM_TYPES = new Set(data.validConstWasmTypes);
const CONST_UNARY_OPS = { '-': value => -value, not: value => value ? 0 : 1, '~': value => ~value };
const CONST_BINARY_OPS = {
    '+': (left, right) => left + right,
    '-': (left, right) => left - right,
    '*': (left, right) => left * right,
    '/': (left, right, { isBig, isFloat }) => isBig ? left / right : isFloat ? left / right : Math.trunc(left / right),
    '%': (left, right) => left % right,
    '&': (left, right) => left & right,
    '|': (left, right) => left | right,
    '^': (left, right) => left ^ right,
    '<<': (left, right) => left << right,
    '>>': (left, right) => left >> right,
    '>>>': (left, right, { isBig }) => isBig ? null : left >>> right,
    '==': (left, right) => left === right ? 1 : 0,
    '!=': (left, right) => left !== right ? 1 : 0,
    '<': (left, right) => left < right ? 1 : 0,
    '>': (left, right) => left > right ? 1 : 0,
    '<=': (left, right) => left <= right ? 1 : 0,
    '>=': (left, right) => left >= right ? 1 : 0,
    and: (left, right) => left && right ? 1 : 0,
    or: (left, right) => left || right ? 1 : 0,
};
const LITERAL_INFERRED_TYPES = data.literalInferredTypes;
const LITERAL_TEXT_INFO = data.literalTextInfo;
const FLOAT_NEG_INSTRS = data.floatNegInstrs;
const SCALAR_MATCH_COMPARE_TYPES = data.scalarMatchCompareTypes;
const BINARY_BOOL_OPS = new Set(data.binaryBoolOps);
const DISCARD_HINT_NODES = new Set(data.discardHintNodes);
const VALUELESS_EXPR_TYPES = new Set(data.valuelessExprTypes);
const INFERRED_VALUE_EXPR_TYPES = new Set(data.inferredValueExprTypes);
const SCALAR_NAMES = new Set(data.scalarNames);
const I32 = data.i32Type;
const DISCARD_HINT = data.discardHint;
const COMPOUND_ASSIGN_BINARY_OPS = new Map([
    ['+=', '+'],
    ['-=', '-'],
    ['*=', '*'],
    ['/=', '/'],
    ['%=', '%'],
    ['<<=', '<<'],
    ['>>=', '>>'],
    ['>>>=', '>>>'],
    ['&=', '&'],
    ['|=', '|'],
    ['^=', '^'],
    ['and=', 'and'],
    ['or=', 'or'],
]);

const functionExportName = (node) => {
    const assocNode = childOfType(node, 'associated_fn_name');
    if (assocNode) {
        const [ownerNode, memberNode] = kids(assocNode);
        return ownerNode && memberNode ? `${ownerNode.text}.${memberNode.text}` : null;
    }
    return childOfType(node, 'identifier')?.text ?? null;
};

const TOP_LEVEL_COLLECT_HANDLERS = {
    struct_decl: (ctx, item) => {
        const decl = parseStructDecl(item);
        ctx.structDecls.push(decl);
        ctx.typeDeclMap.set(decl.name, decl);
    },
    proto_decl: (ctx, item) => {
        const decl = parseProtoDecl(item);
        ctx.protoDecls.push(decl);
        ctx.protocolNames.add(decl.name);
    },
    type_decl: (ctx, item) => {
        const decl = parseTypeDecl(item);
        ctx.typeDecls.push(decl);
        ctx.typeDeclMap.set(decl.name, decl);
        for (const variant of decl.variants) ctx.variantDecls.set(variant.name, variant);
    },
    fn_decl: (ctx, item) => {
        const fn = parseFnItem(
            item,
            ctx.mode === 'normal'
                && ctx.compilePlan.exports.some(({ exportName }) => exportName === functionExportName(item)),
        );
        ctx.fnItems.push(fn);
        ctx.callables.set(fn.name, fn);
    },
    global_decl: (ctx, item) => {
        const [name, type, value] = kids(item);
        const decl = { kind: 'global_decl', name: name.text, type: parseType(type), value };
        ctx.globalDecls.push(decl);
        ctx.globalTypeMap.set(decl.name, decl.type);
    },
    jsgen_decl: (ctx, item) => {
        const decl = parseJsgenDecl(item, ctx.jsgenImportCount++);
        if (decl.kind === 'import_fn') {
            ctx.importFns.push(decl);
            ctx.callables.set(decl.name, decl);
        }
        else {
            ctx.importVals.push(decl);
            ctx.globalTypeMap.set(decl.name, decl.type);
        }
    },
    library_decl: (ctx, item) => ctx.collectLibraryDecl(item),
    test_decl: (ctx, item) => {
        ctx.testDecls.push({ kind: 'test_decl', name: kids(item)[0].text.slice(1, -1), body: childOfType(item, 'block') });
    },
    bench_decl: (ctx, item) => {
        const setup = childOfType(item, 'setup_decl');
        const named = kids(setup);
        ctx.benchDecls.push({
            kind: 'bench_decl',
            name: kids(item)[0].text.slice(1, -1),
            setupPrelude: named.slice(0, -1),
            measureBody: childOfType(named.at(-1), 'block'),
        });
    },
};
const CONST_EXPR_HANDLERS = {
    literal: (ctx, node, wasmType) => ctx.evalConstLiteral(node, wasmType),
    paren_expr: (ctx, node, wasmType) => ctx.evalConstExpr(kids(node)[0], wasmType),
    unary_expr: (ctx, node, wasmType) => ctx.evalConstUnary(node, wasmType),
    binary_expr: (ctx, node, wasmType) => ctx.evalConstBinary(node, wasmType),
};
const CONST_LITERAL_EVALUATORS = {
    int: (literal, wasmType) => wasmType === 'i64' || wasmType === 'u64' ? BigInt(literal.value) : literal.value,
    float: literal => literal.value,
    bool: literal => literal.value ? 1 : 0,
};
const LITERAL_GENERATORS = {
    int: (ctx, literal, hint, out) => ctx.genInt(literal.value, hint, out),
    float: (ctx, literal, hint, out) => ctx.genFloat(literal.value, hint, out),
    bool: (_ctx, literal, _hint, out) => out.push(`i32.const ${literal.value ? 1 : 0}`),
    null: (ctx, _literal, hint, out) => out.push(`ref.null ${ctx.nullLiteralTarget(hint)}`),
    string: (ctx, literal, _hint, out) => out.push(`global.get $__s${ctx.internString(literal.value)}`),
};
const UNARY_GENERATORS = {
    '-': (_ctx, wasmType, out) => out.push(FLOAT_NEG_INSTRS[wasmType] ?? `${wasmType}.const -1`, ...(FLOAT_NEG_INSTRS[wasmType] ? [] : [`${wasmType}.mul`])),
    not: (_ctx, _wasmType, out) => out.push('i32.eqz'),
    '~': (_ctx, wasmType, out) => out.push(`${wasmType}.const -1`, `${wasmType}.xor`),
};
const ARRAY_NS_CALL_HANDLERS = {
    len: (ctx, args, out) => {
        ctx.genExpr(args[0], null, out);
        out.push('array.len');
    },
    new: (ctx, args, out, hint) => {
        const ctor = ctx.arrayCtorInfoFromHint(hint, 'array.new');
        ctx.genExpr(args[1], ctor.elemWasm, out);
        ctx.genExpr(args[0], 'i32', out);
        out.push(`array.new ${ctor.arrayTypeName}`);
    },
    new_fixed: (ctx, args, out, hint) => {
        const ctor = ctx.arrayCtorInfoFromHint(hint, 'array.new_fixed');
        for (const arg of args) ctx.genExpr(arg, ctor.elemWasm, out);
        out.push(`array.new_fixed ${ctor.arrayTypeName} ${args.length}`);
    },
    new_default: (ctx, args, out, hint) => {
        const ctor = ctx.arrayCtorInfoFromHint(hint, 'array.new_default');
        if (ctx.protocolNames.has(ctor.key)) {
            out.push(`i32.const ${ctx.taggedStructTags.get(protoDefaultTypeName(ctor.key))}`);
            out.push(`struct.new $${protoDefaultTypeName(ctor.key)}`);
            ctx.genExpr(args[0], 'i32', out);
            out.push(`array.new ${ctor.arrayTypeName}`);
            return;
        }
        ctx.genExpr(args[0], 'i32', out);
        out.push(`array.new_default ${ctor.arrayTypeName}`);
    },
    copy: (ctx, args, out) => {
        const [dst, di, src, si, len] = args;
        ctx.genExpr(dst, null, out);
        ctx.genExpr(di, 'i32', out);
        ctx.genExpr(src, null, out);
        ctx.genExpr(si, 'i32', out);
        ctx.genExpr(len, 'i32', out);
        out.push(`array.copy ${ctx.arrayTypeNameFromInferred(ctx.inferType(dst))} ${ctx.arrayTypeNameFromInferred(ctx.inferType(src))}`);
    },
    fill: (ctx, args, out) => {
        const [arr, off, value, len] = args;
        ctx.genExpr(arr, null, out);
        ctx.genExpr(off, 'i32', out);
        ctx.genExpr(value, null, out);
        ctx.genExpr(len, 'i32', out);
        out.push(`array.fill ${ctx.arrayTypeNameFromInferred(ctx.inferType(arr))}`);
    },
};
const NS_CALL_HANDLERS = {
    str: (ctx, method, args, out) => {
        ctx.pushArgs(args, out);
        out.push(`call $str.${method}`);
    },
    array: (ctx, method, args, out, hint) => ctx.genArrayNsCall(method, args, out, hint),
    ref: (ctx, method, args, out) => ctx.genRefNsCall(method, args, out),
    i31: (ctx, method, args, out) => {
        ctx.pushArgs(args, out);
        out.push(I31_NS_OPS[method]);
    },
};
const INFER_TYPE_HANDLERS = {
    literal: (_ctx, node) => LITERAL_INFERRED_TYPES[literalInfo(node).kind] ?? null,
    identifier: (ctx, node) => ctx.typeName(ctx.localTypes?.get(node.text) ?? ctx.globalTypeMap.get(node.text)),
    paren_expr: (ctx, node) => ctx.inferType(kids(node).at(-1)),
    unary_expr: (ctx, node) => ctx.inferType(kids(node).at(-1)),
    binary_expr: (ctx, node) => {
        const [left, right] = kids(node);
        return BINARY_BOOL_OPS.has(findAnonBetween(node, left, right))
            ? 'i32'
            : ctx.dominantType(ctx.inferType(left), ctx.inferType(right));
    },
    field_expr: (ctx, node) => {
        const [object, field] = kids(node);
        return ctx.typeName(ctx.lookupFieldType(ctx.inferType(object), field.text));
    },
    index_expr: (ctx, node) => ctx.arrayElemKeyFromInferred(ctx.inferType(kids(node)[0])),
    call_expr: (ctx, node) => {
        const callee = kids(node)[0];
        return callee.type === 'identifier'
            ? ctx.typeName(ctx.lookupCallableReturnType(callee.text))
            : callee.type === 'namespace_call_expr'
                ? ctx.inferNsCallType(namespaceInfo(callee), ctx.args(node))
                : null;
    },
    pipe_expr: (ctx, node) => {
        const target = parsePipeTarget(childOfType(node, 'pipe_target'));
        if (target.kind === 'pipe_ident') return ctx.typeName(ctx.lookupCallableReturnType(target.name));
        if (target.callee.includes('.')) {
            const [ns, method] = target.callee.split('.');
            return ctx.inferNsCallType({ ns, method }, pipeArgValues(target));
        }
        return ctx.typeName(ctx.lookupCallableReturnType(target.callee));
    },
    namespace_call_expr: (ctx, node) => ctx.inferNsCallType(namespaceInfo(node), ctx.args(node)),
    struct_init: (_ctx, node) => childOfType(node, 'type_ident').text,
    array_init: (ctx, node) => `${ctx.elemTypeKey(parseType(kids(node)[0]))}_array`,
    if_expr: (ctx, node) => ctx.inferType(kids(node)[1]),
    else_expr: (ctx, node) => {
        const [expr, fallback] = kids(node);
        const exprType = ctx.inferType(expr);
        if (fallback.type === 'fatal_expr')
            return typeof exprType === 'string' && exprType.startsWith('nullable_')
                ? exprType.slice('nullable_'.length)
                : exprType;
        const fallbackType = ctx.inferType(fallback);
        if (typeof exprType === 'string' && exprType.startsWith('nullable_')) {
            const innerType = exprType.slice('nullable_'.length);
            if (!fallbackType || fallbackType === innerType)
                return innerType;
        }
        return fallbackType || exprType;
    },
    promote_expr: (ctx, node) => ctx.inferType(kids(node)[2]),
    block: (ctx, node) => ctx.inferType(kids(node).at(-1)),
    assert_expr: () => null,
};
const INFER_NS_CALL_HANDLERS = {
    str: (_ctx, method) => {
        const builtin = STR_BUILTINS[method];
        return !builtin ? null : builtin.sig.includes('result externref') ? 'str' : 'i32';
    },
    array: (_ctx, method) => method === 'len' ? 'i32' : null,
    ref: (ctx, method, args) => REF_NS_RETURN_TYPES[method] ?? (method === 'as_non_null' || method === 'cast' ? ctx.inferType(args[0]) : null),
    i31: (_ctx, method) => I31_NS_RETURN_TYPES[method] ?? null,
};
const DEFAULT_VALUE_GENERATORS = {
    named: (ctx, type) => `ref.null ${ctx.refNullTarget(type.name)}`,
    nullable: (ctx, type) => `ref.null ${ctx.nullableNullTarget(type.inner)}`,
};
const LOCAL_COLLECT_HANDLERS = {
    bind_expr: (ctx, locals, seen, node) => {
        for (const target of parseBindTargets(node)) ctx.addLocal(locals, seen, target.name, target.type);
    },
    assign_expr: (ctx, locals, seen, node) => {
        if (!ctx.isCompoundAssign(node)) return;
        const [lhs] = kids(node);
        const valueType = ctx.assignValueType(lhs);
        ctx.addLocal(locals, seen, ctx.assignValueTempName(node), valueType);
        if (lhs.type === 'field_expr' || lhs.type === 'index_expr')
            ctx.addLocal(locals, seen, ctx.assignObjectTempName(node), ctx.tempLocalTypeForExpr(kids(lhs)[0]));
        if (lhs.type === 'index_expr')
            ctx.addLocal(locals, seen, ctx.assignIndexTempName(node), I32);
    },
    for_expr: (ctx, locals, seen, node) => {
        const sources = parseForSources(childOfType(node, 'for_sources'));
        const captures = parseCapture(childOfType(node, 'capture'));
        if (sources.length !== 1)
            throw new Error('for loops support exactly one range source in v1');
        if (captures.length > 1)
            throw new Error('for loops support at most one capture in v1');
        sources.forEach((source, i) => {
            if (source.kind !== 'range') return;
            const name = captures[i] ?? `__i_${node.id}`;
            ctx.addLocal(locals, seen, name, I32);
        });
    },
    match_expr: (ctx, locals, seen, node) => {
        const subjectType = ctx.inferredToType(ctx.inferType(kids(node)[0])) ?? I32;
        ctx.addLocal(locals, seen, ctx.scalarMatchTempName(node), subjectType);
    },
    alt_expr: (ctx, locals, seen, node) => {
        const subjectType = ctx.inferredToType(ctx.inferType(kids(node)[0])) ?? I32;
        ctx.addLocal(locals, seen, ctx.altSubjectTempName(node), subjectType);
        for (const arm of childrenOfType(node, 'alt_arm').map(parseAltArm)) {
            if (arm.pattern !== '_') ctx.addLocal(locals, seen, arm.pattern, arm.guard ? { kind: 'named', name: arm.guard } : subjectType);
        }
    },
    promote_expr: (ctx, locals, seen, node) => {
        const exprType = ctx.exprType(kids(node)[0]) ?? ctx.inferredToType(ctx.inferType(kids(node)[0])) ?? I32;
        const capture = parsePromoteCapture(kids(node)[1]);
        const ident = capture.name;
        ctx.addLocal(locals, seen, `__promote_${node.id}`, exprType);
        ctx.addLocal(locals, seen, ident, exprType.kind === 'nullable' ? exprType.inner : exprType);
    },
};
const TYPE_VISIT_HANDLERS = {
    array: (ctx, type, visitType) => {
        const key = ctx.elemTypeKey(type.elem);
        if (!ctx.arrayTypes.has(key)) ctx.arrayTypes.set(key, `$${key}_array`);
        visitType(type.elem);
    },
    nullable: (_ctx, type, visitType) => visitType(type.inner),
    exclusive: (_ctx, type, visitType) => {
        visitType(type.ok);
        visitType(type.err);
    },
    multi_return: (_ctx, type, visitType) => type.components.forEach(visitType),
    func_type: (_ctx, type, visitType) => {
        type.params.forEach(visitType);
        visitType(type.returnType);
    },
};
const BODY_TYPE_VISIT_HANDLERS = {
    bind_expr: (_ctx, node, visitType) => {
        for (const target of parseBindTargets(node)) visitType(target.type);
    },
    array_init: (_ctx, node, visitType) => visitType(parseType(kids(node)[0])),
};
const ELEM_TYPE_KEY_HANDLERS = {
    scalar: (_ctx, type) => type.name,
    named: (_ctx, type) => type.name,
    nullable: (ctx, type) => `nullable_${ctx.elemTypeKey(type.inner)}`,
    array: (ctx, type) => `${ctx.elemTypeKey(type.elem)}_array`,
};
const SCALAR_PATTERN_GENERATORS = {
    int_lit: (ctx, node, hint, out) => ctx.genInt(parseIntLit(node.text), hint, out),
    float_lit: (ctx, node, hint, out) => ctx.genFloat(parseFloat(node.text), hint, out),
};
const CALL_CALLEE_HANDLERS = {
    pipe_expr: (ctx, callee, args, out) => ctx.genPipeCall(callee, args, out),
    namespace_call_expr: (ctx, callee, args, out, hint) => ctx.genNsCall(callee, out, args, hint),
    identifier: (ctx, callee, args, out) => {
        ctx.pushArgs(args, out, ctx.callables.get(callee.text)?.params?.map(param => param.type));
        out.push(`call $${callee.text}`);
    },
    index_expr: (ctx, callee, args, out) => {
        const [object, index] = kids(callee);
        ctx.pushArgs(args, out);
        ctx.genExpr(object, null, out);
        ctx.genExpr(index, 'i32', out);
        out.push(`array.get ${ctx.arrayTypeNameFromInferred(ctx.inferType(object))}`);
        out.push('call_ref');
    },
    field_expr: (_ctx, callee) => {
        throw new Error(`Unresolved method call '.${kids(callee)[1]?.text ?? '?'}()': desugar p.method() in expand.js before watgen`);
    },
};
const ARRAY_INIT_HANDLERS = {
    new: (ctx, args, elemType, elemWasm, _arrayTypeName, out) => {
        ctx.genExpr(args[1], elemWasm, out);
        ctx.genExpr(args[0], 'i32', out);
        out.push(`array.new ${_arrayTypeName}`);
    },
    new_fixed: (ctx, args, elemType, elemWasm, _arrayTypeName, out) => {
        for (const arg of args) ctx.genExpr(arg, elemWasm, out);
        out.push(`array.new_fixed ${_arrayTypeName} ${args.length}`);
    },
    new_default: (ctx, args, elemType, _elemWasm, _arrayTypeName, out) => {
        if (elemType?.kind === 'named' && ctx.protocolNames.has(elemType.name)) {
            out.push(`i32.const ${ctx.taggedStructTags.get(protoDefaultTypeName(elemType.name))}`);
            out.push(`struct.new $${protoDefaultTypeName(elemType.name)}`);
            ctx.genExpr(args[0], 'i32', out);
            out.push(`array.new ${_arrayTypeName}`);
            return;
        }
        ctx.genExpr(args[0], 'i32', out);
        out.push(`array.new_default ${_arrayTypeName}`);
    },
};
const ASSIGN_TARGET_HANDLERS = {
    identifier: (ctx, lhs, rhs, op, assignNode, out) => {
        const name = lhs.text;
        const type = ctx.localTypes.get(name) ?? ctx.globalTypeMap.get(name) ?? I32;
        if (op !== '=') {
            ctx.genExpr(lhs, ctx.wasmType(type), out);
            out.push(`local.set $${ctx.assignValueTempName(assignNode)}`);
            ctx.genCompoundAssignValue(assignNode, rhs, type, out);
            out.push(`${ctx.localTypes.has(name) ? 'local' : 'global'}.set $${name}`);
            return;
        }
        ctx.genExpr(rhs, ctx.wasmType(type), out);
        out.push(`${ctx.localTypes.has(name) ? 'local' : 'global'}.set $${name}`);
    },
    field_expr: (ctx, lhs, rhs, op, assignNode, out) => {
        const [object, field] = kids(lhs);
        const objectType = ctx.inferType(object);
        const directField = ctx.typeFields(objectType)?.find((candidate) => candidate.name === field.text) ?? null;
        const getterHelper = objectType ? ctx.protocolHelpersByTypeMember.get(`${objectType}.${field.text}`) : null;
        const setterHelper = objectType ? ctx.protocolSetterHelpersByTypeMember.get(`${objectType}.${field.text}`) : null;
        if (directField && !directField.mut)
            throw new Error(`Field "${field.text}" on "${objectType}" must be declared "mut" before it can be assigned`);
        if (op !== '=') {
            if (!directField && !getterHelper)
                throw new Error(`Compound assignment to "${field.text}" requires a readable field or protocol getter`);
            const objectTemp = ctx.assignObjectTempName(assignNode);
            ctx.genExpr(object, null, out);
            out.push(`local.set $${objectTemp}`);
            out.push(`local.get $${objectTemp}`);
            if (getterHelper) out.push(`call $${getterHelper}`);
            else out.push(`struct.get $${objectType} $${field.text}`);
            out.push(`local.set $${ctx.assignValueTempName(assignNode)}`);
            out.push(`local.get $${objectTemp}`);
            ctx.genCompoundAssignValue(assignNode, rhs, directField?.type ?? ctx.lookupFieldType(objectType, field.text) ?? I32, out);
            if (setterHelper) {
                out.push(`call $${setterHelper}`);
                return;
            }
            out.push(`struct.set $${objectType} $${field.text}`);
            return;
        }
        if (setterHelper) {
            ctx.genExpr(object, null, out);
            ctx.genExpr(rhs, directField ? ctx.wasmType(directField.type) : null, out);
            out.push(`call $${setterHelper}`);
            return;
        }
        if (directField) {
            ctx.genExpr(object, null, out);
            ctx.genExpr(rhs, ctx.wasmType(directField.type), out);
            out.push(`struct.set $${objectType} $${field.text}`);
            return;
        }
        ctx.genExpr(object, null, out);
        ctx.genExpr(rhs, null, out);
        out.push(`struct.set $${objectType} $${field.text}`);
    },
    index_expr: (ctx, lhs, rhs, op, assignNode, out) => {
        const [object, index] = kids(lhs);
        if (op !== '=') {
            const objectTemp = ctx.assignObjectTempName(assignNode);
            const indexTemp = ctx.assignIndexTempName(assignNode);
            const arrayType = ctx.arrayTypeNameFromInferred(ctx.inferType(object));
            ctx.genExpr(object, null, out);
            out.push(`local.set $${objectTemp}`);
            ctx.genExpr(index, 'i32', out);
            out.push(`local.set $${indexTemp}`);
            out.push(`local.get $${objectTemp}`);
            out.push(`local.get $${indexTemp}`);
            out.push(`array.get ${arrayType}`);
            out.push(`local.set $${ctx.assignValueTempName(assignNode)}`);
            out.push(`local.get $${objectTemp}`);
            out.push(`local.get $${indexTemp}`);
            ctx.genCompoundAssignValue(assignNode, rhs, ctx.inferredToType(ctx.arrayElemKeyFromInferred(ctx.inferType(object))) ?? I32, out);
            out.push(`array.set ${arrayType}`);
            return;
        }
        ctx.genExpr(object, null, out);
        ctx.genExpr(index, 'i32', out);
        ctx.genExpr(rhs, null, out);
        out.push(`array.set ${ctx.arrayTypeNameFromInferred(ctx.inferType(object))}`);
    },
};
const EXPR_GENERATORS = {
    literal: (ctx, node, hint, out) => ctx.genLiteral(node, hint, out),
    identifier: (ctx, node, _hint, out) => ctx.genIdent(node, out),
    paren_expr: (ctx, node, hint, out) => ctx.genExpr(kids(node)[0], hint, out),
    assert_expr: (ctx, node, _hint, out) => ctx.genAssert(node, out),
    unary_expr: (ctx, node, hint, out) => ctx.genUnary(node, hint, out),
    binary_expr: (ctx, node, hint, out) => ctx.genBinary(node, hint, out),
    tuple_expr: (ctx, node, _hint, out) => ctx.genTuple(node, out),
    pipe_expr: (ctx, node, _hint, out) => ctx.genPipe(node, out),
    else_expr: (ctx, node, hint, out) => ctx.genElse(node, hint, out),
    call_expr: (ctx, node, hint, out) => ctx.genCall(node, out, hint),
    field_expr: (ctx, node, _hint, out) => ctx.genField(node, out),
    index_expr: (ctx, node, _hint, out) => ctx.genIndex(node, out),
    namespace_call_expr: (ctx, node, hint, out) => ctx.genNsCall(node, out, null, hint),
    ref_null_expr: (ctx, node, _hint, out) => {
        const typeNode = childOfType(node, 'type_ident') ?? childOfType(node, 'qualified_type_ref');
        out.push(`ref.null ${ctx.refNullTarget(typeNode.text)}`);
    },
    if_expr: (ctx, node, hint, out) => ctx.genIf(node, hint, out),
    promote_expr: (ctx, node, hint, out) => ctx.genPromote(node, hint, out),
    match_expr: (ctx, node, hint, out) => ctx.genMatch(node, hint, out),
    alt_expr: (ctx, node, hint, out) => ctx.genAlt(node, hint, out),
    for_expr: (ctx, node, _hint, out) => ctx.genFor(node, out),
    while_expr: (ctx, node, _hint, out) => ctx.genWhile(node, out),
    block_expr: (ctx, node, hint, out) => ctx.genBlockExpr(node, hint, out),
    break_expr: (ctx, node, _hint, out) => ctx.genBreak(node, out),
    emit_expr: (ctx, node, _hint, out) => ctx.genEmit(node, out),
    bind_expr: (ctx, node, _hint, out) => ctx.genLet(node, out),
    struct_init: (ctx, node, _hint, out) => ctx.genStructInit(node, out),
    array_init: (ctx, node, _hint, out) => ctx.genArrayInit(node, out),
    assign_expr: (ctx, node, _hint, out) => ctx.genAssign(node, out),
    fatal_expr: (_ctx, _node, _hint, out) => out.push('unreachable'),
};
export class WatGen {
    constructor(root, mode, profile = null, targetName = null, plan = null) {
        this.root = root;
        this.mode = mode;
        this.profile = profile;
        this.targetName = targetName;
        this.compilePlan = plan ?? createStage3CompilePlan(analyzeSourceLayout(root), { target: mode });
        this.sourceKind = this.compilePlan.sourceKind;

        this.structDecls = [];
        this.protoDecls = [];
        this.typeDecls = [];
        this.variantDecls = new Map();
        this.fnItems = [];
        this.globalDecls = [];
        this.importFns = [];
        this.importVals = [];
        this.testDecls = [];
        this.benchDecls = [];

        this.typeDeclMap = new Map();
        this.globalTypeMap = new Map();
        this.callables = new Map();
        this.taggedStructTags = new Map();
        this.taggedTypeProtocols = new Map();
        this.variantParents = new Map();
        this.protocolMethodMap = new Map();
        this.protocolImplMap = new Map();
        this.protocolSetterMap = new Map();
        this.protocolSetterImplMap = new Map();
        this.protocolImplementersByProtocol = new Map();
        this.protocolNames = new Set();
        this.protocolSlices = [];
        this.protocolHelpers = [];
        this.protocolThunks = [];
        this.protocolHelpersByTypeMember = new Map();
        this.protocolSetterSlices = [];
        this.protocolSetterHelpers = [];
        this.protocolSetterThunks = [];
        this.protocolSetterHelpersByTypeMember = new Map();

        this.strings = new Map();
        this.stringList = [];
        this.arrayTypes = new Map();

        this.localTypes = null;
        this.labelStack = [];
        this.currentReturnType = null;
        this.currentProfileId = null;
        this.uid = 0;
        this.jsgenImportCount = 0;
        this.metadata = {
            sourceKind: this.compilePlan.sourceKind,
            hasMain: this.compilePlan.hasMain,
            hasLibrary: this.compilePlan.hasLibrary,
            exports: this.compilePlan.target === COMPILE_TARGETS.NORMAL ? [...this.compilePlan.exports] : [],
            tests: [],
            benches: [],
        };
    }

    nextUid() { return this.uid++; }
    generate() {
        this.collect();
        this.analyzeProtocols();
        this.scanAll();
        this.metadata.strings = [...this.stringList];
        return { wat: this.emit(), metadata: this.metadata };
    }
}

export {
    rootNode,
    namedChildren,
    childOfType,
    childrenOfType,
    findAnonBetween,
    hasAnon,
    walk,
    walkBlock,
    stringLiteralValue,
    EQREF_TYPE,
    HIDDEN_TAG_FIELD,
    TAGGED_ROOT_TYPE,
    protoDefaultTypeName,
    protoDispatchName,
    protoElemName,
    protoFuncTypeName,
    protoImplName,
    protocolSetterImplKey,
    protoSetterDispatchName,
    protoSetterElemName,
    protoSetterFuncTypeName,
    protoSetterTableName,
    protoSetterThunkName,
    protoSetterTrapName,
    protoTableName,
    protoThunkName,
    protoTrapName,
    protocolImplKey,
    protocolMethodKey,
    protocolSetterKey,
    substituteProtocolType,
    typeUsesNamed,
    typesEqual,
    flattenTuple,
    literalInfo,
    namespaceInfo,
    parseAltArm,
    parseBindTargets,
    parseCapture,
    parseFnItem,
    parseForSources,
    parseIntLit,
    parseJsgenDecl,
    parseMatchArm,
    parsePipeTarget,
    parsePromoteCapture,
    parseProtoDecl,
    parseStructDecl,
    parseType,
    parseTypeDecl,
    pipeArgValues,
    pipeCallee,
    kids,
    SCALAR_WASM,
    REF_WASM,
    NULLABLE_REF_WASM,
    REF_NULL_TARGETS,
    I31_NS_OPS,
    I31_NS_RETURN_TYPES,
    SIMPLE_NS_OPS,
    SIMPLE_NS_RETURN_TYPES,
    REF_NS_OPS,
    REF_NS_RETURN_TYPES,
    DIRECT_BINARY_INSTRS,
    COMPARE_BINARY_INSTRS,
    BINARY_INSTR_BUILDERS,
    VALID_CONST_WASM_TYPES,
    CONST_UNARY_OPS,
    CONST_BINARY_OPS,
    LITERAL_INFERRED_TYPES,
    LITERAL_TEXT_INFO,
    FLOAT_NEG_INSTRS,
    SCALAR_MATCH_COMPARE_TYPES,
    BINARY_BOOL_OPS,
    DISCARD_HINT_NODES,
    VALUELESS_EXPR_TYPES,
    INFERRED_VALUE_EXPR_TYPES,
    SCALAR_NAMES,
    I32,
    DISCARD_HINT,
    COMPOUND_ASSIGN_BINARY_OPS,
    TOP_LEVEL_COLLECT_HANDLERS,
    CONST_EXPR_HANDLERS,
    CONST_LITERAL_EVALUATORS,
    LITERAL_GENERATORS,
    UNARY_GENERATORS,
    ARRAY_NS_CALL_HANDLERS,
    NS_CALL_HANDLERS,
    INFER_TYPE_HANDLERS,
    INFER_NS_CALL_HANDLERS,
    DEFAULT_VALUE_GENERATORS,
    LOCAL_COLLECT_HANDLERS,
    TYPE_VISIT_HANDLERS,
    BODY_TYPE_VISIT_HANDLERS,
    ELEM_TYPE_KEY_HANDLERS,
    SCALAR_PATTERN_GENERATORS,
    CALL_CALLEE_HANDLERS,
    ARRAY_INIT_HANDLERS,
    ASSIGN_TARGET_HANDLERS,
    EXPR_GENERATORS,
};
