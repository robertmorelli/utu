import {
    rootNode,
    childOfType,
    childrenOfType,
    hasAnon,
    walk,
    walkBlock,
    stringLiteralValue,
    findAnonBetween,
} from './tree.js';

export class WatError extends Error {}

export function watgen(treeOrNode) {
    return new WatGen(rootNode(treeOrNode)).generate();
}

const SCALAR_WASM = {
    i32: 'i32', u32: 'i32',
    i64: 'i64', u64: 'i64',
    f32: 'f32', f64: 'f64',
    bool: 'i32', v128: 'v128',
};
const REF_WASM = { str: 'externref', externref: 'externref', anyref: 'anyref', eqref: 'eqref', i31: 'i31ref' };
const NULLABLE_REF_WASM = { str: 'externref', externref: 'externref', anyref: 'anyref' };
const SCALAR_NAMES = new Set(['i32', 'u32', 'i64', 'u64', 'f32', 'f64', 'v128', 'bool']);

const STR_BUILTINS = {
    length: { importName: 'length', sig: '(param externref) (result i32)' },
    char_code_at: { importName: 'charCodeAt', sig: '(param externref i32) (result i32)' },
    concat: { importName: 'concat', sig: '(param externref externref) (result externref)' },
    substring: { importName: 'substring', sig: '(param externref i32 i32) (result externref)' },
    equals: { importName: 'equals', sig: '(param externref externref) (result i32)' },
    from_char_code_array: { importName: 'fromCharCodeArray', sig: '(param (ref $i16_array) i32 i32) (result externref)' },
    into_char_code_array: { importName: 'intoCharCodeArray', sig: '(param externref (ref $i16_array) i32) (result i32)' },
    from_char_code: { importName: 'fromCharCode', sig: '(param i32) (result externref)' },
};

class WatGen {
    constructor(root) {
        this.root = root;

        this.structDecls = [];
        this.typeDecls = [];
        this.variantDecls = new Map();
        this.fnItems = [];
        this.globalDecls = [];
        this.importFns = [];
        this.importVals = [];

        this.typeDeclMap = new Map();
        this.globalTypeMap = new Map();

        this.strings = new Map();
        this.stringList = [];
        this.arrayTypes = new Map();
        this.usedStrBuiltins = new Set();

        this.localTypes = null;
        this.labelStack = [];
        this.currentReturnType = null;
        this.uid = 0;
    }

    nextUid() { return this.uid++; }
    generate() { this.collect(); this.scanAll(); return this.emit(); }

    collect() {
        for (const item of this.root.namedChildren) {
            switch (item.type) {
                case 'struct_decl': {
                    const decl = parseStructDecl(item);
                    this.structDecls.push(decl);
                    this.typeDeclMap.set(decl.name, decl);
                    break;
                }
                case 'type_decl': {
                    const decl = parseTypeDecl(item);
                    this.typeDecls.push(decl);
                    this.typeDeclMap.set(decl.name, decl);
                    for (const variant of decl.variants) this.variantDecls.set(variant.name, variant);
                    break;
                }
                case 'fn_decl':
                    this.fnItems.push({ ...parseFnDecl(item), exported: false });
                    break;
                case 'global_decl': {
                    const decl = parseGlobalDecl(item);
                    this.globalDecls.push(decl);
                    this.globalTypeMap.set(decl.name, decl.type);
                    break;
                }
                case 'import_decl': {
                    const decl = parseImportDecl(item);
                    if (decl.kind === 'import_fn') {
                        this.importFns.push(decl);
                    } else {
                        this.importVals.push(decl);
                        this.globalTypeMap.set(decl.name, decl.type);
                    }
                    break;
                }
                case 'export_decl': {
                    const fn = parseFnDecl(childOfType(item, 'fn_decl'));
                    this.fnItems.push({ ...fn, exported: true, exportName: fn.name });
                    break;
                }
                default:
                    throw new WatError(`Unknown top-level item: ${item.type}`);
            }
        }
    }

    scanAll() {
        for (const { body } of this.fnItems) this.scanNode(body);
        for (const global of this.globalDecls) this.scanNode(global.value);
    }

    scanNode(node) {
        walk(node, child => {
            const value = stringLiteralValue(child);
            if (value !== null) this.internString(value);

            if (child.type === 'namespace_call_expr') {
                const { ns, method } = namespaceInfo(child);
                if (ns === 'str' && STR_BUILTINS[method]) this.usedStrBuiltins.add(method);
            }

            if (child.type === 'pipe_expr') {
                this.noteBuiltin(pipeCallee(parsePipeTarget(childOfType(child, 'pipe_target'))));
            }
        });
    }

    noteBuiltin(callee = '') {
        if (!callee.startsWith('str.')) return;
        const method = callee.slice(4);
        if (STR_BUILTINS[method]) this.usedStrBuiltins.add(method);
    }

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

        const typeDefs = this.emitTypeDefs();
        if (typeDefs.length > 0) {
            lines.push('  (rec');
            for (const def of typeDefs) lines.push(def);
            lines.push('  )');
        }

        for (let i = 0; i < this.stringList.length; i++) {
            lines.push(`  (import "__strings" "${i}" (global $__s${i} externref))`);
        }

        for (const method of this.usedStrBuiltins) {
            const builtin = STR_BUILTINS[method];
            lines.push(`  (import "wasm:js-string" "${builtin.importName}" (func $str.${method} ${builtin.sig}))`);
        }

        for (const imp of this.importFns) lines.push(this.emitImportFn(imp));
        for (const imp of this.importVals) lines.push(this.emitImportVal(imp));
        for (const global of this.globalDecls) lines.push(this.emitGlobal(global));

        for (const fn of this.fnItems) {
            lines.push(this.emitFn(fn));
            if (fn.exported) {
                lines.push(`  (export "${fn.exportName}" (func $${fn.name}))`);
            }
        }

