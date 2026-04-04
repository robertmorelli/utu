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
} from "../../frontend/tree.js";
import data from "../../../../jsondata/watgen.data.json" with { type: "json" };
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
} from "./protocol.js";
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
} from "./parse.js";
import { COMPILE_TARGETS, createCompilePlan, normalizeCompileTarget } from "../../shared/compile-plan.js";

export function watgen(treeOrNode, { mode = "normal", profile = null, targetName = null, plan = null } = {}) {
    const target = normalizeCompileTarget(mode);
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
    ...Object.fromEntries(Object.entries(COMPARE_BINARY_INSTRS).map(([op, suffix]) => [op, ({ base, isFloat, isUnsigned }) => isFloat ? `${base}.${suffix}` : `${base}.${suffix}_${isUnsigned ? "u" : "s"}`])),
    "/": ({ base, isFloat, isUnsigned }) => isFloat ? `${base}.div` : `${base}.div_${isUnsigned ? "u" : "s"}`,
    "%": ({ base, isFloat, isUnsigned }) => isFloat ? `${base}.rem` : `${base}.rem_${isUnsigned ? "u" : "s"}`,
    ">>": ({ base, isUnsigned }) => `${base}.shr_${isUnsigned ? "u" : "s"}`,
};
const VALID_CONST_WASM_TYPES = new Set(data.validConstWasmTypes);
const CONST_UNARY_OPS = { "-": (value) => -value, not: (value) => value ? 0 : 1, "~": (value) => ~value };
const CONST_BINARY_OPS = {
    "+": (left, right) => left + right,
    "-": (left, right) => left - right,
    "*": (left, right) => left * right,
    "/": (left, right, { isBig, isFloat }) => isBig ? left / right : isFloat ? left / right : Math.trunc(left / right),
    "%": (left, right) => left % right,
    "&": (left, right) => left & right,
    "|": (left, right) => left | right,
    "^": (left, right) => left ^ right,
    "<<": (left, right) => left << right,
    ">>": (left, right) => left >> right,
    ">>>": (left, right, { isBig }) => isBig ? null : left >>> right,
    "==": (left, right) => left === right ? 1 : 0,
    "!=": (left, right) => left !== right ? 1 : 0,
    "<": (left, right) => left < right ? 1 : 0,
    ">": (left, right) => left > right ? 1 : 0,
    "<=": (left, right) => left <= right ? 1 : 0,
    ">=": (left, right) => left >= right ? 1 : 0,
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
const STR_BUILTINS = data.strBuiltins;
const COMPOUND_ASSIGN_BINARY_OPS = new Map([
    ["+=", "+"],
    ["-=", "-"],
    ["*=", "*"],
    ["/=", "/"],
    ["%=", "%"],
    ["<<=", "<<"],
    [">>=", ">>"],
    [">>>=", ">>>"],
    ["&=", "&"],
    ["|=", "|"],
    ["^=", "^"],
    ["and=", "and"],
    ["or=", "or"],
]);

const functionExportName = (node) => {
    const assocNode = childOfType(node, "associated_fn_name");
    if (assocNode) {
        const [ownerNode, memberNode] = kids(assocNode);
        return ownerNode && memberNode ? `${ownerNode.text}.${memberNode.text}` : null;
    }
    return childOfType(node, "identifier")?.text ?? null;
};

const TOP_LEVEL_COLLECT_HANDLERS = {
    struct_decl: (context, item) => {
        const decl = parseStructDecl(item);
        context.structDecls.push(decl);
        context.typeDeclMap.set(decl.name, decl);
    },
    proto_decl: (context, item) => {
        const decl = parseProtoDecl(item);
        context.protoDecls.push(decl);
        context.protocolNames.add(decl.name);
    },
    type_decl: (context, item) => {
        const decl = parseTypeDecl(item);
        context.typeDecls.push(decl);
        context.typeDeclMap.set(decl.name, decl);
        for (const variant of decl.variants) context.variantDecls.set(variant.name, variant);
    },
    fn_decl: (context, item) => {
        const fn = parseFnItem(
            item,
            context.mode === "normal"
                && context.compilePlan.exports.some(({ exportName }) => exportName === functionExportName(item)),
        );
        context.fnItems.push(fn);
        context.callables.set(fn.name, fn);
    },
    global_decl: (context, item) => {
        const [name, type, value] = kids(item);
        const decl = { kind: "global_decl", name: name.text, type: parseType(type), value };
        context.globalDecls.push(decl);
        context.globalTypeMap.set(decl.name, decl.type);
    },
    jsgen_decl: (context, item) => {
        const decl = parseJsgenDecl(item, context.jsgenImportCount++);
        if (decl.kind === "import_fn") {
            context.importFns.push(decl);
            context.callables.set(decl.name, decl);
        } else {
            context.importVals.push(decl);
            context.globalTypeMap.set(decl.name, decl.type);
        }
    },
    library_decl: (context, item) => context.collectLibraryDecl(item),
    test_decl: (context, item) => {
        context.testDecls.push({ kind: "test_decl", name: kids(item)[0].text.slice(1, -1), body: childOfType(item, "block") });
    },
    bench_decl: (context, item) => {
        const setup = childOfType(item, "setup_decl");
        const named = kids(setup);
        context.benchDecls.push({
            kind: "bench_decl",
            name: kids(item)[0].text.slice(1, -1),
            setupPrelude: named.slice(0, -1),
            measureBody: childOfType(named.at(-1), "block"),
        });
    },
};
const CONST_EXPR_HANDLERS = {
    literal: (context, node, wasmType) => context.evalConstLiteral(node, wasmType),
    paren_expr: (context, node, wasmType) => context.evalConstExpr(kids(node)[0], wasmType),
    unary_expr: (context, node, wasmType) => context.evalConstUnary(node, wasmType),
    binary_expr: (context, node, wasmType) => context.evalConstBinary(node, wasmType),
};
const CONST_LITERAL_EVALUATORS = {
    int: (literal, wasmType) => wasmType === "i64" || wasmType === "u64" ? BigInt(literal.value) : literal.value,
    float: (literal) => literal.value,
    bool: (literal) => literal.value ? 1 : 0,
};
const LITERAL_GENERATORS = {
    int: (context, literal, hint, out) => context.genInt(literal.value, hint, out),
    float: (context, literal, hint, out) => context.genFloat(literal.value, hint, out),
    bool: (_context, literal, _hint, out) => out.push(`i32.const ${literal.value ? 1 : 0}`),
    null: (context, _literal, hint, out) => out.push(`ref.null ${context.nullLiteralTarget(hint)}`),
    string: (context, literal, _hint, out) => out.push(`global.get $__s${context.internString(literal.value)}`),
};
const UNARY_GENERATORS = {
    "-": (_context, wasmType, out) => out.push(FLOAT_NEG_INSTRS[wasmType] ?? `${wasmType}.const -1`, ...(FLOAT_NEG_INSTRS[wasmType] ? [] : [`${wasmType}.mul`])),
    not: (_context, _wasmType, out) => out.push("i32.eqz"),
    "~": (_context, wasmType, out) => out.push(`${wasmType}.const -1`, `${wasmType}.xor`),
};
const ARRAY_NS_CALL_HANDLERS = {
    len: (context, args, out) => {
        context.genExpr(args[0], null, out);
        out.push("array.len");
    },
    new: (context, args, out, hint) => {
        const ctor = context.arrayCtorInfoFromHint(hint, "array.new");
        context.genExpr(args[1], ctor.elemWasm, out);
        context.genExpr(args[0], "i32", out);
        out.push(`array.new ${ctor.arrayTypeName}`);
    },
    new_fixed: (context, args, out, hint) => {
        const ctor = context.arrayCtorInfoFromHint(hint, "array.new_fixed");
        for (const arg of args) context.genExpr(arg, ctor.elemWasm, out);
        out.push(`array.new_fixed ${ctor.arrayTypeName} ${args.length}`);
    },
    new_default: (context, args, out, hint) => {
        const ctor = context.arrayCtorInfoFromHint(hint, "array.new_default");
        if (context.protocolNames.has(ctor.key)) {
            out.push(`i32.const ${context.taggedStructTags.get(protoDefaultTypeName(ctor.key))}`);
            out.push(`struct.new $${protoDefaultTypeName(ctor.key)}`);
            context.genExpr(args[0], "i32", out);
            out.push(`array.new ${ctor.arrayTypeName}`);
            return;
        }
        context.genExpr(args[0], "i32", out);
        out.push(`array.new_default ${ctor.arrayTypeName}`);
    },
    copy: (context, args, out) => {
        const [dst, di, src, si, len] = args;
        context.genExpr(dst, null, out);
        context.genExpr(di, "i32", out);
        context.genExpr(src, null, out);
        context.genExpr(si, "i32", out);
        context.genExpr(len, "i32", out);
        out.push(`array.copy ${context.arrayTypeNameFromInferred(context.inferType(dst))} ${context.arrayTypeNameFromInferred(context.inferType(src))}`);
    },
    fill: (context, args, out) => {
        const [arr, off, value, len] = args;
        context.genExpr(arr, null, out);
        context.genExpr(off, "i32", out);
        context.genExpr(value, null, out);
        context.genExpr(len, "i32", out);
        out.push(`array.fill ${context.arrayTypeNameFromInferred(context.inferType(arr))}`);
    },
};
const NS_CALL_HANDLERS = {
    str: (context, method, args, out) => {
        context.pushArgs(args, out);
        out.push(`call $str.${method}`);
    },
    array: (context, method, args, out, hint) => context.genArrayNsCall(method, args, out, hint),
    ref: (context, method, args, out) => context.genRefNsCall(method, args, out),
    i31: (context, method, args, out) => {
        context.pushArgs(args, out);
        out.push(I31_NS_OPS[method]);
    },
};
const INFER_TYPE_HANDLERS = {
    literal: (_context, node) => LITERAL_INFERRED_TYPES[literalInfo(node).kind] ?? null,
    identifier: (context, node) => context.typeName(context.localTypes?.get(node.text) ?? context.globalTypeMap.get(node.text)),
    paren_expr: (context, node) => context.inferType(kids(node).at(-1)),
    unary_expr: (context, node) => context.inferType(kids(node).at(-1)),
    binary_expr: (context, node) => {
        const [left, right] = kids(node);
        return BINARY_BOOL_OPS.has(findAnonBetween(node, left, right))
            ? "i32"
            : context.dominantType(context.inferType(left), context.inferType(right));
    },
    field_expr: (context, node) => {
        const [object, field] = kids(node);
        return context.typeName(context.lookupFieldType(context.inferType(object), field.text));
    },
    index_expr: (context, node) => context.arrayElemKeyFromInferred(context.inferType(kids(node)[0])),
    call_expr: (context, node) => {
        const callee = kids(node)[0];
        return callee.type === "identifier"
            ? context.typeName(context.lookupCallableReturnType(callee.text))
            : callee.type === "namespace_call_expr"
                ? context.inferNsCallType(namespaceInfo(callee), context.args(node))
                : null;
    },
    pipe_expr: (context, node) => {
        const target = parsePipeTarget(childOfType(node, "pipe_target"));
        if (target.kind === "pipe_ident") return context.typeName(context.lookupCallableReturnType(target.name));
        if (target.callee.includes(".")) {
            const [ns, method] = target.callee.split(".");
            return context.inferNsCallType({ ns, method }, pipeArgValues(target));
        }
        return context.typeName(context.lookupCallableReturnType(target.callee));
    },
    namespace_call_expr: (context, node) => context.inferNsCallType(namespaceInfo(node), context.args(node)),
    struct_init: (_context, node) => childOfType(node, "type_ident").text,
    array_init: (context, node) => `${context.elemTypeKey(parseType(kids(node)[0]))}_array`,
    if_expr: (context, node) => context.inferType(kids(node)[1]),
    else_expr: (context, node) => {
        const [expr, fallback] = kids(node);
        const exprType = context.inferType(expr);
        if (fallback.type === "fatal_expr") {
            return typeof exprType === "string" && exprType.startsWith("nullable_")
                ? exprType.slice("nullable_".length)
                : exprType;
        }
        const fallbackType = context.inferType(fallback);
        if (typeof exprType === "string" && exprType.startsWith("nullable_")) {
            const innerType = exprType.slice("nullable_".length);
            if (!fallbackType || fallbackType === innerType) return innerType;
        }
        return fallbackType || exprType;
    },
    promote_expr: (context, node) => context.inferType(kids(node)[2]),
    block: (context, node) => context.inferType(kids(node).at(-1)),
    assert_expr: () => null,
};
const INFER_NS_CALL_HANDLERS = {
    str: (_context, method) => {
        const builtin = STR_BUILTINS[method];
        return !builtin ? null : builtin.sig.includes("result externref") ? "str" : "i32";
    },
    array: (_context, method) => method === "len" ? "i32" : null,
    ref: (context, method, args) => REF_NS_RETURN_TYPES[method] ?? (method === "as_non_null" || method === "cast" ? context.inferType(args[0]) : null),
    i31: (_context, method) => I31_NS_RETURN_TYPES[method] ?? null,
};
const DEFAULT_VALUE_GENERATORS = {
    named: (context, type) => `ref.null ${context.refNullTarget(type.name)}`,
    nullable: (context, type) => `ref.null ${context.nullableNullTarget(type.inner)}`,
};
const LOCAL_COLLECT_HANDLERS = {
    bind_expr: (context, locals, seen, node) => {
        for (const target of parseBindTargets(node)) context.addLocal(locals, seen, target.name, target.type);
    },
    assign_expr: (context, locals, seen, node) => {
        if (!context.isCompoundAssign(node)) return;
        const [lhs] = kids(node);
        const valueType = context.assignValueType(lhs);
        context.addLocal(locals, seen, context.assignValueTempName(node), valueType);
        if (lhs.type === "field_expr" || lhs.type === "index_expr")
            context.addLocal(locals, seen, context.assignObjectTempName(node), context.tempLocalTypeForExpr(kids(lhs)[0]));
        if (lhs.type === "index_expr")
            context.addLocal(locals, seen, context.assignIndexTempName(node), I32);
    },
    for_expr: (context, locals, seen, node) => {
        const sources = parseForSources(childOfType(node, "for_sources"));
        const captures = parseCapture(childOfType(node, "capture"));
        if (sources.length !== 1) throw new Error("for loops support exactly one range source in v1");
        if (captures.length > 1) throw new Error("for loops support at most one capture in v1");
        sources.forEach((source, index) => {
            if (source.kind !== "range") return;
            const name = captures[index] ?? `__i_${node.id}`;
            context.addLocal(locals, seen, name, I32);
        });
    },
    match_expr: (context, locals, seen, node) => {
        const subjectType = context.inferredToType(context.inferType(kids(node)[0])) ?? I32;
        context.addLocal(locals, seen, context.scalarMatchTempName(node), subjectType);
    },
    alt_expr: (context, locals, seen, node) => {
        const subjectType = context.inferredToType(context.inferType(kids(node)[0])) ?? I32;
        context.addLocal(locals, seen, context.altSubjectTempName(node), subjectType);
        for (const arm of childrenOfType(node, "alt_arm").map(parseAltArm)) {
            if (arm.pattern !== "_") context.addLocal(locals, seen, arm.pattern, arm.guard ? { kind: "named", name: arm.guard } : subjectType);
        }
    },
    promote_expr: (context, locals, seen, node) => {
        const exprType = context.exprType(kids(node)[0]) ?? context.inferredToType(context.inferType(kids(node)[0])) ?? I32;
        const capture = parsePromoteCapture(kids(node)[1]);
        const ident = capture.name;
        context.addLocal(locals, seen, `__promote_${node.id}`, exprType);
        context.addLocal(locals, seen, ident, exprType.kind === "nullable" ? exprType.inner : exprType);
    },
};
const TYPE_VISIT_HANDLERS = {
    array: (context, type, visitType) => {
        const key = context.elemTypeKey(type.elem);
        if (!context.arrayTypes.has(key)) context.arrayTypes.set(key, `$${key}_array`);
        visitType(type.elem);
    },
    nullable: (_context, type, visitType) => visitType(type.inner),
    exclusive: (_context, type, visitType) => {
        visitType(type.ok);
        visitType(type.err);
    },
    multi_return: (_context, type, visitType) => type.components.forEach(visitType),
    func_type: (_context, type, visitType) => {
        type.params.forEach(visitType);
        visitType(type.returnType);
    },
};
const BODY_TYPE_VISIT_HANDLERS = {
    bind_expr: (_context, node, visitType) => {
        for (const target of parseBindTargets(node)) visitType(target.type);
    },
    array_init: (_context, node, visitType) => visitType(parseType(kids(node)[0])),
};
const ELEM_TYPE_KEY_HANDLERS = {
    scalar: (_context, type) => type.name,
    named: (_context, type) => type.name,
    nullable: (context, type) => `nullable_${context.elemTypeKey(type.inner)}`,
    array: (context, type) => `${context.elemTypeKey(type.elem)}_array`,
};
const SCALAR_PATTERN_GENERATORS = {
    int_lit: (context, node, hint, out) => context.genInt(parseIntLit(node.text), hint, out),
    float_lit: (context, node, hint, out) => context.genFloat(parseFloat(node.text), hint, out),
};
const CALL_CALLEE_HANDLERS = {
    pipe_expr: (context, callee, args, out) => context.genPipeCall(callee, args, out),
    namespace_call_expr: (context, callee, args, out, hint) => context.genNsCall(callee, out, args, hint),
    identifier: (context, callee, args, out) => {
        context.pushArgs(args, out, context.callables.get(callee.text)?.params?.map((param) => param.type));
        out.push(`call $${callee.text}`);
    },
    index_expr: (context, callee, args, out) => {
        const [object, index] = kids(callee);
        context.pushArgs(args, out);
        context.genExpr(object, null, out);
        context.genExpr(index, "i32", out);
        out.push(`array.get ${context.arrayTypeNameFromInferred(context.inferType(object))}`);
        out.push("call_ref");
    },
    field_expr: (_context, callee) => {
        throw new Error(`Unresolved method call '.${kids(callee)[1]?.text ?? "?"}()': desugar p.method() in expand.js before watgen`);
    },
};
const ARRAY_INIT_HANDLERS = {
    new: (context, args, elemType, elemWasm, arrayTypeName, out) => {
        context.genExpr(args[1], elemWasm, out);
        context.genExpr(args[0], "i32", out);
        out.push(`array.new ${arrayTypeName}`);
    },
    new_fixed: (context, args, elemType, elemWasm, arrayTypeName, out) => {
        for (const arg of args) context.genExpr(arg, elemWasm, out);
        out.push(`array.new_fixed ${arrayTypeName} ${args.length}`);
    },
    new_default: (context, args, elemType, elemWasm, arrayTypeName, out) => {
        if (elemType?.kind === "named" && context.protocolNames.has(elemType.name)) {
            out.push(`i32.const ${context.taggedStructTags.get(protoDefaultTypeName(elemType.name))}`);
            out.push(`struct.new $${protoDefaultTypeName(elemType.name)}`);
            context.genExpr(args[0], "i32", out);
            out.push(`array.new ${arrayTypeName}`);
            return;
        }
        context.genExpr(args[0], "i32", out);
        out.push(`array.new_default ${arrayTypeName}`);
    },
};
const ASSIGN_TARGET_HANDLERS = {
    identifier: (context, lhs, rhs, op, assignNode, out) => {
        const name = lhs.text;
        const type = context.localTypes.get(name) ?? context.globalTypeMap.get(name) ?? I32;
        if (op !== "=") {
            context.genExpr(lhs, context.wasmType(type), out);
            out.push(`local.set $${context.assignValueTempName(assignNode)}`);
            context.genCompoundAssignValue(assignNode, rhs, type, out);
            out.push(`${context.localTypes.has(name) ? "local" : "global"}.set $${name}`);
            return;
        }
        context.genExpr(rhs, context.wasmType(type), out);
        out.push(`${context.localTypes.has(name) ? "local" : "global"}.set $${name}`);
    },
    field_expr: (context, lhs, rhs, op, assignNode, out) => {
        const [object, field] = kids(lhs);
        const objectType = context.inferType(object);
        const directField = context.typeFields(objectType)?.find((candidate) => candidate.name === field.text) ?? null;
        const getterHelper = objectType ? context.protocolHelpersByTypeMember.get(`${objectType}.${field.text}`) : null;
        const setterHelper = objectType ? context.protocolSetterHelpersByTypeMember.get(`${objectType}.${field.text}`) : null;
        if (directField && !directField.mut)
            throw new Error(`Field "${field.text}" on "${objectType}" must be declared "mut" before it can be assigned`);
        if (op !== "=") {
            if (!directField && !getterHelper)
                throw new Error(`Compound assignment to "${field.text}" requires a readable field or protocol getter`);
            const objectTemp = context.assignObjectTempName(assignNode);
            context.genExpr(object, null, out);
            out.push(`local.set $${objectTemp}`);
            out.push(`local.get $${objectTemp}`);
            if (getterHelper) out.push(`call $${getterHelper}`);
            else out.push(`struct.get $${objectType} $${field.text}`);
            out.push(`local.set $${context.assignValueTempName(assignNode)}`);
            out.push(`local.get $${objectTemp}`);
            context.genCompoundAssignValue(assignNode, rhs, directField?.type ?? context.lookupFieldType(objectType, field.text) ?? I32, out);
            if (setterHelper) {
                out.push(`call $${setterHelper}`);
                return;
            }
            out.push(`struct.set $${objectType} $${field.text}`);
            return;
        }
        if (setterHelper) {
            context.genExpr(object, null, out);
            context.genExpr(rhs, directField ? context.wasmType(directField.type) : null, out);
            out.push(`call $${setterHelper}`);
            return;
        }
        if (directField) {
            context.genExpr(object, null, out);
            context.genExpr(rhs, context.wasmType(directField.type), out);
            out.push(`struct.set $${objectType} $${field.text}`);
            return;
        }
        context.genExpr(object, null, out);
        context.genExpr(rhs, null, out);
        out.push(`struct.set $${objectType} $${field.text}`);
    },
    index_expr: (context, lhs, rhs, op, assignNode, out) => {
        const [object, index] = kids(lhs);
        if (op !== "=") {
            const objectTemp = context.assignObjectTempName(assignNode);
            const indexTemp = context.assignIndexTempName(assignNode);
            const arrayType = context.arrayTypeNameFromInferred(context.inferType(object));
            context.genExpr(object, null, out);
            out.push(`local.set $${objectTemp}`);
            context.genExpr(index, "i32", out);
            out.push(`local.set $${indexTemp}`);
            out.push(`local.get $${objectTemp}`);
            out.push(`local.get $${indexTemp}`);
            out.push(`array.get ${arrayType}`);
            out.push(`local.set $${context.assignValueTempName(assignNode)}`);
            out.push(`local.get $${objectTemp}`);
            out.push(`local.get $${indexTemp}`);
            context.genCompoundAssignValue(assignNode, rhs, context.inferredToType(context.arrayElemKeyFromInferred(context.inferType(object))) ?? I32, out);
            out.push(`array.set ${arrayType}`);
            return;
        }
        context.genExpr(object, null, out);
        context.genExpr(index, "i32", out);
        context.genExpr(rhs, null, out);
        out.push(`array.set ${context.arrayTypeNameFromInferred(context.inferType(object))}`);
    },
};
const EXPR_GENERATORS = {
    literal: (context, node, hint, out) => context.genLiteral(node, hint, out),
    identifier: (context, node, _hint, out) => context.genIdent(node, out),
    paren_expr: (context, node, hint, out) => context.genExpr(kids(node)[0], hint, out),
    assert_expr: (context, node, _hint, out) => context.genAssert(node, out),
    unary_expr: (context, node, hint, out) => context.genUnary(node, hint, out),
    binary_expr: (context, node, hint, out) => context.genBinary(node, hint, out),
    tuple_expr: (context, node, _hint, out) => context.genTuple(node, out),
    pipe_expr: (context, node, _hint, out) => context.genPipe(node, out),
    else_expr: (context, node, hint, out) => context.genElse(node, hint, out),
    call_expr: (context, node, hint, out) => context.genCall(node, out, hint),
    field_expr: (context, node, _hint, out) => context.genField(node, out),
    index_expr: (context, node, _hint, out) => context.genIndex(node, out),
    namespace_call_expr: (context, node, hint, out) => context.genNsCall(node, out, null, hint),
    ref_null_expr: (context, node, _hint, out) => {
        const typeNode = childOfType(node, "type_ident") ?? childOfType(node, "qualified_type_ref");
        out.push(`ref.null ${context.refNullTarget(typeNode.text)}`);
    },
    if_expr: (context, node, hint, out) => context.genIf(node, hint, out),
    promote_expr: (context, node, hint, out) => context.genPromote(node, hint, out),
    match_expr: (context, node, hint, out) => context.genMatch(node, hint, out),
    alt_expr: (context, node, hint, out) => context.genAlt(node, hint, out),
    for_expr: (context, node, _hint, out) => context.genFor(node, out),
    while_expr: (context, node, _hint, out) => context.genWhile(node, out),
    block_expr: (context, node, hint, out) => context.genBlockExpr(node, hint, out),
    break_expr: (context, node, _hint, out) => context.genBreak(node, out),
    emit_expr: (context, node, _hint, out) => context.genEmit(node, out),
    bind_expr: (context, node, _hint, out) => context.genLet(node, out),
    struct_init: (context, node, _hint, out) => context.genStructInit(node, out),
    array_init: (context, node, _hint, out) => context.genArrayInit(node, out),
    assign_expr: (context, node, _hint, out) => context.genAssign(node, out),
    fatal_expr: (_context, _node, _hint, out) => out.push("unreachable"),
};

export class WatGen {
    constructor(root, mode, profile = null, targetName = null, plan = null) {
        this.root = root;
        this.mode = mode;
        this.profile = profile;
        this.targetName = targetName;
        this.compilePlan = plan ?? createCompilePlan(root, { target: mode });
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
