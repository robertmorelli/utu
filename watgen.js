import {
    rootNode,
    namedChildren,
    childOfType,
    childrenOfType,
    hasAnon,
    walk,
    walkBlock,
    stringLiteralValue,
    findAnonBetween,
} from './tree.js';
import { parseHostImportName } from './parser.js';
import data from './jsondata/watgen.data.json' with { type: 'json' };

export function watgen(treeOrNode, { mode = 'program', profile = null, targetName = null } = {}) {
    return new WatGen(rootNode(treeOrNode), mode, profile, targetName).generate();
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

const TOP_LEVEL_COLLECT_HANDLERS = {
    struct_decl: (ctx, item) => {
        const decl = parseStructDecl(item);
        ctx.structDecls.push(decl);
        ctx.typeDeclMap.set(decl.name, decl);
    },
    type_decl: (ctx, item) => {
        const decl = parseTypeDecl(item);
        ctx.typeDecls.push(decl);
        ctx.typeDeclMap.set(decl.name, decl);
        for (const variant of decl.variants) ctx.variantDecls.set(variant.name, variant);
    },
    fn_decl: (ctx, item) => ctx.fnItems.push({ node: item, exported: false }),
    global_decl: (ctx, item) => {
        const [name, type, value] = kids(item);
        const decl = { kind: 'global_decl', name: name.text, type: parseType(type), value };
        ctx.globalDecls.push(decl);
        ctx.globalTypeMap.set(decl.name, decl.type);
    },
    import_decl: (ctx, item) => {
        const decl = parseImportDecl(item);
        if (decl.kind === 'import_fn') ctx.importFns.push(decl);
        else {
            ctx.importVals.push(decl);
            ctx.globalTypeMap.set(decl.name, decl.type);
        }
    },
    jsgen_decl: (ctx, item) => {
        ctx.importFns.push(parseJsgenDecl(item, ctx.jsgenImportCount++));
    },
    export_decl: (ctx, item) => {
        const node = childOfType(item, 'fn_decl');
        ctx.fnItems.push({ node, exported: true, exportName: textOf(node, 'identifier') });
    },
    test_decl: (ctx, item) => {
        ctx.testDecls.push({ kind: 'test_decl', name: kids(item)[0].text.slice(1, -1), body: childOfType(item, 'block') });
    },
    bench_decl: (ctx, item) => {
        const setup = childOfType(item, 'setup_decl');
        const named = kids(setup);
        ctx.benchDecls.push({
            kind: 'bench_decl',
            name: kids(item)[0].text.slice(1, -1),
            capture: kids(childOfType(item, 'bench_capture'))[0].text,
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
    array: (ctx, method, args, out) => ctx.genArrayNsCall(method, args, out),
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
    for_expr: (ctx, locals, seen, node) => {
        parseForSources(childOfType(node, 'for_sources')).forEach((source, i) => {
            if (source.kind !== 'range') return;
            const name = parseCapture(childOfType(node, 'capture'))[i];
            if (name) ctx.addLocal(locals, seen, name, I32);
        });
    },
    match_expr: (ctx, locals, seen, node) => {
        const subjectType = ctx.inferredToType(ctx.inferType(kids(node)[0])) ?? I32;
        ctx.addLocal(locals, seen, ctx.scalarMatchTempName(node), subjectType);
    },
    alt_expr: (ctx, locals, seen, node) => {
        const subjectType = ctx.inferredToType(ctx.inferType(kids(node)[0])) ?? I32;
        for (const arm of childrenOfType(node, 'alt_arm').map(parseAltArm)) {
            if (arm.pattern !== '_') ctx.addLocal(locals, seen, arm.pattern, arm.guard ? { kind: 'named', name: arm.guard } : subjectType);
        }
    },
    promote_expr: (ctx, locals, seen, node) => {
        const exprType = ctx.exprType(kids(node)[0]) ?? ctx.inferredToType(ctx.inferType(kids(node)[0])) ?? I32;
        const ident = kids(node)[1].text;
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
    array: (ctx, type) => `${ctx.elemTypeKey(type.elem)}_array`,
};
const SCALAR_PATTERN_GENERATORS = {
    int_lit: (ctx, node, hint, out) => ctx.genInt(parseIntLit(node.text), hint, out),
    float_lit: (ctx, node, hint, out) => ctx.genFloat(parseFloat(node.text), hint, out),
};
const CALL_CALLEE_HANDLERS = {
    pipe_expr: (ctx, callee, args, out) => ctx.genPipeCall(callee, args, out),
    namespace_call_expr: (ctx, callee, args, out) => ctx.genNsCall(callee, out, args),
    identifier: (ctx, callee, args, out) => {
        ctx.pushArgs(args, out, ctx.lookupCallable(callee.text)?.params?.map(param => param.type));
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
    new: (ctx, args, elemWasm, _arrayTypeName, out) => {
        ctx.genExpr(args[1], elemWasm, out);
        ctx.genExpr(args[0], 'i32', out);
        out.push(`array.new ${_arrayTypeName}`);
    },
    new_fixed: (ctx, args, elemWasm, _arrayTypeName, out) => {
        for (const arg of args) ctx.genExpr(arg, elemWasm, out);
        out.push(`array.new_fixed ${_arrayTypeName} ${args.length}`);
    },
    new_default: (ctx, args, _elemWasm, _arrayTypeName, out) => {
        ctx.genExpr(args[0], 'i32', out);
        out.push(`array.new_default ${_arrayTypeName}`);
    },
};
const ASSIGN_TARGET_HANDLERS = {
    identifier: (ctx, lhs, rhs, out) => {
        const name = lhs.text;
        const type = ctx.localTypes.get(name) ?? ctx.globalTypeMap.get(name) ?? I32;
        ctx.genExpr(rhs, ctx.wasmType(type), out);
        out.push(`${ctx.localTypes.has(name) ? 'local' : 'global'}.set $${name}`);
    },
    field_expr: (ctx, lhs, rhs, out) => {
        const [object, field] = kids(lhs);
        ctx.genExpr(object, null, out);
        ctx.genExpr(rhs, null, out);
        out.push(`struct.set $${ctx.inferType(object)} $${field.text}`);
    },
    index_expr: (ctx, lhs, rhs, out) => {
        const [object, index] = kids(lhs);
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
    call_expr: (ctx, node, _hint, out) => ctx.genCall(node, out),
    field_expr: (ctx, node, _hint, out) => ctx.genField(node, out),
    index_expr: (ctx, node, _hint, out) => ctx.genIndex(node, out),
    namespace_call_expr: (ctx, node, _hint, out) => ctx.genNsCall(node, out),
    ref_null_expr: (_ctx, node, _hint, out) => out.push(`ref.null $${childOfType(node, 'type_ident').text}`),
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
const PARSE_TYPE_HANDLERS = {
    nullable_type: node => ({ kind: 'nullable', inner: parseType(kids(node)[0]) }),
    scalar_type: node => ({ kind: 'scalar', name: node.text }),
    ref_type: node => node.children[0].type === 'array' ? { kind: 'array', elem: parseType(kids(node)[0]) } : { kind: 'named', name: node.children[0].text },
    func_type: node => ({ kind: 'func_type', params: kids(childOfType(node, 'type_list')).map(parseType), returnType: parseReturnType(childOfType(node, 'return_type')) }),
    paren_type: node => parseType(kids(node)[0]),
};

class WatGen {
    constructor(root, mode, profile = null, targetName = null) {
        this.root = root;
        this.mode = mode;
        this.profile = profile;
        this.targetName = targetName;

        this.structDecls = [];
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

        this.strings = new Map();
        this.stringList = [];
        this.arrayTypes = new Map();

        this.localTypes = null;
        this.labelStack = [];
        this.currentReturnType = null;
        this.currentProfileId = null;
        this.uid = 0;
        this.jsgenImportCount = 0;
        this.metadata = { tests: [], benches: [] };
    }

    nextUid() { return this.uid++; }
    generate() {
        this.collect();
        this.scanAll();
        this.metadata.strings = [...this.stringList];
        return { wat: this.emit(), metadata: this.metadata };
    }

    collect() {
        for (const item of kids(this.root)) {
            const collect = TOP_LEVEL_COLLECT_HANDLERS[item.type];
            if (collect) collect(this, item);
            else throw new Error(`Unknown top-level item: ${item.type}`);
        }
        if (this.mode === 'test' && this.targetName !== null)
            this.testDecls = this.testDecls.filter((test) => test.name === this.targetName);
        if (this.mode === 'bench' && this.targetName !== null)
            this.benchDecls = this.benchDecls.filter((bench) => bench.name === this.targetName);
    }

    scanAll() {
        for (const fn of this.fnItems) this.scanNode(this.fnBody(fn));
        for (const global of this.globalDecls) this.scanNode(global.value);
        if (this.mode === 'test') for (const test of this.testDecls) this.scanNode(test.body);
        if (this.mode === 'bench') for (const bench of this.benchDecls) {
            for (const stmt of bench.setupPrelude) this.scanNode(stmt);
            this.scanNode(bench.measureBody);
        }
    }

    scanNode(node) {
        walk(node, child => {
            const value = stringLiteralValue(child);
            if (value !== null) this.internString(value);

            if (child.type === 'pipe_expr') {
                void pipeCallee(parsePipeTarget(childOfType(child, 'pipe_target')));
            }
        });
    }
    bodyItems(body) { return Array.isArray(body) ? body : kids(body); }

    internString(value) {
        if (!this.strings.has(value)) {
            this.strings.set(value, this.stringList.length);
            this.stringList.push(value);
        }
        return this.strings.get(value);
    }

    emit() {
        const lines = ['(module'];

        this.collectArrayTypes();

        for (const def of this.emitPlainTypeDefs()) lines.push(def);
        const recDefs = this.emitRecTypeDefs();
        if (recDefs.length > 0) {
            lines.push('  (rec');
            for (const def of recDefs) lines.push(def);
            lines.push('  )');
        }

        for (let i = 0; i < this.stringList.length; i++) {
            lines.push(`  (import "__strings" "${i}" (global $__s${i} externref))`);
        }

        if (this.profile === 'ticks') lines.push('  (import "__utu_profile" "tick" (func $__utu_profile_tick (param i32)))');

        for (const imp of this.importFns) lines.push(this.emitImportFn(imp));
        for (const imp of this.importVals) lines.push(this.emitImportVal(imp));
        for (const global of this.globalDecls) lines.push(this.emitGlobal(global));

        for (const [i, fn] of this.fnItems.entries()) {
            lines.push(this.emitFn(fn, this.profile === 'ticks' ? i : null));
            if (fn.exported) lines.push(`  (export "${fn.exportName}" (func $${this.fnName(fn)}))`);
        }

        if (this.mode === 'test') {
            this.testDecls.forEach((test, i) => {
                const exportName = `__utu_test_${i}`;
                this.metadata.tests.push({ name: test.name, exportName });
                lines.push(this.emitTest(test, exportName));
                lines.push(`  (export "${exportName}" (func $${exportName}))`);
            });
        }

        if (this.mode === 'bench') {
            this.benchDecls.forEach((bench, i) => {
                const exportName = `__utu_bench_${i}`;
                this.metadata.benches.push({ name: bench.name, exportName });
                lines.push(this.emitBench(bench, exportName));
                lines.push(`  (export "${exportName}" (func $${exportName}))`);
            });
        }

        lines.push(')');
        return lines.join('\n');
    }

    collectArrayTypes() {
        const visitType = (type) => {
            if (!type) return;
            TYPE_VISIT_HANDLERS[type.kind]?.(this, type, visitType);
        };

        for (const decl of this.structDecls) {
            for (const field of decl.fields) visitType(field.type);
        }

        for (const decl of this.typeDecls) {
            for (const variant of decl.variants) {
                for (const field of variant.fields) visitType(field.type);
            }
        }

        const visitBody = (body) => {
            for (const stmt of this.bodyItems(body)) walk(stmt, node => BODY_TYPE_VISIT_HANDLERS[node.type]?.(this, node, visitType));
        };

        for (const fn of this.fnItems) {
            for (const param of this.fnParams(fn)) visitType(param.type);
            visitType(this.fnReturnType(fn));
            visitBody(this.fnBody(fn));
        }

        if (this.mode === 'test') for (const test of this.testDecls) visitBody(test.body);
        if (this.mode === 'bench') for (const bench of this.benchDecls) visitBody([...bench.setupPrelude, ...kids(bench.measureBody)]);

        for (const imp of this.importFns) {
            for (const param of imp.params) visitType(param.type);
            visitType(imp.returnType);
        }

        for (const global of this.globalDecls) visitType(global.type);
    }

    elemTypeKey(type) {
        if (!type) return 'unknown';
        const key = ELEM_TYPE_KEY_HANDLERS[type.kind];
        return key ? key(this, type) : 'unknown';
    }

    emitPlainTypeDefs() {
        return [
            ...this.structDecls.filter(d => !d.rec).map(decl => this.emitStructType(decl, '  ')),
            ...this.typeDecls.filter(d => !d.rec).flatMap(decl => this.emitSumType(decl, '  ')),
        ];
    }

    emitRecTypeDefs() {
        return [
            ...[...this.arrayTypes].map(([key, name]) => `    (type ${name} (array (mut ${this.elemKeyWasmType(key)})))`),
            ...this.structDecls.filter(d => d.rec).map(decl => this.emitStructType(decl)),
            ...this.typeDecls.filter(d => d.rec).flatMap(decl => this.emitSumType(decl)),
        ];
    }

    emitStructType(decl, indent = '    ') {
        return this.emitStructLikeType(`${indent}(type $${decl.name} (struct`, decl.fields, `${indent}))`);
    }

    emitSumType(decl, indent = '    ') {
        const lines = [`${indent}(type $${decl.name} (sub (struct)))`];
        for (const variant of decl.variants)
            lines.push(this.emitStructLikeType(`${indent}(type $${variant.name} (sub $${decl.name} (struct`, variant.fields, `${indent})))`));
        return lines;
    }

    emitStructLikeType(prefix, fields, closing) {
        if (!fields.length) return `${prefix}${closing.trimStart()}`;
        return [
            prefix,
            ...fields.map(field => `      ${this.watField(field)}`),
            closing,
        ].join('\n');
    }

    watField(field) {
        const wasmType = this.wasmType(field.type);
        return field.mut ? `(field $${field.name} (mut ${wasmType}))` : `(field $${field.name} ${wasmType})`;
    }

    emitImportFn(imp) {
        const sig = [
            imp.params.map(param => `(param ${this.wasmType(param.type)})`).join(' '),
            imp.returnType && this.watResultList(imp.returnType),
        ].filter(Boolean).join(' ');
        return `  (import "${imp.module}" "${imp.hostName}" (func $${imp.name}${sig ? ` ${sig}` : ''}))`;
    }

    emitImportVal(imp) { return `  (import "${imp.module}" "${imp.hostName}" (global $${imp.name} ${this.wasmType(imp.type)}))`; }
    emitGlobal(global) {
        const wasmType = this.wasmType(global.type);
        const init = this.tryFoldGlobalInit(global.value, wasmType) ?? this.genExprInline(global.value, wasmType);
        return `  (global $${global.name} ${wasmType} ${init})`;
    }

    tryFoldGlobalInit(node, wasmType) {
        const value = this.evalConstExpr(node, wasmType);
        return value === null ? null : `${wasmType}.const ${value}`;
    }

    evalConstExpr(node, wasmType) {
        if (!node || !VALID_CONST_WASM_TYPES.has(wasmType)) return null;
        const evalExpr = CONST_EXPR_HANDLERS[node.type];
        return evalExpr ? evalExpr(this, node, wasmType) : null;
    }

    evalConstLiteral(node, wasmType) {
        const literal = literalInfo(node);
        const evalLiteral = CONST_LITERAL_EVALUATORS[literal.kind];
        return evalLiteral ? evalLiteral(literal, wasmType) : null;
    }

    evalConstUnary(node, wasmType) {
        const op = childOfType(node, 'unary_op').text;
        const expr = kids(node).find(child => child.type !== 'unary_op');
        const value = this.evalConstExpr(expr, wasmType);
        if (value === null) return null;
        return CONST_UNARY_OPS[op]?.(value) ?? null;
    }

    evalConstBinary(node, wasmType) {
        const [leftNode, rightNode] = kids(node);
        const left = this.evalConstExpr(leftNode, wasmType);
        const right = this.evalConstExpr(rightNode, wasmType);
        if (left === null || right === null) return null;

        const op = findAnonBetween(node, leftNode, rightNode);
        const isBig = typeof left === 'bigint' || typeof right === 'bigint';
        const normalize = (value) => {
            if (isBig) return BigInt(value);
            return value;
        };
        const l = normalize(left);
        const r = normalize(right);
        const evalOp = CONST_BINARY_OPS[op];
        return evalOp ? evalOp(l, r, { isBig, isFloat: wasmType === 'f32' || wasmType === 'f64' }) : null;
    }

    emitFunc(name, params, returnType, body, emitBody, extraLocals = [], profileId = null) {
        this.localTypes = new Map(params.map(param => [param.name, param.type]));
        this.currentReturnType = returnType;
        this.labelStack = [];
        this.currentProfileId = profileId;
        const locals = this.collectLocals(body, extraLocals);

        const paramList = params
            .map(param => `(param $${param.name} ${this.wasmType(param.type)})`)
            .join(' ');
        const results = returnType ? ` ${this.watResultList(returnType)}` : '';
        const sig = [paramList, results].filter(Boolean).join(' ');

        const lines = [`  (func $${name}${sig ? ` ${sig}` : ''}`];
        const declared = new Set(params.map(param => param.name));

        for (const local of locals) {
            if (declared.has(local.name)) continue;
            lines.push(`    (local $${local.name} ${this.wasmType(local.type)})`);
            declared.add(local.name);
        }

        const bodyLines = [];
        this.genProfileTick(bodyLines);
        emitBody(bodyLines);
        this.pushLines(lines, bodyLines);
        lines.push('  )');
        this.currentProfileId = null;
        return lines.join('\n');
    }

    emitFn(fn, profileId = null) {
        const body = this.fnBody(fn);
        return this.emitFunc(this.fnName(fn), this.fnParams(fn), this.fnReturnType(fn), body, out => this.genBody(kids(body), out, true), [], profileId);
    }

    emitTest(test, exportName) { return this.emitFunc(exportName, [], null, test.body, out => this.genBody(kids(test.body), out)); }

    emitBench(bench, exportName) {
        return this.emitFunc(
            exportName,
            [{ name: 'iterations', type: I32 }],
            null,
            [...bench.setupPrelude, ...kids(bench.measureBody)],
            out => {
                this.genBody(bench.setupPrelude, out);
                this.genBenchLoop(bench, out);
            },
            [[bench.capture, I32]],
        );
    }

    genProfileTick(out, indent = '') {
        if (this.profile !== 'ticks' || this.currentProfileId === null) return;
        out.push(`${indent}i32.const ${this.currentProfileId}`);
        out.push(`${indent}call $__utu_profile_tick`);
    }

    collectLocals(body, extraLocals = []) {
        const locals = [];
        const seen = new Set();
        for (const [name, type] of extraLocals) this.addLocal(locals, seen, name, type);
        for (const stmt of this.bodyItems(body)) walk(stmt, node => {
            const collect = LOCAL_COLLECT_HANDLERS[node.type];
            if (collect) collect(this, locals, seen, node);
        });
        return locals;
    }

    addLocal(locals, seen, name, type) {
        if (seen.has(name) || this.localTypes.has(name)) return;
        seen.add(name);
        locals.push({ name, type });
        this.localTypes.set(name, type);
    }

    args(node) { return kids(childOfType(node, 'arg_list')); }
    pushArgs(args, out, types = []) {
        args.forEach((arg, i) => this.genExpr(arg, types[i] ? this.wasmType(types[i]) : null, out));
    }
    pushLines(out, lines, prefix = '    ') { for (const line of lines) out.push(`${prefix}${line}`); }
    pushGenerated(out, emit, prefix = '    ') {
        const lines = [];
        emit(lines);
        this.pushLines(out, lines, prefix);
    }
    pushPipedArgs(value, args, out, isPlaceholder, readArg = arg => arg) {
        const placeholderCount = args.filter(isPlaceholder).length;
        if (placeholderCount > 1) throw new Error('pipe targets can contain at most one underscore placeholder');
        if (!args.some(isPlaceholder)) this.genExpr(value, null, out);
        for (const arg of args) this.genExpr(isPlaceholder(arg) ? value : readArg(arg), null, out);
    }
    pipedArgs(value, args, isPlaceholder, readArg = arg => arg) {
        const placeholderCount = args.filter(isPlaceholder).length;
        if (placeholderCount > 1) throw new Error('pipe targets can contain at most one underscore placeholder');
        return args.some(isPlaceholder)
            ? args.map(arg => isPlaceholder(arg) ? value : readArg(arg))
            : [value, ...args.map(readArg)];
    }
    withLoop(out, emitBody) {
        const uid = this.uid++, breakLabel = `$__break_${uid}`, continueLabel = `$__continue_${uid}`;
        this.labelStack.push({ kind: 'loop', breakLbl: breakLabel });
        out.push(`(block ${breakLabel}`, `  (loop ${continueLabel}`);
        emitBody(breakLabel, continueLabel, uid);
        out.push('  )', ')');
        this.labelStack.pop();
    }
    bumpI32Local(name, out, prefix = '') {
        out.push(`${prefix}local.get $${name}`, `${prefix}i32.const 1`, `${prefix}i32.add`, `${prefix}local.set $${name}`);
    }

    genBody(stmts, out, isFnBody = false, tailHint = null) {
        for (let i = 0; i < stmts.length; i++) {
            const stmt = stmts[i];
            const expectsValue = i === stmts.length - 1
                && ((tailHint !== null && tailHint !== DISCARD_HINT) || (isFnBody && this.currentReturnType !== null));
            const hint = expectsValue
                ? tailHint ?? (isFnBody && this.currentReturnType ? this.returnHint(this.currentReturnType) : null)
                : this.needsDiscardHint(stmt) ? DISCARD_HINT : null;
            this.genExpr(stmt, hint, out);
            if (!expectsValue && hint !== DISCARD_HINT && this.exprProducesValue(stmt)) out.push('drop');
        }
    }

    genExpr(node, hint, out) {
        EXPR_GENERATORS[node.type](this, node, hint, out);
    }

    genLiteral(node, hint, out) {
        LITERAL_GENERATORS[literalInfo(node).kind](this, literalInfo(node), this.valueHint(hint), out);
    }

    genInt(value, hint, out) {
        out.push(`${['f32', 'f64', 'i64'].includes(hint) ? hint : 'i32'}.const ${value}`);
    }

    genFloat(value, hint, out) {
        out.push(`${hint === 'f32' ? 'f32' : 'f64'}.const ${value}`);
    }

    genIdent(node, out) {
        const name = node.text;
        out.push(`${this.globalTypeMap.has(name) && !this.localTypes?.has(name) ? 'global' : 'local'}.get $${name}`);
    }

    genAssert(node, out) {
        this.genExpr(kids(node)[0], 'i32', out);
        out.push('i32.eqz', '(if', '  (then', '    unreachable', '  )', ')');
    }

    genUnary(node, hint, out) {
        hint = this.valueHint(hint);
        const op = childOfType(node, 'unary_op').text;
        const expr = kids(node).find(child => child.type !== 'unary_op');
        const wasmType = hint || this.inferType(expr) || 'i32';

        this.genExpr(expr, wasmType, out);
        UNARY_GENERATORS[op](this, wasmType, out);
    }

    genBinary(node, hint, out) {
        hint = this.valueHint(hint);
        const [left, right] = kids(node);
        const op = findAnonBetween(node, left, right);
        const leftType = this.inferType(left) || hint || 'i32';
        const rightType = this.inferType(right) || hint || 'i32';
        const wasmType = this.dominantType(leftType, rightType);

        this.genExprForBinaryOperand(left, leftType, wasmType, out);
        this.genExprForBinaryOperand(right, rightType, wasmType, out);
        out.push(this.binaryInstr(op, wasmType));
    }

    genExprForBinaryOperand(node, sourceType, targetType, out) {
        const sourceWasm = this.wasmTypeStr(sourceType) || targetType;
        this.genExpr(node, sourceWasm, out);
        this.coerceNumeric(sourceWasm, targetType, out);
    }

    binaryInstr(op, wasmType) {
        const isFloat = wasmType === 'f32' || wasmType === 'f64';
        const isUnsigned = wasmType === 'u32' || wasmType === 'u64';
        return BINARY_INSTR_BUILDERS[op]({ base: isUnsigned ? wasmType.replace('u', 'i') : wasmType, isFloat, isUnsigned });
    }

    genTuple(node, out) {
        for (const expr of flattenTuple(node)) this.genExpr(expr, null, out);
    }

    genPipe(node, out) {
        const value = kids(node)[0];
        const target = parsePipeTarget(childOfType(node, 'pipe_target'));
        if (target.kind === 'pipe_call' && target.callee.includes('.')) {
            const [ns, method] = target.callee.split('.');
            return void NS_CALL_HANDLERS[ns](this, method, this.pipedArgs(value, target.args, arg => arg.kind === 'placeholder', arg => arg.value), out);
        }
        this.pushPipedArgs(value, target.kind === 'pipe_ident' ? [] : target.args, out, arg => arg.kind === 'placeholder', arg => arg.value);
        out.push(`call $${target.kind === 'pipe_ident' ? target.name : target.callee}`);
    }

    genElse(node, hint, out) {
        hint = this.valueHint(hint);
        const [expr, fallback] = kids(node);
        if (fallback.type === 'fatal_expr') {
            this.genExpr(expr, null, out);
            out.push('ref.as_non_null');
            return;
        }

        const wasmType = hint || this.wasmTypeStr(this.inferType(fallback)) || this.wasmTypeStr(this.inferType(expr)) || 'externref';
        const label = `$__else_${this.nextUid()}`;
        out.push(`(block ${label} (result ${wasmType})`);
        this.pushGenerated(out, lines => this.genExpr(expr, null, lines), '  ');
        out.push(`  br_on_non_null ${label}`);
        this.pushGenerated(out, lines => this.genExpr(fallback, wasmType, lines), '  ');
        out.push(')');
    }

    genCall(node, out) {
        const callee = kids(node)[0], args = this.args(node);
        const emit = CALL_CALLEE_HANDLERS[callee.type];
        if (emit) return void emit(this, callee, args, out);
        this.pushArgs(args, out);
        this.genExpr(callee, null, out);
        out.push('call_ref');
    }

    genPipeCall(pipeNode, args, out) {
        const value = kids(pipeNode)[0];
        const target = parsePipeTarget(childOfType(pipeNode, 'pipe_target'));
        if (target.kind === 'pipe_call' && target.callee.includes('.')) {
            const [ns, method] = target.callee.split('.');
            return void NS_CALL_HANDLERS[ns](this, method, this.pipedArgs(value, args, arg => arg.type === 'identifier' && arg.text === '_'), out);
        }
        this.pushPipedArgs(value, args, out, arg => arg.type === 'identifier' && arg.text === '_');
        out.push(`call $${target.kind === 'pipe_ident' ? target.name : target.callee}`);
    }

    genField(node, out) {
        const [object, field] = kids(node);
        this.genExpr(object, null, out);
        out.push(`struct.get $${this.inferType(object)} $${field.text}`);
    }

    genIndex(node, out) {
        const [object, index] = kids(node);
        this.genExpr(object, null, out);
        this.genExpr(index, 'i32', out);
        out.push(`array.get ${this.arrayTypeNameFromInferred(this.inferType(object))}`);
    }

    genNsCall(node, out, explicitArgs = null) {
        const { ns, method } = namespaceInfo(node), args = explicitArgs ?? this.args(node);
        const op = SIMPLE_NS_OPS[ns];
        if (op) {
            this.pushArgs(args, out);
            out.push(op);
            return;
        }
        NS_CALL_HANDLERS[ns](this, method, args, out);
    }

    genArrayNsCall(method, args, out) {
        ARRAY_NS_CALL_HANDLERS[method](this, args, out);
    }

    genRefNsCall(method, args, out) {
        if (method === 'cast' || method === 'test') {
            this.genExpr(args[0], null, out);
            const typeName = args[1].text;
            out.push(method === 'cast'
                ? `ref.cast (ref $${typeName})`
                : `ref.test (ref $${typeName})`);
            return;
        }
        this.pushArgs(args.slice(0, method === 'eq' ? 2 : 1), out);
        out.push(REF_NS_OPS[method]);
    }

    genIf(node, hint, out) {
        const branchHint = hint === DISCARD_HINT ? DISCARD_HINT : null;
        hint = this.valueHint(hint);
        const cond = kids(node)[0];
        const thenBlock = kids(node)[1];
        const elseBranch = kids(node)[2] ?? null;
        const resultType = hint || (elseBranch ? this.inferType(thenBlock) : null);
        const branchType = resultType ?? branchHint;
        const resultClause = resultType ? ` (result ${resultType})` : '';

        this.genExpr(cond, 'i32', out);
        out.push(`(if${resultClause}`);
        out.push('  (then');
        this.pushGenerated(out, lines => this.genBody(kids(thenBlock), lines, false, branchType));
        out.push('  )');

        if (elseBranch) {
            out.push('  (else');
            this.pushGenerated(out, lines => this.genBranchExpr(elseBranch, branchType, lines));
            out.push('  )');
        }

        out.push(')');
    }

    genPromote(node, hint, out) {
        const branchHint = hint === DISCARD_HINT ? DISCARD_HINT : null;
        hint = this.valueHint(hint);
        const expr = kids(node)[0];
        const ident = kids(node)[1].text;
        const thenBlock = kids(node)[2];
        const elseBlock = kids(node)[3] ?? null;
        const resultType = hint || this.inferType(thenBlock);
        const branchType = resultType ?? branchHint;
        const resultClause = resultType ? ` (result ${resultType})` : '';

        // Store the nullable value in a temporary local
        const tempName = `__promote_${node.id}`;
        this.genExpr(expr, null, out);
        out.push(`local.set $${tempName}`);

        // Generate if statement based on null check
        this.pushGenerated(out, lines => {
            lines.push(`(ref.is_null (local.get $${tempName}))`);
            lines.push(`(if${resultClause}`);

            // Then branch (null case)
            lines.push('  (then');
            if (elseBlock) {
                this.pushGenerated(lines, ls => this.genBody(kids(elseBlock), ls, false, branchType), '    ');
            } else if (resultType) {
                lines.push('    ' + this.defaultValue(resultType));
            }
            lines.push('  )');

            // Else branch (non-null case)
            lines.push('  (else');
            this.pushGenerated(lines, ls => {
                ls.push(`local.get $${tempName}`);
                ls.push('ref.as_non_null');
                ls.push(`local.set $${ident}`);
            }, '    ');
            this.pushGenerated(lines, ls => this.genBody(kids(thenBlock), ls, false, branchType), '    ');
            lines.push('  )');

            lines.push(')');
        });
    }

    genMatch(node, hint, out) { this.genScalarMatch(node, childrenOfType(node, 'match_arm').map(parseMatchArm), hint, out); }

    genAlt(node, hint, out) { this.genTypeMatch(node, childrenOfType(node, 'alt_arm').map(parseAltArm), hint, out); }

    genTypeMatch(node, arms, hint, out) {
        const discard = hint === DISCARD_HINT;
        hint = this.valueHint(hint);
        const subject = kids(node)[0];
        const subjectType = this.inferType(subject);
        const resultType = discard ? null : (hint || this.inferType(arms[arms.length - 1]?.expr) || null);
        const typedArms = arms.filter(arm => arm.guard !== null);
        const fallback = arms.find(arm => arm.guard === null) ?? null;

        if (typedArms.length === 0) {
            if (!fallback) throw new Error('alt requires at least one typed arm or fallback arm');
            this.genExpr(subject, null, out);
            if (fallback.pattern !== '_') out.push(`local.set $${fallback.pattern}`);
            else out.push('drop');
            this.genBranchExpr(fallback.expr, resultType, out);
            return;
        }

        const exitLabel = `$__alt_exit_${node.id}`;
        const labels = typedArms.map((_, i) => `$__alt_${node.id}_${i}`);

        out.push(`(block ${exitLabel}${resultType ? ` (result ${resultType})` : ''}`);
        for (let i = typedArms.length - 1; i >= 0; i--) {
            out.push(`  (block ${labels[i]} (result (ref $${typedArms[i].guard}))`);
        }
        this.genExpr(subject, null, out);
        for (let i = 0; i < typedArms.length; i++) {
            out.push(`br_on_cast ${labels[i]} (ref $${subjectType}) (ref $${typedArms[i].guard})`);
        }

        if (fallback) {
            if (fallback.pattern !== '_') out.push(`local.set $${fallback.pattern}`);
            else out.push('drop');
            this.genBranchExpr(fallback.expr, resultType, out);
            out.push(`br ${exitLabel}`);
        } else {
            out.push('unreachable');
        }

        for (let i = 0; i < typedArms.length; i++) {
            out.push(')');
            if (typedArms[i].pattern !== '_') out.push(`local.set $${typedArms[i].pattern}`);
            else out.push('drop');
            this.genBranchExpr(typedArms[i].expr, resultType, out);
            if (i !== typedArms.length - 1) out.push(`br ${exitLabel}`);
        }

        out.push(')');
    }

    genScalarMatch(node, arms, hint, out) {
        const discard = hint === DISCARD_HINT;
        hint = this.valueHint(hint);
        const subject = kids(node)[0];
        const tempName = this.scalarMatchTempName(node);
        const resultType = discard ? null : (hint || this.inferType(arms[arms.length - 1].expr) || null);
        const compareType = this.scalarMatchCompareType(this.inferType(subject));

        this.genExpr(subject, compareType, out);
        out.push(`local.set $${tempName}`);
        this.genScalarMatchCases(arms, 0, tempName, compareType, resultType, out);
    }

    genScalarMatchCases(arms, index, tempName, compareType, resultType, out) {
        const arm = arms[index];
        if (!arm) {
            out.push('unreachable');
            return;
        }

        if (!arm.pattern) {
            this.genBranchExpr(arm.expr, resultType, out);
            return;
        }

        out.push(`local.get $${tempName}`);
        this.genScalarPattern(arm.pattern, compareType, out);
        out.push(this.binaryInstr('==', compareType));
        out.push(`(if${resultType ? ` (result ${resultType})` : ''}`);
        out.push('  (then');
        this.pushGenerated(out, lines => this.genBranchExpr(arm.expr, resultType, lines), '    ');
        out.push('  )');
        out.push('  (else');
        this.pushGenerated(out, lines => this.genScalarMatchCases(arms, index + 1, tempName, compareType, resultType, lines), '    ');
        out.push('  )');
        out.push(')');
    }

    genFor(node, out) {
        const sources = parseForSources(childOfType(node, 'for_sources'));
        const captures = parseCapture(childOfType(node, 'capture'));
        const body = childOfType(node, 'block');
        const emitBody = lines => this.genBody(kids(body), lines, false);

        const source = sources[0];
        if (source.kind === 'range') {
            const capture = captures[0] || `__i_${this.uid}`;
            this.genExpr(source.start, 'i32', out);
            out.push(`local.set $${capture}`);
            this.withLoop(out, (breakLabel, continueLabel, uid) => {
                out.push(`    local.get $${capture}`);
                this.pushGenerated(out, lines => this.genExpr(source.end, 'i32', lines));
                out.push('    i32.ge_s');
                out.push(`    br_if ${breakLabel}`);
                this.pushGenerated(out, emitBody);
                this.bumpI32Local(capture, out, '    ');
                this.genProfileTick(out, '    ');
                out.push(`    (br ${continueLabel})`);
            });
            return;
        }
        throw new Error('for loops require a range source');
    }

    genWhile(node, out) {
        const condition = kids(node).find(child => child.type !== 'block') ?? null;
        const body = childOfType(node, 'block');
        const emitBody = lines => this.genBody(kids(body), lines, false);

        this.withLoop(out, (breakLabel, continueLabel) => {
            if (condition) {
                this.pushGenerated(out, lines => this.genExpr(condition, 'i32', lines));
                out.push('    i32.eqz');
                out.push(`    br_if ${breakLabel}`);
            }
            this.pushGenerated(out, emitBody);
            this.genProfileTick(out, '    ');
            out.push(`    (br ${continueLabel})`);
        });
    }

    genBlockExpr(node, hint, out) {
        hint = this.valueHint(hint);
        const labelNode = childOfType(node, 'identifier');
        const block = childOfType(node, 'block');
        const label = labelNode ? `$${labelNode.text}` : `$__block_${this.nextUid()}`;
        const resultClause = hint ? ` (result ${hint})` : '';

        out.push(`(block ${label}${resultClause}`);
        this.labelStack.push({ kind: 'block', wasmLabel: label });
        this.pushGenerated(out, lines => this.genBody(kids(block), lines, false, hint), '  ');
        this.labelStack.pop();
        out.push(')');
    }

    genBreak(node, out) {
        const frame = [...this.labelStack].reverse().find(item => item.kind === 'loop');
        if (!frame) throw new Error('break can only exit loops');
        out.push(`br ${frame.breakLbl}`);
    }

    genEmit(node, out) {
        const value = kids(node)[0];
        const frame = [...this.labelStack].reverse().find(item => item.kind === 'block');
        if (!frame) throw new Error('emit can only exit block expressions');
        this.genExpr(value, null, out);
        out.push(`br ${frame.wasmLabel}`);
    }

    genBenchLoop(bench, out) {
        out.push('i32.const 0');
        out.push(`local.set $${bench.capture}`);
        this.withLoop(out, (breakLabel, continueLabel) => {
            out.push(`    local.get $${bench.capture}`);
            out.push('    local.get $iterations');
            out.push('    i32.ge_s');
            out.push(`    br_if ${breakLabel}`);
            this.pushGenerated(out, lines => this.genBody(kids(bench.measureBody), lines));
            this.bumpI32Local(bench.capture, out, '    ');
            out.push(`    (br ${continueLabel})`);
        });
    }

    genLet(node, out) {
        const targets = parseBindTargets(node);
        const value = kids(node).at(-1);

        if (targets.length === 1) {
            this.genExpr(value, this.wasmType(targets[0].type), out);
            out.push(`local.set $${targets[0].name}`);
            return;
        }

        this.genExpr(value, null, out);
        for (let i = targets.length - 1; i >= 0; i--) {
            out.push(`local.set $${targets[i].name}`);
        }
    }

    genStructInit(node, out) {
        const typeName = childOfType(node, 'type_ident').text;
        const fields = this.typeFields(typeName);
        if (!fields) throw new Error(`Unknown type: ${typeName}`);
        const fieldMap = new Map(
            childrenOfType(node, 'field_init').map(field => [kids(field)[0].text, kids(field)[1]])
        );
        for (const field of fields) {
            const value = fieldMap.get(field.name);
            if (value) this.genExpr(value, this.wasmType(field.type), out);
            else out.push(this.defaultValue(field.type));
        }
        out.push(`struct.new $${typeName}`);
    }

    genArrayInit(node, out) {
        const elemType = parseType(kids(node)[0]), method = kids(node)[1].text, args = this.args(node);
        const elemWasm = this.wasmType(elemType), key = this.elemTypeKey(elemType);
        this.requireArrayType(key);
        const arrayTypeName = this.arrayTypes.get(key);
        ARRAY_INIT_HANDLERS[method](this, args, elemWasm, arrayTypeName, out);
    }

    requireArrayType(key) { if (!this.arrayTypes.has(key)) this.arrayTypes.set(key, `$${key}_array`); }

    genAssign(node, out) {
        const [lhs, rhs] = kids(node);
        const emit = ASSIGN_TARGET_HANDLERS[lhs.type];
        if (emit) return void emit(this, lhs, rhs, out);
    }

    coerceNumeric(from, to, out) {
        if (!from || !to || from === to || !this.isNumericWasmType(from) || !this.isNumericWasmType(to)) return;
        const instr = {
            'f32->f64': 'f64.promote_f32',
            'f64->f32': 'f32.demote_f64',
            'i32->i64': 'i64.extend_i32_s',
            'i32->u64': 'i64.extend_i32_s',
            'u32->i64': 'i64.extend_i32_u',
            'u32->u64': 'i64.extend_i32_u',
            'i32->f32': 'f32.convert_i32_s',
            'i32->f64': 'f64.convert_i32_s',
            'u32->f32': 'f32.convert_i32_u',
            'u32->f64': 'f64.convert_i32_u',
            'i64->f32': 'f32.convert_i64_s',
            'i64->f64': 'f64.convert_i64_s',
            'u64->f32': 'f32.convert_i64_u',
            'u64->f64': 'f64.convert_i64_u',
            'i64->i32': 'i32.wrap_i64',
            'i64->u32': 'i32.wrap_i64',
            'u64->i32': 'i32.wrap_i64',
            'u64->u32': 'i32.wrap_i64',
        }[`${from}->${to}`];
        if (!instr) throw new Error(`Unsupported numeric coercion from ${from} to ${to}`);
        out.push(instr);
    }

    isNumericWasmType(type) {
        return type === 'i32' || type === 'u32' || type === 'i64' || type === 'u64' || type === 'f32' || type === 'f64';
    }

    wasmType(type) {
        if (type.kind === 'scalar') return this.scalarWasmType(type.name);
        if (type.kind === 'named') return this.namedWasmType(type.name);
        if (type.kind === 'nullable') return this.nullableWasmType(type.inner);
        if (type.kind === 'array') return this.arrayWasmType(type.elem);
        if (type.kind === 'func_type') return `(ref $func_${this.funcTypeKey(type)})`;
        return ['exclusive', 'multi_return'].includes(type.kind) ? '' : 'i32';
    }

    scalarWasmType(name) { return SCALAR_WASM[name] || name; }
    namedWasmType(name) { return REF_WASM[name] || `(ref $${name})`; }
    nullableWasmType(inner) { return !inner ? 'externref' : inner.kind === 'named' ? NULLABLE_REF_WASM[inner.name] || `(ref null $${inner.name})` : this.wasmType(inner); }
    arrayWasmType(elemType) {
        const key = this.elemTypeKey(elemType);
        this.requireArrayType(key);
        return `(ref ${this.arrayTypes.get(key)})`;
    }
    elemKeyWasmType(key) { return SCALAR_WASM[key] || REF_WASM[key] || `(ref $${key})`; }
    watResultList(returnType) { return this.flattenResultTypes(returnType).map(type => `(result ${type})`).join(' '); }

    flattenResultTypes(type) {
        if (!type) return [];
        if (type.kind === 'exclusive') return [this.nullableWasmTypeFor(type.ok), this.nullableWasmTypeFor(type.err)];
        if (type.kind === 'multi_return') return type.components.flatMap(component => this.flattenResultTypes(component));
        return [this.wasmType(type)];
    }

    nullableWasmTypeFor(type) { return !type ? 'i32' : type.kind === 'named' ? this.nullableWasmType(type) : type.kind === 'nullable' ? this.nullableWasmType(type.inner) : this.wasmType(type); }
    funcTypeKey(type) { return `${type.params.map(param => this.wasmType(param)).join('_')}_to_${this.watResultList(type.returnType).replace(/[() ]/g, '_')}`; }
    returnHint(returnType) { const results = this.flattenResultTypes(returnType); return results.length === 1 ? results[0] : null; }
    wasmTypeStr(inferredType) { return !inferredType ? null : typeof inferredType === 'string' ? this.scalarWasmType(inferredType) : this.wasmType(inferredType); }
    valueHint(hint) { return hint === DISCARD_HINT ? null : hint; }
    needsDiscardHint(node) { return DISCARD_HINT_NODES.has(node.type); }
    genBranchExpr(node, hint, out) {
        if (node.type === 'block') return void this.genBody(kids(node), out, false, hint);
        this.genExpr(node, hint ?? DISCARD_HINT, out);
        if (!hint && this.discardedExprLeavesValue(node)) out.push('drop');
    }
    discardedExprLeavesValue(node) { return this.exprProducesValue(node) && !this.needsDiscardHint(node) && node.type !== 'fatal_expr'; }

    dominantType(left, right) {
        if (left === 'f64' || right === 'f64') return 'f64';
        if (left === 'f32' || right === 'f32') return 'f32';
        if (left === 'i64' || right === 'i64') return 'i64';
        if (left === 'u64' || right === 'u64') return 'u64';
        if (left === 'u32' || right === 'u32') return 'u32';
        return left || right || 'i32';
    }

    inferType(node) { return INFER_TYPE_HANDLERS[node.type]?.(this, node) ?? null; }
    fnName(fn) { return textOf(fn.node, 'identifier'); }
    fnParams(fn) { return parseParamList(childOfType(fn.node, 'param_list')); }
    fnReturnType(fn) { return parseReturnType(childOfType(fn.node, 'return_type')); }
    fnBody(fn) { return childOfType(fn.node, 'block'); }
    inferredToType(inferred) { return inferred ? { kind: SCALAR_NAMES.has(inferred) ? 'scalar' : 'named', name: inferred } : null; }
    exprType(node) {
        if (!node) return null;
        switch (node.type) {
            case 'identifier':
                return this.localTypes?.get(node.text) ?? this.globalTypeMap.get(node.text) ?? null;
            case 'paren_expr':
            case 'unary_expr':
                return this.exprType(kids(node).at(-1));
            case 'field_expr': {
                const [object, field] = kids(node);
                return this.lookupFieldType(this.inferType(object), field.text);
            }
            case 'index_expr': {
                const elem = this.arrayElemKeyFromInferred(this.inferType(kids(node)[0]));
                return this.inferredToType(elem);
            }
            case 'call_expr': {
                const callee = kids(node)[0];
                return callee.type === 'identifier'
                    ? this.lookupCallableReturnType(callee.text)
                    : callee.type === 'namespace_call_expr'
                        ? this.inferredToType(this.inferNsCallType(namespaceInfo(callee), this.args(node)))
                        : null;
            }
            case 'pipe_expr': {
                const target = parsePipeTarget(childOfType(node, 'pipe_target'));
                if (target.kind === 'pipe_ident') return this.lookupCallableReturnType(target.name);
                if (target.callee.includes('.')) {
                    const [ns, method] = target.callee.split('.');
                    return this.inferredToType(this.inferNsCallType({ ns, method }, pipeArgValues(target)));
                }
                return this.lookupCallableReturnType(target.callee);
            }
            case 'namespace_call_expr':
                return this.inferredToType(this.inferNsCallType(namespaceInfo(node), this.args(node)));
            case 'struct_init':
                return { kind: 'named', name: childOfType(node, 'type_ident').text };
            case 'array_init':
                return { kind: 'array', elem: parseType(kids(node)[0]) };
            case 'if_expr':
                return this.exprType(kids(node)[1]);
            case 'promote_expr':
                return this.exprType(kids(node)[2]);
            case 'block':
                return this.exprType(kids(node).at(-1));
            default:
                return this.inferredToType(this.inferType(node));
        }
    }
    typeName(type) { return !type ? null : type.kind === 'array' ? `${this.elemTypeKey(type.elem)}_array` : ['scalar', 'named'].includes(type.kind) ? type.name : null; }
    typeFields(typeName) { return this.typeDeclMap.get(typeName)?.fields ?? this.variantDecls.get(typeName)?.fields ?? null; }

    lookupFieldType(typeName, fieldName) {
        return this.typeFields(typeName)?.find(field => field.name === fieldName)?.type ?? null;
    }

    arrayTypeNameFromInferred(inferred) { return `$${inferred.endsWith('_array') ? inferred : `${inferred}_array`}`; }
    arrayElemKeyFromInferred(inferred) { return inferred?.endsWith('_array') ? inferred.slice(0, -6) : null; }
    scalarMatchTempName(node) { return `__match_subj_${node.id}`; }
    lookupCallable(name) {
        const fn = this.fnItems.find(item => this.fnName(item) === name);
        return fn ? { params: this.fnParams(fn), returnType: this.fnReturnType(fn) } : this.importFns.find(item => item.name === name) ?? null;
    }
    lookupCallableReturnType(name) { return this.lookupCallable(name)?.returnType ?? null; }
    genScalarPattern(node, hint, out) {
        const patternNode = node.type === 'match_lit' ? kids(node)[0] ?? node : node;
        const emit = SCALAR_PATTERN_GENERATORS[patternNode.type];
        if (emit) return emit(this, patternNode, hint, out);
        if (node.text === 'true' || node.text === 'false') {
            out.push(`i32.const ${node.text === 'true' ? 1 : 0}`);
            return;
        }
        throw new Error(`Unsupported scalar match pattern: ${node.text}`);
    }
    scalarMatchCompareType(inferred) { return SCALAR_MATCH_COMPARE_TYPES[inferred] || 'i32'; }

    refNullTarget(name) { return name === 'str' || name === 'externref' ? 'extern' : `$${name}`; }
    defaultValue(type) {
        const emit = DEFAULT_VALUE_GENERATORS[type?.kind];
        if (emit) return emit(this, type);
        return `${this.scalarWasmType(type?.name || 'i32')}.const 0`;
    }

    nullLiteralTarget(hint) {
        if (!hint) return 'none';
        const match = /^\(ref(?: null)? (\$[A-Za-z_][A-Za-z0-9_]*)\)$/.exec(hint);
        return REF_NULL_TARGETS[hint] ?? match?.[1] ?? 'none';
    }

    nullableNullTarget(inner) { return inner?.kind === 'named' ? this.refNullTarget(inner.name) : 'none'; }
    genExprInline(node, hint) { const out = []; this.genExpr(node, hint, out); return out.join(' '); }
    inferNsCallType({ ns, method }, args) {
        const infer = INFER_NS_CALL_HANDLERS[ns];
        if (infer) return infer(this, method, args);
        return SIMPLE_NS_RETURN_TYPES[ns] ?? null;
    }

    exprProducesValue(node) {
        if (VALUELESS_EXPR_TYPES.has(node.type)) return false;
        if (INFERRED_VALUE_EXPR_TYPES.has(node.type)) {
            return this.inferType(node) !== null;
        }
        return true;
    }
}

const parseStructDecl = (node) => ({ kind: 'struct_decl', name: textOf(node, 'type_ident'), fields: parseFieldList(childOfType(node, 'field_list')), rec: hasAnon(node, 'rec') });
const parseTypeDecl = (node) => ({ kind: 'type_decl', name: textOf(node, 'type_ident'), variants: parseVariantList(childOfType(node, 'variant_list')), rec: true });
const parseImportDecl = (node) => {
    const [moduleNode, nameNode, typeNode] = kids(node), module = moduleNode.text.slice(1, -1), name = nameNode.text;
    const { hostName } = parseHostImportName(name);
    return hasAnon(node, '(')
        ? { kind: 'import_fn', module, name, hostName, params: parseImportParamList(childOfType(node, 'import_param_list')), returnType: parseReturnType(childOfType(node, 'return_type')) }
        : { kind: 'import_val', module, name, hostName, type: parseType(typeNode) };
};
const parseJsgenDecl = (node, index) => ({
    kind: 'import_fn',
    module: '',
    name: textOf(node, 'identifier'),
    hostName: String(index),
    jsSource: childOfType(node, 'jsgen_lit')?.text.slice(1, -1) ?? '',
    params: parseImportParamList(childOfType(node, 'import_param_list')),
    returnType: parseReturnType(childOfType(node, 'return_type')),
});

const parseFieldList = (node) => mapType(node, 'field', parseField);
const parseField = (node) => {
    const [name, type] = kids(node);
    return { kind: 'field', mut: hasAnon(node, 'mut'), name: name.text, type: parseType(type) };
};
const parseVariantList = (node) => mapType(node, 'variant', parseVariant);
const parseVariant = (node) => ({ kind: 'variant', name: textOf(node, 'type_ident'), fields: parseFieldList(childOfType(node, 'field_list')) });
const parseParamList = (node) => mapType(node, 'param', parseParam);
const parseParam = (node) => {
    const [name, type] = kids(node);
    return { kind: 'param', name: name.text, type: parseType(type) };
};
const parseImportParamList = (node) => kids(node).map(child => child.type === 'param' ? parseParam(child) : { kind: 'anon_param', type: parseType(child) });

function parseType(node) {
    return node ? PARSE_TYPE_HANDLERS[node.type](node) : null;
}

function parseReturnType(node) {
    if (!node) return null;
    if (childOfType(node, 'void_type')) return null;
    const components = [];
    for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (!child.isNamed) continue;
        if (child.type === 'void_type') continue;
        const ok = parseType(child), hash = node.children[i + 1]?.type === '#';
        const err = hash && node.children[i + 2]?.isNamed ? parseType(node.children[i + 2]) : null;
        components.push(hash && err ? { kind: 'exclusive', ok, err } : ok);
        if (hash) i += err ? 2 : 1;
    }
    return !components.length ? null : components.length === 1 ? components[0] : { kind: 'multi_return', components };
}

const parsePipeTarget = (node) => {
    const argsNode = childOfType(node, 'pipe_args');
    const callee = kids(node).filter(child => child.type === 'identifier').map(child => child.text).join('.');
    return argsNode ? { kind: 'pipe_call', callee, args: parsePipeArgs(argsNode) } : { kind: 'pipe_ident', name: callee };
};
const pipeCallee = (target) => target.kind === 'pipe_ident' ? target.name : target.callee;
const parsePipeArgs = (node) => namedChildren(node)
    .flatMap(child => child.type === 'pipe_args_with_placeholder' || child.type === 'pipe_args_no_placeholder' ? namedChildren(child) : [child])
    .filter(child => child.type === 'pipe_arg' || child.type === 'pipe_arg_placeholder')
    .map(arg => arg.type === 'pipe_arg_placeholder' ? { kind: 'placeholder' } : { kind: 'arg', value: kids(arg)[0] });
const pipeArgValues = (target) => target.args.filter(arg => arg.kind === 'arg').map(arg => arg.value);
const namespaceInfo = (node) => ({ ns: node.children[0].text, method: childOfType(node, 'identifier').text });
const parseForSources = (node) => mapType(node, 'for_source', parseForSource);
const parseForSource = (node) => ({ kind: 'range', start: kids(node)[0], end: kids(node)[1] });
const parseCapture = (node) => mapType(node, 'identifier', child => child.text);
const parseMatchArm = (node) => {
    const named = kids(node), [first] = named;
    return { pattern: named.length === 2 ? first : null, expr: named.at(-1) };
};
const parseAltArm = (node) => {
    const named = kids(node);
    const typeNode = named.find(child => child.type === 'type_ident') ?? null;
    const identNode = named[0]?.type === 'identifier' ? named[0] : null;
    return { pattern: identNode?.text ?? '_', guard: typeNode?.text ?? null, expr: named.at(-1) };
};
const parseBindTargets = (node) => childrenOfType(node, 'bind_target').map(target => ({ name: kids(target)[0].text, type: parseType(kids(target)[1]) }));

function literalInfo(node) {
    const child = kids(node)[0];
    const string = stringLiteralValue(node);
    if (string !== null) return { kind: 'string', value: string };
    if (child?.type === 'int_lit') return { kind: 'int', value: parseIntLit(child.text) };
    if (child?.type === 'float_lit') return { kind: 'float', value: parseFloat(child.text) };
    return LITERAL_TEXT_INFO[node.text];
}

const parseIntLit = (text) => text.startsWith('0x') ? parseInt(text.slice(2), 16) : text.startsWith('0b') ? parseInt(text.slice(2), 2) : parseInt(text, 10);
const flattenTuple = (node, out = []) => {
    if (node.type === 'tuple_expr') {
        for (const child of kids(node)) flattenTuple(child, out);
        return out;
    }
    out.push(node);
    return out;
};

const mapType = (node, type, parse) => childrenOfType(node, type).map(parse);
const textOf = (node, type) => childOfType(node, type).text;