        lines.push(')');
        return lines.join('\n');
    }

    collectArrayTypes() {
        const visitType = (type) => {
            if (!type) return;
            switch (type.kind) {
                case 'array': {
                    const key = this.elemTypeKey(type.elem);
                    if (!this.arrayTypes.has(key)) this.arrayTypes.set(key, `$${key}_array`);
                    visitType(type.elem);
                    return;
                }
                case 'nullable':
                    visitType(type.inner);
                    return;
                case 'exclusive':
                    visitType(type.ok);
                    visitType(type.err);
                    return;
                case 'multi_return':
                    for (const component of type.components) visitType(component);
                    return;
                case 'func_type':
                    for (const param of type.params) visitType(param);
                    visitType(type.returnType);
                    return;
                default:
                    return;
            }
        };

        for (const decl of this.structDecls) {
            for (const field of decl.fields) visitType(field.type);
        }

        for (const decl of this.typeDecls) {
            for (const variant of decl.variants) {
                for (const field of variant.fields) visitType(field.type);
            }
        }

        for (const fn of this.fnItems) {
            for (const param of fn.params) visitType(param.type);
            visitType(fn.returnType);
            walkBlock(fn.body, node => {
                if (node.type === 'bind_expr') {
                    for (const target of parseBindTargets(node)) visitType(target.type);
                }
                if (node.type === 'array_init') {
                    visitType(parseType(node.namedChildren[0]));
                }
            });
        }

        for (const imp of this.importFns) {
            for (const param of imp.params) visitType(param.type);
            visitType(imp.returnType);
        }

        for (const global of this.globalDecls) visitType(global.type);
    }

    elemTypeKey(type) {
        if (!type) return 'unknown';
        switch (type.kind) {
            case 'scalar': return type.name;
            case 'named': return type.name;
            case 'array': return `${this.elemTypeKey(type.elem)}_array`;
            default: return 'unknown';
        }
    }

    emitTypeDefs() {
        return [
            ...this.structDecls.map(decl => this.emitStructType(decl)),
            ...this.typeDecls.flatMap(decl => this.emitSumType(decl)),
            ...[...this.arrayTypes].map(([key, name]) => `    (type ${name} (array (mut ${this.elemKeyWasmType(key)})))`),
        ];
    }

    emitStructType(decl) {
        const fields = decl.fields.map(field => this.watField(field)).join(' ');
        return `    (type $${decl.name} (struct${fields ? ` ${fields}` : ''}))`;
    }

    emitSumType(decl) {
        const lines = [`    (type $${decl.name} (struct))`];
        for (const variant of decl.variants) {
            const fields = variant.fields.map(field => this.watField(field)).join(' ');
            lines.push(`    (type $${variant.name} (sub $${decl.name} (struct${fields ? ` ${fields}` : ''})))`);
        }
        return lines;
    }

    watField(field) {
        const wasmType = this.wasmType(field.type);
        return field.mut ? `(field $${field.name} (mut ${wasmType}))` : `(field $${field.name} ${wasmType})`;
    }

    emitImportFn(imp) {
        const params = imp.params
            .map(param => `(param ${this.wasmType(param.type)})`)
            .join(' ');
        const results = imp.returnType ? ` ${this.watResultList(imp.returnType)}` : '';
        const sig = [params, results].filter(Boolean).join(' ');
        return `  (import "${imp.module}" "${imp.name}" (func $${imp.name}${sig ? ` ${sig}` : ''}))`;
    }

    emitImportVal(imp) { return `  (import "${imp.module}" "${imp.name}" (global $${imp.name} ${this.wasmType(imp.type)}))`; }
    emitGlobal(global) { return `  (global $${global.name} ${this.wasmType(global.type)} ${this.genExprInline(global.value, this.wasmType(global.type))})`; }

    emitFn(fn) {
        this.localTypes = new Map(fn.params.map(param => [param.name, param.type]));
        this.currentReturnType = fn.returnType;
        this.labelStack = [];
        const locals = this.collectLocals(fn.body);

        const params = fn.params
            .map(param => `(param $${param.name} ${this.wasmType(param.type)})`)
            .join(' ');
        const results = fn.returnType ? ` ${this.watResultList(fn.returnType)}` : '';
        const sig = [params, results].filter(Boolean).join(' ');

        const lines = [`  (func $${fn.name}${sig ? ` ${sig}` : ''}`];
        const declared = new Set(fn.params.map(param => param.name));

        for (const local of locals) {
            if (declared.has(local.name)) continue;
            lines.push(`    (local $${local.name} ${this.wasmType(local.type)})`);
            declared.add(local.name);
        }

        const bodyLines = [];
        this.genBlock(fn.body, bodyLines, true);
        this.pushLines(lines, bodyLines);
        lines.push('  )');
        return lines.join('\n');
    }

    collectLocals(block) {
        const locals = [];
        const seen = new Set();
        walkBlock(block, node => {
            if (node.type === 'bind_expr') {
                for (const target of parseBindTargets(node)) this.addLocal(locals, seen, target.name, target.type);
                return;
            }
            if (node.type === 'for_expr') {
                parseForSources(childOfType(node, 'for_sources')).forEach((source, i) => {
                    if (source.kind === 'range') {
                        const name = parseCapture(childOfType(node, 'capture'))[i];
                        if (name) this.addLocal(locals, seen, name, { kind: 'scalar', name: 'i32' });
                    }
                });
                return;
            }
            if (node.type !== 'match_expr') return;

            const subjectType = this.inferredToType(this.inferType(node.namedChildren[0])) ?? { kind: 'scalar', name: 'i32' };
            const arms = childrenOfType(node, 'match_arm').map(parseMatchArm);
            if (!arms.some(arm => arm.guard !== null)) {
                this.addLocal(locals, seen, this.scalarMatchTempName(node), subjectType);
            }
            for (const arm of arms) {
                if (arm.pattern !== '_') {
                    this.addLocal(locals, seen, arm.pattern, arm.guard ? { kind: 'named', name: arm.guard } : subjectType);
                }
            }
        });
        return locals;
    }

    addLocal(locals, seen, name, type) {
        if (seen.has(name) || this.localTypes.has(name)) return;
        seen.add(name);
        locals.push({ name, type });
        this.localTypes.set(name, type);
    }

    args(node) { return childOfType(node, 'arg_list')?.namedChildren ?? []; }
    pushArgs(args, out, hint = null) { for (const arg of args) this.genExpr(arg, hint, out); }
    pushLines(out, lines, prefix = '    ') { for (const line of lines) out.push(`${prefix}${line}`); }

    genBlock(block, out, isFnBody = false) {
        const stmts = block.namedChildren;
        for (let i = 0; i < stmts.length; i++) {
            const stmt = stmts[i];
            const isLast = i === stmts.length - 1;
            const hint = isLast && isFnBody && this.currentReturnType
                ? this.returnHint(this.currentReturnType)
                : null;

            this.genExpr(stmt, hint, out);

            if (!isLast && this.exprProducesValue(stmt)) {
                out.push('drop');
            }
        }
    }

    genExpr(node, hint, out) {
        switch (node.type) {
            case 'literal': this.genLiteral(node, hint, out); return;
            case 'identifier': this.genIdent(node, out); return;
            case 'paren_expr': this.genExpr(node.namedChildren[0], hint, out); return;
            case 'unary_expr': this.genUnary(node, hint, out); return;
            case 'binary_expr': this.genBinary(node, hint, out); return;
            case 'tuple_expr': this.genTuple(node, out); return;
            case 'pipe_expr': this.genPipe(node, out); return;
            case 'else_expr': this.genElse(node, hint, out); return;
            case 'call_expr': this.genCall(node, out); return;
            case 'field_expr': this.genField(node, out); return;
            case 'index_expr': this.genIndex(node, out); return;
            case 'namespace_call_expr':
                if (hasCallParens(node)) this.genNsCall(node, out);
                else this.genNsRef(node);
                return;
            case 'ref_null_expr':
                out.push(`ref.null $${childOfType(node, 'type_ident').text}`);
                return;
            case 'if_expr': this.genIf(node, hint, out); return;
            case 'match_expr': this.genMatch(node, hint, out); return;
            case 'for_expr': this.genFor(node, out); return;
            case 'block_expr': this.genBlockExpr(node, hint, out); return;
            case 'break_expr': this.genBreak(node, out); return;
            case 'bind_expr': this.genLet(node, out); return;
            case 'struct_init': this.genStructInit(node, out); return;
            case 'array_init': this.genArrayInit(node, out); return;
            case 'assign_expr': this.genAssign(node, out); return;
            case 'unreachable_expr':
                out.push('unreachable');
                return;
            default:
                throw new WatError(`Unknown expr node: ${node.type}`);
        }
    }

    genLiteral(node, hint, out) {
        const literal = literalInfo(node);
        switch (literal.kind) {
            case 'int': this.genInt(literal.value, hint, out); return;
            case 'float': this.genFloat(literal.value, hint, out); return;
            case 'bool': out.push(`i32.const ${literal.value ? 1 : 0}`); return;
            case 'null': out.push('ref.null none'); return;
            case 'string': out.push(`global.get $__s${this.internString(literal.value)}`); return;
            default: throw new WatError(`Unknown literal kind: ${literal.kind}`);
        }
    }

    genInt(value, hint, out) {
        if (hint === 'f32') return void out.push(`f32.const ${value}`);
        if (hint === 'f64') return void out.push(`f64.const ${value}`);
        if (hint === 'i64') return void out.push(`i64.const ${value}`);
        out.push(`i32.const ${value}`);
    }

    genFloat(value, hint, out) {
        if (hint === 'f32') return void out.push(`f32.const ${value}`);
        out.push(`f64.const ${value}`);
    }

    genIdent(node, out) {
        const name = node.text;
        out.push(`${this.globalTypeMap.has(name) && !this.localTypes?.has(name) ? 'global' : 'local'}.get $${name}`);
    }

    genUnary(node, hint, out) {
        const op = childOfType(node, 'unary_op').text;
        const expr = node.namedChildren.find(child => child.type !== 'unary_op');
        const wasmType = hint || this.inferType(expr) || 'i32';

        this.genExpr(expr, wasmType, out);

        switch (op) {
            case '-':
                if (wasmType === 'f32') out.push('f32.neg');
                else if (wasmType === 'f64') out.push('f64.neg');
                else {
                    out.push(`${wasmType}.const -1`);
                    out.push(`${wasmType}.mul`);
                }
                return;
            case 'not':
                out.push('i32.eqz');
                return;
            case '~':
                out.push(`${wasmType}.const -1`);
                out.push(`${wasmType}.xor`);
                return;
            default:
                throw new WatError(`Unknown unary op: ${op}`);
        }
    }

    genBinary(node, hint, out) {
        const [left, right] = node.namedChildren;
        const op = findAnonBetween(node, left, right);
        const leftType = this.inferType(left) || hint || 'i32';
        const rightType = this.inferType(right) || hint || 'i32';
        const wasmType = this.dominantType(leftType, rightType);

        this.genExpr(left, wasmType, out);
        this.genExpr(right, wasmType, out);
        out.push(this.binaryInstr(op, wasmType));
    }

    binaryInstr(op, wasmType) {
        const isFloat = wasmType === 'f32' || wasmType === 'f64';
        const isUnsigned = wasmType === 'u32' || wasmType === 'u64';
        const base = isUnsigned ? wasmType.replace('u', 'i') : wasmType;

        switch (op) {
            case '+': return `${base}.add`;
            case '-': return `${base}.sub`;
            case '*': return `${base}.mul`;
            case '/': return isFloat ? `${base}.div` : (isUnsigned ? `${base}.div_u` : `${base}.div_s`);
            case '%': return isFloat ? `${base}.rem` : (isUnsigned ? `${base}.rem_u` : `${base}.rem_s`);
            case '&': return `${base}.and`;
            case '|': return `${base}.or`;
            case '^': return `${base}.xor`;
            case '<<': return `${base}.shl`;
            case '>>': return isUnsigned ? `${base}.shr_u` : `${base}.shr_s`;
            case '>>>': return `${base}.shr_u`;
            case '==': return `${base}.eq`;
            case '!=': return `${base}.ne`;
            case '<': return isFloat ? `${base}.lt` : (isUnsigned ? `${base}.lt_u` : `${base}.lt_s`);
            case '>': return isFloat ? `${base}.gt` : (isUnsigned ? `${base}.gt_u` : `${base}.gt_s`);
            case '<=': return isFloat ? `${base}.le` : (isUnsigned ? `${base}.le_u` : `${base}.le_s`);
            case '>=': return isFloat ? `${base}.ge` : (isUnsigned ? `${base}.ge_u` : `${base}.ge_s`);
            case 'and': return `${base}.and`;
            case 'or': return `${base}.or`;
            default: throw new WatError(`Unknown binary op: ${op}`);
        }
    }

    genTuple(node, out) {
        for (const expr of flattenTuple(node)) this.genExpr(expr, null, out);
    }

    genPipe(node, out) {
        const value = node.namedChildren[0];
        const target = parsePipeTarget(childOfType(node, 'pipe_target'));

        if (target.kind === 'pipe_ident') {
            this.genExpr(value, null, out);
            out.push(`call $${target.name}`);
            return;
        }

        const hasPlaceholder = target.args.some(arg => arg.kind === 'placeholder');
        if (!hasPlaceholder) this.genExpr(value, null, out);

        for (const arg of target.args) {
            if (arg.kind === 'placeholder') this.genExpr(value, null, out);
            else this.genExpr(arg.value, null, out);
        }

        out.push(`call $${target.callee}`);
    }

    genElse(node, hint, out) {
        const [expr, fallback] = node.namedChildren;
        const innerType = this.inferType(expr);
        const wasmType = innerType ? this.wasmTypeStr(innerType) : (hint || 'externref');

        if (fallback.type === 'unreachable_expr') {
            this.genExpr(expr, wasmType, out);
            out.push('ref.as_non_null');
            return;
        }

        const label = `$__else_${this.nextUid()}`;
        out.push(`(block ${label} (result ${wasmType})`);
        out.push(`  (br_on_non_null ${label}`);
        const exprLines = [];
        this.genExpr(expr, wasmType, exprLines);
        for (const line of exprLines) out.push(`  ${line}`);
        out.push('  )');
        this.genExpr(fallback, wasmType, out);
        out.push(')');
    }

    genCall(node, out) {
        const callee = node.namedChildren[0];
        const args = this.args(node);

        if (callee.type === 'pipe_expr') {
            this.genPipeCall(callee, args, out);
            return;
        }

        for (const arg of args) this.genExpr(arg, null, out);

        if (callee.type === 'identifier') {
            out.push(`call $${callee.text}`);
            return;
        }

        if (callee.type === 'index_expr') {
            const object = callee.namedChildren[0];
            const index = callee.namedChildren[1];
            this.genExpr(object, null, out);
            this.genExpr(index, 'i32', out);
            out.push(`array.get ${this.arrayTypeNameFromInferred(this.inferType(object))}`);
            out.push('call_ref');
            return;
        }

        this.genExpr(callee, null, out);
        out.push('call_ref');
    }

    genPipeCall(pipeNode, args, out) {
        const value = pipeNode.namedChildren[0];
        const target = parsePipeTarget(childOfType(pipeNode, 'pipe_target'));
        const callee = target.kind === 'pipe_ident' ? target.name : target.callee;
        const hasPlaceholder = args.some(arg => arg.type === 'identifier' && arg.text === '_');

        if (!hasPlaceholder) this.genExpr(value, null, out);

        for (const arg of args) {
            if (arg.type === 'identifier' && arg.text === '_') this.genExpr(value, null, out);
            else this.genExpr(arg, null, out);
        }

        out.push(`call $${callee}`);
    }

    genField(node, out) {
        const [object, field] = node.namedChildren;
        this.genExpr(object, null, out);
        out.push(`struct.get $${this.inferType(object) || '__unknown'} $${field.text}`);
    }

    genIndex(node, out) {
        const [object, index] = node.namedChildren;
        this.genExpr(object, null, out);
        this.genExpr(index, 'i32', out);
        out.push(`array.get ${this.arrayTypeNameFromInferred(this.inferType(object))}`);
    }

    genNsCall(node, out) {
        const { ns, method } = namespaceInfo(node);
        const args = this.args(node);

        switch (ns) {
            case 'str':
                this.pushArgs(args, out);
                return void out.push(`call $str.${method}`);
            case 'array': return this.genArrayNsCall(method, args, out);
            case 'ref': return this.genRefNsCall(method, args, out);
            case 'i31':
                this.pushArgs(args, out);
                if (method === 'new') out.push('ref.i31');
                else if (method === 'get_s') out.push('i31.get_s');
                else if (method === 'get_u') out.push('i31.get_u');
                else throw new WatError(`Unknown i31 method: ${method}`);
                return;
            case 'extern':
                this.pushArgs(args, out);
                return void out.push('extern.convert_any');
            case 'any':
                this.pushArgs(args, out);
                return void out.push('any.convert_extern');
            default:
                throw new WatError(`Unknown namespace: ${ns}`);
        }
    }

    genArrayNsCall(method, args, out) {
        switch (method) {
            case 'len':
                this.genExpr(args[0], null, out);
                return void out.push('array.len');
            case 'copy': {
                const [dst, di, src, si, len] = args;
                this.genExpr(dst, null, out);
                this.genExpr(di, 'i32', out);
                this.genExpr(src, null, out);
                this.genExpr(si, 'i32', out);
                this.genExpr(len, 'i32', out);
                out.push(`array.copy ${this.arrayTypeNameFromInferred(this.inferType(dst))} ${this.arrayTypeNameFromInferred(this.inferType(src))}`);
                return;
            }
            case 'fill': {
                const [arr, off, value, len] = args;
                this.genExpr(arr, null, out);
                this.genExpr(off, 'i32', out);
                this.genExpr(value, null, out);
                this.genExpr(len, 'i32', out);
                out.push(`array.fill ${this.arrayTypeNameFromInferred(this.inferType(arr))}`);
                return;
            }
            default:
                throw new WatError(`Unknown array namespace method: ${method}`);
        }
    }

    genRefNsCall(method, args, out) {
        switch (method) {
            case 'is_null':
                this.genExpr(args[0], null, out);
                return void out.push('ref.is_null');
            case 'as_non_null':
                this.genExpr(args[0], null, out);
                return void out.push('ref.as_non_null');
            case 'eq':
                this.genExpr(args[0], null, out);
                this.genExpr(args[1], null, out);
                return void out.push('ref.eq');
            case 'cast':
            case 'test': {
                this.genExpr(args[0], null, out);
                const typeName = args[1]?.text ?? '__unknown';
                out.push(method === 'cast'
                    ? `ref.cast (ref $${typeName})`
                    : `ref.test (ref $${typeName})`);
                return;
            }
            default:
                throw new WatError(`Unknown ref namespace method: ${method}`);
        }
    }

    genNsRef(node) {
        const { ns, method } = namespaceInfo(node);
        throw new WatError(`Namespace reference without call not supported: ${ns}.${method}`);
    }

    genIf(node, hint, out) {
        const cond = node.namedChildren[0];
        const thenBlock = node.namedChildren[1];
        const elseBranch = node.namedChildren[2] ?? null;
        const resultType = hint || (elseBranch ? this.inferType(thenBlock) : null);
        const resultClause = resultType ? ` (result ${resultType})` : '';

        this.genExpr(cond, 'i32', out);
        out.push(`(if${resultClause}`);
        out.push('  (then');
        const thenLines = [];
        this.genBlock(thenBlock, thenLines, false);
        this.pushLines(out, thenLines);
        out.push('  )');

        if (elseBranch) {
            out.push('  (else');
            const elseLines = [];
            if (elseBranch.type === 'block') this.genBlock(elseBranch, elseLines, false);
            else this.genExpr(elseBranch, resultType, elseLines);
            this.pushLines(out, elseLines);
            out.push('  )');
        }

        out.push(')');
    }

    genMatch(node, hint, out) {
        const arms = childrenOfType(node, 'match_arm').map(parseMatchArm);
        if (arms.some(arm => arm.guard !== null)) this.genTypeMatch(node, arms, hint, out);
        else this.genScalarMatch(node, arms, hint, out);
    }

    genTypeMatch(node, arms, hint, out) {
        const subject = node.namedChildren[0];
        const subjectType = this.inferType(subject) || '__unknown';
        const resultType = hint || 'i32';
        const labels = arms.slice(0, -1).map((_, i) => `$__match_${node.id}_${i}`);

        this.labelStack.push({ type: 'match' });

        for (let i = arms.length - 2; i >= 0; i--) {
            const guard = arms[i].guard || subjectType;
            out.push(`(block ${labels[i]} (result (ref $${guard}))`);
        }

        this.genExpr(subject, null, out);
        for (let i = 0; i < arms.length - 1; i++) {
            const guard = arms[i].guard || subjectType;
            out.push(`br_on_cast ${labels[i]} (ref $${subjectType}) (ref $${guard})`);
        }

        const lastArm = arms[arms.length - 1];
        if (lastArm.pattern !== '_') out.push(`local.set $${lastArm.pattern}`);
        else out.push('drop');
        this.genExpr(lastArm.expr, resultType, out);

        for (let i = arms.length - 2; i >= 0; i--) {
            out.push(')');
            if (arms[i].pattern !== '_') out.push(`local.set $${arms[i].pattern}`);
            else out.push('drop');
            this.genExpr(arms[i].expr, resultType, out);
        }

        this.labelStack.pop();
    }

    genScalarMatch(node, arms, hint, out) {
        const subject = node.namedChildren[0];
        const tempName = this.scalarMatchTempName(node);
        const resultType = hint || this.inferType(arms[arms.length - 1].expr) || 'i32';

        this.genExpr(subject, null, out);
        out.push(`local.set $${tempName}`);

        for (let i = 0; i < arms.length; i++) {
            const arm = arms[i];
            if (arm.pattern === '_') {
                this.genExpr(arm.expr, resultType, out);
                break;
            }

            out.push(`local.get $${tempName}`);
            out.push(`i32.const ${arm.pattern}`);
            out.push('i32.eq');
            out.push('(if (then');
            this.genExpr(arm.expr, resultType, out);
            out.push(') (else');
        }

        for (const arm of arms) {
            if (arm.pattern === '_') break;
            out.push('))');
        }
    }

    genFor(node, out) {
        const uid = this.nextUid();
        const breakLabel = `$__break_${uid}`;
        const continueLabel = `$__continue_${uid}`;
        this.labelStack.push({ kind: 'loop', breakLbl: breakLabel });

        const sources = parseForSources(childOfType(node, 'for_sources'));
        const captures = parseCapture(childOfType(node, 'capture'));
        const body = childOfType(node, 'block');

        if (sources.length === 0) {
            out.push(`(block ${breakLabel}`);
            out.push(`  (loop ${continueLabel}`);
            const bodyLines = [];
            this.genBlock(body, bodyLines, false);
            this.pushLines(out, bodyLines);
            out.push(`    (br ${continueLabel})`);
            out.push('  )');
            out.push(')');
            this.labelStack.pop();
            return;
        }

        const source = sources[0];
        if (source.kind === 'range') {
            const capture = captures[0] || `__i_${uid}`;

            this.genExpr(source.start, 'i32', out);
            out.push(`local.set $${capture}`);

            const endLines = [];
            this.genExpr(source.end, 'i32', endLines);

            out.push(`(block ${breakLabel}`);
            out.push(`  (loop ${continueLabel}`);
            out.push(`    local.get $${capture}`);
            this.pushLines(out, endLines);
            out.push('    i32.ge_s');
            out.push(`    br_if ${breakLabel}`);

            const bodyLines = [];
            this.genBlock(body, bodyLines, false);
            this.pushLines(out, bodyLines);

            out.push(`    local.get $${capture}`);
            out.push('    i32.const 1');
            out.push('    i32.add');
            out.push(`    local.set $${capture}`);
            out.push(`    (br ${continueLabel})`);
            out.push('  )');
            out.push(')');
            this.labelStack.pop();
            return;
        }

        out.push(`(block ${breakLabel}`);
        out.push(`  (loop ${continueLabel}`);
        this.genExpr(source.expr, 'i32', out);
        out.push('    i32.eqz');
        out.push(`    br_if ${breakLabel}`);

        const bodyLines = [];
        this.genBlock(body, bodyLines, false);
        this.pushLines(out, bodyLines);

        out.push(`    (br ${continueLabel})`);
        out.push('  )');
        out.push(')');
        this.labelStack.pop();
    }

    genBlockExpr(node, hint, out) {
        const labelNode = childOfType(node, 'identifier');
        const block = childOfType(node, 'block');
        const label = labelNode ? `$${labelNode.text}` : `$__block_${this.nextUid()}`;
        const resultClause = hint ? ` (result ${hint})` : '';

        out.push(`(block ${label}${resultClause}`);
        this.labelStack.push({ kind: 'block', wasmLabel: label });
        const bodyLines = [];
        this.genBlock(block, bodyLines, false);
        this.pushLines(out, bodyLines, '  ');
        this.labelStack.pop();
        out.push(')');
    }

    genBreak(node, out) {
        const info = parseBreak(node);
        if (info.value) this.genExpr(info.value, null, out);

        let label;
        if (info.label) {
            label = `$${info.label}`;
        } else {
            const frame = [...this.labelStack].reverse().find(item => item.kind === 'loop' || item.wasmLabel);
            label = frame ? (frame.kind === 'loop' ? frame.breakLbl : frame.wasmLabel) : '$__break';
        }
        out.push(`br ${label}`);
    }

    genLet(node, out) {
        const targets = parseBindTargets(node);
        const value = node.namedChildren[node.namedChildren.length - 1];

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
        let fields = this.typeDeclMap.get(typeName)?.fields ?? this.variantDecls.get(typeName)?.fields ?? [];
        if (fields.length === 0 && this.variantDecls.has(typeName)) fields = this.variantDecls.get(typeName).fields;
        if (!fields.length && !this.typeDeclMap.has(typeName) && !this.variantDecls.has(typeName)) {
            throw new WatError(`Unknown type: ${typeName}`);
        }

        const fieldMap = new Map(
            childrenOfType(node, 'field_init').map(field => [field.namedChildren[0].text, field.namedChildren[1]])
        );

        for (const field of fields) {
            const value = fieldMap.get(field.name);
            if (value) this.genExpr(value, this.wasmType(field.type), out);
            else out.push(this.defaultValue(field.type));
        }

        out.push(`struct.new $${typeName}`);
    }

    genArrayInit(node, out) {
        const elemType = parseType(node.namedChildren[0]);
        const method = node.namedChildren[1].text;
        const args = this.args(node);
        const elemWasm = this.wasmType(elemType);
        const key = this.elemTypeKey(elemType);

        this.requireArrayType(key);
        const arrayTypeName = this.arrayTypes.get(key);

        switch (method) {
            case 'new':
                this.genExpr(args[1], elemWasm, out);
                this.genExpr(args[0], 'i32', out);
                out.push(`array.new ${arrayTypeName}`);
                return;
            case 'new_fixed':
                for (const arg of args) this.genExpr(arg, elemWasm, out);
                out.push(`array.new_fixed ${arrayTypeName} ${args.length}`);
                return;
            case 'new_default':
                this.genExpr(args[0], 'i32', out);
                out.push(`array.new_default ${arrayTypeName}`);
                return;
            default:
                throw new WatError(`Unknown array init method: ${method}`);
        }
    }

    requireArrayType(key) { if (!this.arrayTypes.has(key)) this.arrayTypes.set(key, `$${key}_array`); }

    genAssign(node, out) {
        const [lhs, rhs] = node.namedChildren;

        if (lhs.type === 'identifier') {
            const name = lhs.text;
            const type = this.localTypes.get(name) ?? this.globalTypeMap.get(name) ?? { kind: 'scalar', name: 'i32' };
            this.genExpr(rhs, this.wasmType(type), out);
            out.push(`${this.localTypes.has(name) ? 'local' : 'global'}.set $${name}`);
            return;
        }

        if (lhs.type === 'field_expr') {
            const [object, field] = lhs.namedChildren;
            this.genExpr(object, null, out);
            this.genExpr(rhs, null, out);
            out.push(`struct.set $${this.inferType(object) || '__unknown'} $${field.text}`);
            return;
        }

        if (lhs.type === 'index_expr') {
            const [object, index] = lhs.namedChildren;
            this.genExpr(object, null, out);
            this.genExpr(index, 'i32', out);
            this.genExpr(rhs, null, out);
            out.push(`array.set ${this.arrayTypeNameFromInferred(this.inferType(object))}`);
        }
    }

    wasmType(type) {
        if (!type) return 'i32';
        if (type.kind === 'scalar') return SCALAR_WASM[type.name] || type.name;
        if (type.kind === 'named') return this.namedWasmType(type.name);
        if (type.kind === 'nullable') return this.nullableWasmType(type.inner);
        if (type.kind === 'array') {
            const key = this.elemTypeKey(type.elem);
            this.requireArrayType(key);
            return `(ref ${this.arrayTypes.get(key)})`;
        }
        if (type.kind === 'func_type') return `(ref $func_${this.funcTypeKey(type)})`;
        return ['exclusive', 'multi_return'].includes(type.kind) ? '' : 'i32';
    }

    namedWasmType(name) { return REF_WASM[name] || `(ref $${name})`; }
    nullableWasmType(inner) { return !inner ? 'externref' : inner.kind === 'named' ? NULLABLE_REF_WASM[inner.name] || `(ref null $${inner.name})` : this.wasmType(inner); }
    elemKeyWasmType(key) { return SCALAR_WASM[key] || REF_WASM[key] || `(ref $${key})`; }
    watResultList(returnType) { return this.flattenResultTypes(returnType).map(type => `(result ${type})`).join(' '); }

    flattenResultTypes(type) {
        if (!type) return [];

        if (type.kind === 'scalar') return [SCALAR_WASM[type.name] || type.name];
        if (type.kind === 'named') return [this.namedWasmType(type.name)];
        if (type.kind === 'nullable') return [this.nullableWasmType(type.inner)];
        if (type.kind === 'array') {
            const key = this.elemTypeKey(type.elem);
            this.requireArrayType(key);
            return [`(ref ${this.arrayTypes.get(key)})`];
        }
        if (type.kind === 'exclusive') return [this.nullableWasmTypeFor(type.ok), this.nullableWasmTypeFor(type.err)];
        if (type.kind === 'multi_return') return type.components.flatMap(component => this.flattenResultTypes(component));
        return [this.wasmType(type)];
    }

    nullableWasmTypeFor(type) { return !type ? 'i32' : type.kind === 'named' ? this.nullableWasmType(type) : type.kind === 'nullable' ? this.nullableWasmType(type.inner) : this.wasmType(type); }
    funcTypeKey(type) { return `${type.params.map(param => this.wasmType(param)).join('_')}_to_${this.watResultList(type.returnType).replace(/[() ]/g, '_')}`; }
    returnHint(returnType) { const results = this.flattenResultTypes(returnType); return results.length === 1 ? results[0] : null; }
    wasmTypeStr(inferredType) { return !inferredType ? null : typeof inferredType === 'string' ? SCALAR_WASM[inferredType] || inferredType : this.wasmType(inferredType); }

    dominantType(left, right) {
        const floats = ['f32', 'f64'];
        if (floats.includes(left)) return left;
        if (floats.includes(right)) return right;
        if (left === 'i64' || right === 'i64') return 'i64';
        if (left === 'u64' || right === 'u64') return 'u64';
        if (left === 'u32' || right === 'u32') return 'u32';
        return left || right || 'i32';
    }

    inferType(node) {
        if (!node) return null;

        switch (node.type) {
            case 'literal': {
                return { int: 'i32', float: 'f64', bool: 'i32', string: 'str' }[literalInfo(node).kind] ?? null;
            }
            case 'identifier':
                return this.typeName(this.localTypes?.get(node.text) ?? this.globalTypeMap.get(node.text));
            case 'paren_expr':
            case 'unary_expr':
                return this.inferType(node.namedChildren.at(-1));
            case 'binary_expr': {
                const [left, right] = node.namedChildren;
                const op = findAnonBetween(node, left, right);
                if (['==', '!=', '<', '>', '<=', '>=', 'and', 'or'].includes(op)) return 'i32';
                return this.dominantType(this.inferType(left), this.inferType(right));
            }
            case 'field_expr': {
                const [object, field] = node.namedChildren;
                return this.typeName(this.lookupFieldType(this.inferType(object), field.text));
            }
            case 'index_expr':
                return this.arrayElemKeyFromInferred(this.inferType(node.namedChildren[0]));
            case 'call_expr': {
                const callee = node.namedChildren[0];
                return callee.type === 'identifier' ? this.typeName(this.fnItems.find(item => item.name === callee.text)?.returnType) : null;
            }
            case 'namespace_call_expr': {
                const { ns, method } = namespaceInfo(node);
                if (ns === 'str') {
                    const builtin = STR_BUILTINS[method];
                    if (!builtin) return null;
                    return builtin.sig.includes('result externref') ? 'str' : 'i32';
                }
                if (ns === 'array' && method === 'len') return 'i32';
                return null;
            }
            case 'struct_init':
                return childOfType(node, 'type_ident').text;
            case 'array_init':
                return `${this.elemTypeKey(parseType(node.namedChildren[0]))}_array`;
            case 'if_expr':
                return this.inferType(node.namedChildren[1]);
            case 'block':
                return this.inferType(node.namedChildren.at(-1));
            default:
                return null;
        }
    }

    inferredToType(inferred) { return !inferred ? null : SCALAR_NAMES.has(inferred) ? { kind: 'scalar', name: inferred } : { kind: 'named', name: inferred }; }
    typeName(type) { return !type ? null : type.kind === 'array' ? `${this.elemTypeKey(type.elem)}_array` : ['scalar', 'named'].includes(type.kind) ? type.name : null; }

    lookupFieldType(typeName, fieldName) {
        if (!typeName) return null;
        const decl = this.typeDeclMap.get(typeName);
        if (decl?.fields) return decl.fields.find(field => field.name === fieldName)?.type ?? null;
        const variant = this.variantDecls.get(typeName);
        return variant?.fields.find(field => field.name === fieldName)?.type ?? null;
    }

    arrayTypeNameFromInferred(inferred) { return inferred ? `$${inferred.endsWith('_array') ? inferred : `${inferred}_array`}` : '$__unknown_array'; }
    arrayElemKeyFromInferred(inferred) { return inferred?.endsWith('_array') ? inferred.slice(0, -6) : null; }
    scalarMatchTempName(node) { return `__match_subj_${node.id}`; }

    defaultValue(type) {
        if (!type) return 'i32.const 0';
        if (type.kind === 'scalar') return `${SCALAR_WASM[type.name]}.const 0`;
        if (type.kind === 'named') {
            if (type.name === 'str' || type.name === 'externref') return 'ref.null extern';
            return `ref.null $${type.name}`;
        }
        if (type.kind === 'nullable') return `ref.null ${this.nullableNullTarget(type.inner)}`;
        return 'i32.const 0';
    }

    nullableNullTarget(inner) { return !inner ? 'none' : inner.kind === 'named' ? (inner.name === 'str' || inner.name === 'externref' ? 'extern' : `$${inner.name}`) : 'none'; }
    genExprInline(node, hint) { const out = []; this.genExpr(node, hint, out); return out.join(' '); }
    exprProducesValue(node) { return !['assign_expr', 'for_expr', 'bind_expr'].includes(node.type); }
}

const parseStructDecl = (node) => ({ kind: 'struct_decl', name: textOf(node, 'type_ident'), fields: parseFieldList(childOfType(node, 'field_list')) });
const parseTypeDecl = (node) => ({ kind: 'type_decl', name: textOf(node, 'type_ident'), variants: parseVariantList(childOfType(node, 'variant_list')) });
const parseFnDecl = (node) => ({
    kind: 'fn_decl',
    name: textOf(node, 'identifier'),
    params: parseParamList(childOfType(node, 'param_list')),
    returnType: parseReturnType(childOfType(node, 'return_type')),
    body: childOfType(node, 'block'),
});
const parseGlobalDecl = (node) => {
    const [name, type, value] = node.namedChildren;
    return { kind: 'global_decl', name: name.text, type: parseType(type), value };
};
const parseImportDecl = (node) => {
    const [moduleNode, nameNode, typeNode] = node.namedChildren, module = moduleNode.text.slice(1, -1), name = nameNode.text;
    return hasAnon(node, '(')
        ? { kind: 'import_fn', module, name, params: parseImportParamList(childOfType(node, 'import_param_list')), returnType: parseReturnType(childOfType(node, 'return_type')) }
        : { kind: 'import_val', module, name, type: parseType(typeNode) };
};

const parseFieldList = (node) => mapType(node, 'field', parseField);
const parseField = (node) => {
    const [name, type] = node.namedChildren;
    return { kind: 'field', mut: hasAnon(node, 'mut'), name: name.text, type: parseType(type) };
};
const parseVariantList = (node) => mapType(node, 'variant', parseVariant);
const parseVariant = (node) => ({ kind: 'variant', name: textOf(node, 'type_ident'), fields: parseFieldList(childOfType(node, 'field_list')) });
const parseParamList = (node) => mapType(node, 'param', parseParam);
const parseParam = (node) => {
    const [name, type] = node.namedChildren;
    return { kind: 'param', name: name.text, type: parseType(type) };
};
const parseImportParamList = (node) => node?.namedChildren.map(child => child.type === 'param' ? parseParam(child) : { kind: 'anon_param', type: parseType(child) }) ?? [];

function parseType(node) {
    if (!node) return null;
    if (node.type === 'nullable_type') return { kind: 'nullable', inner: parseType(node.namedChildren[0]) };
    if (node.type === 'scalar_type') return { kind: 'scalar', name: node.text };
    if (node.type === 'ref_type') return node.children[0].type === 'array' ? { kind: 'array', elem: parseType(node.namedChildren[0]) } : { kind: 'named', name: node.children[0].text };
    if (node.type === 'func_type') return { kind: 'func_type', params: childOfType(node, 'type_list')?.namedChildren.map(parseType) ?? [], returnType: parseReturnType(childOfType(node, 'return_type')) };
    if (node.type === 'paren_type') return parseType(node.namedChildren[0]);
    throw new WatError(`Unknown type node: ${node.type}`);
}

function parseReturnType(node) {
    if (!node) return null;
    const components = [];
    for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (!child.isNamed) continue;
        const ok = parseType(child), hash = node.children[i + 1]?.type === '#';
        const err = hash && node.children[i + 2]?.isNamed ? parseType(node.children[i + 2]) : null;
        components.push(hash && err ? { kind: 'exclusive', ok, err } : ok);
        if (hash) i += err ? 2 : 1;
    }
    return !components.length ? null : components.length === 1 ? components[0] : { kind: 'multi_return', components };
}

const parsePipeTarget = (node) => {
    const argsNode = childOfType(node, 'pipe_args');
    const callee = node.namedChildren.filter(child => child.type === 'identifier').map(child => child.text).join('.');
    return argsNode ? { kind: 'pipe_call', callee, args: parsePipeArgs(argsNode) } : { kind: 'pipe_ident', name: callee };
};
const pipeCallee = (target) => target.kind === 'pipe_ident' ? target.name : target.callee;
const parsePipeArgs = (node) => childrenOfType(node, 'pipe_arg').map(arg => arg.children[0]?.type === '_' ? { kind: 'placeholder' } : { kind: 'arg', value: arg.namedChildren[0] });
const namespaceInfo = (node) => ({ ns: node.children[0].text, method: childOfType(node, 'identifier').text });
const parseForSources = (node) => mapType(node, 'for_source', parseForSource);
const parseForSource = (node) => node.children.some(child => !child.isNamed && child.type === '..') ? { kind: 'range', start: node.namedChildren[0], end: node.namedChildren[1] } : { kind: 'cond', expr: node.namedChildren[0] };
const parseCapture = (node) => mapType(node, 'identifier', child => child.text);
const parseMatchArm = (node) => {
    const named = node.namedChildren;
    return { pattern: named[0].text, guard: named.length === 3 ? named[1].text : null, expr: named.at(-1) };
};
const parseBindTargets = (node) => childrenOfType(node, 'bind_target').map(target => ({ name: target.namedChildren[0].text, type: parseType(target.namedChildren[1]) }));
const parseBreak = (node) => {
    const [first, second] = node.namedChildren;
    return !first ? { label: null, value: null } : first.type === 'identifier' ? { label: first.text, value: second ?? null } : { label: null, value: first };
};

function literalInfo(node) {
    const child = node.namedChildren[0];
    const string = stringLiteralValue(node);
    if (string !== null) return { kind: 'string', value: string };
    if (child?.type === 'int_lit') return { kind: 'int', value: parseIntLit(child.text) };
    if (child?.type === 'float_lit') return { kind: 'float', value: parseFloat(child.text) };

    switch (node.text) {
        case 'true': return { kind: 'bool', value: true };
        case 'false': return { kind: 'bool', value: false };
        case 'null': return { kind: 'null', value: null };
        default: throw new WatError(`Unknown literal: ${node.text}`);
    }
}

const parseIntLit = (text) => text.startsWith('0x') ? parseInt(text.slice(2), 16) : text.startsWith('0b') ? parseInt(text.slice(2), 2) : parseInt(text, 10);
const flattenTuple = (node, out = []) => (node.type === 'tuple_expr' ? (flattenTuple(node.namedChildren[0], out), flattenTuple(node.namedChildren[1], out)) : out.push(node), out);
const hasCallParens = (node) => hasAnon(node, '(');

const mapType = (node, type, parse) => childrenOfType(node, type).map(parse);
const textOf = (node, type) => childOfType(node, type).text;
