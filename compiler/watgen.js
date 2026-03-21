// compiler/watgen.js
//
// WAT generator — walks the AST from parse.js and emits a WebAssembly Text
// format module string.
//
// Input:  AST from parse(tree), { kind: 'program', items: [...] }
// Output: string — a valid WAT module

export class WatError extends Error {}

export function watgen(ast) {
    return new WatGen(ast).generate();
}

// ==================== Constants ====================

const SCALAR_WASM = {
    i32: 'i32', u32: 'i32',
    i64: 'i64', u64: 'i64',
    f32: 'f32', f64: 'f64',
    bool: 'i32', v128: 'v128',
};

// str method (Utu name) -> { importName, sig }
const STR_BUILTINS = {
    length:              { importName: 'length',            sig: '(param externref) (result i32)' },
    char_code_at:        { importName: 'charCodeAt',        sig: '(param externref i32) (result i32)' },
    concat:              { importName: 'concat',            sig: '(param externref externref) (result externref)' },
    substring:           { importName: 'substring',         sig: '(param externref i32 i32) (result externref)' },
    equals:              { importName: 'equals',            sig: '(param externref externref) (result i32)' },
    from_char_code_array:{ importName: 'fromCharCodeArray', sig: '(param (ref $i16_array) i32 i32) (result externref)' },
    into_char_code_array:{ importName: 'intoCharCodeArray', sig: '(param externref (ref $i16_array) i32) (result i32)' },
    from_char_code:      { importName: 'fromCharCode',      sig: '(param i32) (result externref)' },
};


// ==================== WatGen ====================

class WatGen {
    constructor(ast) {
        this.items = ast.items;

        // Classified items
        this.structDecls  = [];
        this.typeDecls    = [];   // sum types
        this.fnItems      = [];   // { fn, exported, exportName }
        this.globalDecls  = [];
        this.importFns    = [];
        this.importVals   = [];

        // Type maps
        this.typeDeclMap  = new Map(); // name -> struct_decl | type_decl
        this.sumTypeMap   = new Map(); // variantName -> parentTypeName

        // String table (dedup)
        this.strings      = new Map(); // value -> index
        this.stringList   = [];

        // Array types used: elemTypeKey -> wasmArrayTypeName
        // e.g. 'i32' -> '$i32_array', 'Todo' -> '$Todo_array'
        this.arrayTypes   = new Map();

        // Used str builtins
        this.usedStrBuiltins = new Set();

        // Per-function state
        this.localTypes   = null; // Map<name, astTypeNode>
        this.paramNames   = null; // Set<name>
        this.labelStack   = [];
        this.currentReturnType = null;
        this.uid = 0;
    }

    nextUid() { return this.uid++; }

    generate() {
        this.collect();
        this.scanAll();
        return this.emit();
    }

    // ==================== Pass 1: classify ====================

    collect() {
        for (const item of this.items) {
            switch (item.kind) {
                case 'struct_decl':
                    this.structDecls.push(item);
                    this.typeDeclMap.set(item.name, item);
                    break;
                case 'type_decl':
                    this.typeDecls.push(item);
                    this.typeDeclMap.set(item.name, item);
                    for (const v of item.variants) this.sumTypeMap.set(v.name, item.name);
                    break;
                case 'fn_decl':
                    this.fnItems.push({ fn: item, exported: false });
                    break;
                case 'global_decl':
                    this.globalDecls.push(item);
                    break;
                case 'import_fn':
                    this.importFns.push(item);
                    break;
                case 'import_val':
                    this.importVals.push(item);
                    break;
                case 'export_decl':
                    this.fnItems.push({ fn: item.fn, exported: true, exportName: item.fn.name });
                    break;
            }
        }
    }

    // ==================== Pass 2: scan for strings/builtins ====================

    scanAll() {
        const scanExpr = (e) => {
            if (!e) return;
            switch (e.kind) {
                case 'string': this.internString(e.value); break;
                case 'ns_call':
                case 'ns_ref':
                    if (e.ns === 'str' && STR_BUILTINS[e.method]) {
                        this.usedStrBuiltins.add(e.method);
                    }
                    for (const a of (e.args || [])) scanExpr(a);
                    break;
                case 'pipe': scanExpr(e.value);
                    if (e.target.kind === 'pipe_call' && e.target.callee.startsWith('str.')) {
                        const m = e.target.callee.slice(4);
                        if (STR_BUILTINS[m]) this.usedStrBuiltins.add(m);
                    }
                    if (e.target.kind === 'pipe_ident' && e.target.name.startsWith('str.')) {
                        const m = e.target.name.slice(4);
                        if (STR_BUILTINS[m]) this.usedStrBuiltins.add(m);
                    }
                    if (e.target.args) for (const a of e.target.args) {
                        if (a.kind === 'arg') scanExpr(a.value);
                    }
                    break;
                case 'binary': scanExpr(e.left); scanExpr(e.right); break;
                case 'unary': scanExpr(e.expr); break;
                case 'call': scanExpr(e.callee); for (const a of e.args) scanExpr(a); break;
                case 'field': scanExpr(e.object); break;
                case 'index': scanExpr(e.object); scanExpr(e.index); break;
                case 'if': scanExpr(e.cond); scanBlock(e.then); if (e.else) {
                    if (e.else.kind === 'block') scanBlock(e.else);
                    else scanExpr(e.else);
                } break;
                case 'match': scanExpr(e.subject); for (const a of e.arms) scanExpr(a.expr); break;
                case 'for': scanBlock(e.body); for (const s of e.sources) {
                    if (s.kind === 'range') { scanExpr(s.start); scanExpr(s.end); }
                    else scanExpr(s.expr);
                } break;
                case 'block_expr': scanBlock(e.body); break;
                case 'let': scanExpr(e.value); break;
                case 'struct_init': for (const f of e.fields) scanExpr(f.value); break;
                case 'array_init': for (const a of e.args) scanExpr(a); break;
                case 'assign': scanExpr(e.lhs); scanExpr(e.rhs); break;
                case 'else': scanExpr(e.expr); scanExpr(e.fallback); break;
                case 'tuple': for (const el of e.elems) scanExpr(el); break;
                case 'break': if (e.value) scanExpr(e.value); break;
            }
        };
        const scanBlock = (b) => { for (const s of b.stmts) scanExpr(s); };

        for (const { fn } of this.fnItems) scanBlock(fn.body);
        for (const g of this.globalDecls) scanExpr(g.value);
    }

    internString(value) {
        if (!this.strings.has(value)) {
            const idx = this.stringList.length;
            this.strings.set(value, idx);
            this.stringList.push(value);
        }
        return this.strings.get(value);
    }

    // ==================== Pass 3: emit ====================

    emit() {
        const lines = ['(module'];

        // Collect array types from all field / param / return type nodes
        this.collectArrayTypes();

        // rec group for all user-defined types + array types
        const typeDefs = this.emitTypeDefs();
        if (typeDefs.length > 0) {
            lines.push('  (rec');
            for (const t of typeDefs) lines.push(t);
            lines.push('  )');
        }

        // String literal imports
        for (let i = 0; i < this.stringList.length; i++) {
            lines.push(`  (import "__strings" "${i}" (global $__s${i} externref))`);
        }

        // str builtin imports
        for (const method of this.usedStrBuiltins) {
            const b = STR_BUILTINS[method];
            lines.push(`  (import "wasm:js-string" "${b.importName}" (func $str.${method} ${b.sig}))`);
        }

        // extern fn imports
        for (const imp of this.importFns) lines.push(this.emitImportFn(imp));

        // extern val imports
        for (const imp of this.importVals) lines.push(this.emitImportVal(imp));

        // globals
        for (const g of this.globalDecls) lines.push(this.emitGlobal(g));

        // functions
        for (const { fn, exported, exportName } of this.fnItems) {
            lines.push(this.emitFn(fn));
            if (exported) lines.push(`  (export "${exportName}" (func $${exportName}))`);
        }

        lines.push(')');
        return lines.join('\n');
    }

    // ==================== Type walking ====================

    collectArrayTypes() {
        const visitType = (t) => {
            if (!t) return;
            if (t.kind === 'array') {
                const key = this.elemTypeKey(t.elem);
                if (!this.arrayTypes.has(key)) {
                    this.arrayTypes.set(key, `$${key}_array`);
                }
                visitType(t.elem);
            } else if (t.kind === 'nullable') {
                visitType(t.inner);
            } else if (t.kind === 'exclusive') {
                visitType(t.ok); visitType(t.err);
            } else if (t.kind === 'multi_return') {
                for (const c of t.components) visitType(c);
            } else if (t.kind === 'func_type') {
                for (const p of t.params) visitType(p);
                if (t.returnType) visitType(t.returnType);
            }
        };
        const visitFields = (fields) => { for (const f of fields) visitType(f.type); };
        const visitParams = (params) => { for (const p of params) visitType(p.type); };

        for (const s of this.structDecls) visitFields(s.fields);
        for (const t of this.typeDecls) for (const v of t.variants) visitFields(v.fields);
        for (const { fn } of this.fnItems) {
            visitParams(fn.params);
            if (fn.returnType) visitType(fn.returnType);
        }
        for (const imp of this.importFns) {
            visitParams(imp.params);
            if (imp.returnType) visitType(imp.returnType);
        }
        for (const g of this.globalDecls) visitType(g.type);

        // Also scan function bodies for array_init expressions
        const visitExpr = (e) => {
            if (!e) return;
            if (e.kind === 'array_init') {
                const key = this.elemTypeKey(e.elem);
                if (!this.arrayTypes.has(key)) this.arrayTypes.set(key, `$${key}_array`);
                visitType(e.elem);
            }
            // Recurse into sub-expressions
            for (const child of Object.values(e)) {
                if (child && typeof child === 'object') {
                    if (child.kind) visitExpr(child);
                    else if (Array.isArray(child)) child.forEach(c => c && c.kind && visitExpr(c));
                }
            }
        };
        for (const { fn } of this.fnItems) {
            for (const stmt of fn.body.stmts) visitExpr(stmt);
        }
    }

    elemTypeKey(t) {
        if (!t) return 'unknown';
        if (t.kind === 'scalar') return t.name;
        if (t.kind === 'named') return t.name;
        if (t.kind === 'array') return `${this.elemTypeKey(t.elem)}_array`;
        return 'unknown';
    }

    // ==================== Type definitions ====================

    emitTypeDefs() {
        const lines = [];
        for (const s of this.structDecls) {
            lines.push(...this.emitStructType(s, null));
        }
        for (const t of this.typeDecls) {
            lines.push(...this.emitSumType(t));
        }
        for (const [key, name] of this.arrayTypes) {
            const wt = this.elemKeyWasmType(key);
            lines.push(`    (type ${name} (array (mut ${wt})))`);
        }
        return lines;
    }

    emitStructType(decl, superName) {
        const fields = decl.fields.map(f => this.watField(f)).join(' ');
        if (superName) {
            return [`    (type $${decl.name} (sub $${superName} (struct${fields ? ' ' + fields : ''})))`];
        }
        return [`    (type $${decl.name} (struct${fields ? ' ' + fields : ''}))`];
    }

    emitSumType(decl) {
        const lines = [];
        lines.push(`    (type $${decl.name} (struct))`);
        for (const v of decl.variants) {
            const fields = v.fields.map(f => this.watField(f)).join(' ');
            lines.push(`    (type $${v.name} (sub $${decl.name} (struct${fields ? ' ' + fields : ''})))`);
        }
        return lines;
    }

    watField(field) {
        const wt = this.wasmType(field.type);
        if (field.mut) return `(field $${field.name} (mut ${wt}))`;
        return `(field $${field.name} ${wt})`;
    }

    // ==================== Imports / Globals ====================

    emitImportFn(imp) {
        const params = imp.params.map(p => {
            const t = p.kind === 'param' ? p.type : p.type;
            return `(param ${this.wasmType(t)})`;
        }).join(' ');
        const ret = imp.returnType ? ` ${this.watResultList(imp.returnType)}` : '';
        const sig = [params, ret].filter(Boolean).join(' ');
        return `  (import "${imp.module}" "${imp.name}" (func $${imp.name}${sig ? ' ' + sig : ''}))`;
    }

    emitImportVal(imp) {
        const wt = this.wasmType(imp.type);
        return `  (import "${imp.module}" "${imp.name}" (global $${imp.name} ${wt}))`;
    }

    emitGlobal(g) {
        const wt = this.wasmType(g.type);
        const val = this.genExprInline(g.value, wt);
        return `  (global $${g.name} ${wt} ${val})`;
    }

    // ==================== Functions ====================

    emitFn(fn) {
        // Setup per-function state
        this.localTypes = new Map();
        this.paramNames = new Set();
        for (const p of fn.params) {
            this.localTypes.set(p.name, p.type);
            this.paramNames.add(p.name);
        }
        this.currentReturnType = fn.returnType;
        this.labelStack = [];

        // Collect all let-binding locals by walking the body
        const letLocals = [];
        this.collectLetLocals(fn.body, letLocals);
        for (const { name, type } of letLocals) {
            if (!this.localTypes.has(name)) {
                this.localTypes.set(name, type);
            }
        }

        const lines = [];
        const params = fn.params.map(p => `(param $${p.name} ${this.wasmType(p.type)})`).join(' ');
        const ret = fn.returnType ? ` ${this.watResultList(fn.returnType)}` : '';
        const sig = [params, ret].filter(Boolean).join(' ');

        lines.push(`  (func $${fn.name}${sig ? ' ' + sig : ''}`);

        // Local declarations (let bindings, for loop counters, etc.)
        // Also add for-loop capture locals
        const forLocals = [];
        this.collectForLocals(fn.body, forLocals);

        const declaredLocals = new Set(fn.params.map(p => p.name));
        for (const { name, type } of letLocals) {
            if (!declaredLocals.has(name)) {
                lines.push(`    (local $${name} ${this.wasmType(type)})`);
                declaredLocals.add(name);
            }
        }
        for (const { name, wasmType } of forLocals) {
            if (!declaredLocals.has(name)) {
                lines.push(`    (local $${name} ${wasmType})`);
                declaredLocals.add(name);
                // Register in localTypes with synthetic scalar node
                if (!this.localTypes.has(name)) {
                    this.localTypes.set(name, { kind: 'scalar', name: wasmType });
                }
            }
        }

        // Body
        const bodyLines = [];
        this.genBlock(fn.body, bodyLines, true);
        for (const l of bodyLines) lines.push('    ' + l);

        lines.push('  )');
        return lines.join('\n');
    }

    collectLetLocals(block, out) {
        const visitExpr = (e) => {
            if (!e) return;
            switch (e.kind) {
                case 'let':
                    for (const t of e.targets) out.push({ name: t.name, type: t.type });
                    visitExpr(e.value);
                    break;
                case 'if':
                    visitExpr(e.cond);
                    visitBlock(e.then);
                    if (e.else) {
                        if (e.else.kind === 'block') visitBlock(e.else);
                        else visitExpr(e.else);
                    }
                    break;
                case 'match': visitExpr(e.subject); for (const a of e.arms) visitExpr(a.expr); break;
                case 'for': visitBlock(e.body); for (const s of e.sources) {
                    if (s.kind === 'range') { visitExpr(s.start); visitExpr(s.end); }
                    else visitExpr(s.expr);
                } break;
                case 'block_expr': visitBlock(e.body); break;
                case 'binary': visitExpr(e.left); visitExpr(e.right); break;
                case 'unary': visitExpr(e.expr); break;
                case 'call': visitExpr(e.callee); for (const a of e.args) visitExpr(a); break;
                case 'pipe': visitExpr(e.value);
                    if (e.target.args) for (const a of e.target.args) {
                        if (a.kind === 'arg') visitExpr(a.value);
                    }
                    break;
                case 'else': visitExpr(e.expr); visitExpr(e.fallback); break;
                case 'struct_init': for (const f of e.fields) visitExpr(f.value); break;
                case 'array_init': for (const a of e.args) visitExpr(a); break;
                case 'assign': visitExpr(e.lhs); visitExpr(e.rhs); break;
                case 'ns_call': for (const a of e.args) visitExpr(a); break;
                case 'tuple': for (const el of e.elems) visitExpr(el); break;
                case 'break': if (e.value) visitExpr(e.value); break;
                case 'index': visitExpr(e.object); visitExpr(e.index); break;
                case 'field': visitExpr(e.object); break;
            }
        };
        const visitBlock = (b) => { for (const s of b.stmts) visitExpr(s); };
        visitBlock(block);
    }

    collectForLocals(block, out) {
        const visitExpr = (e) => {
            if (!e) return;
            switch (e.kind) {
                case 'for':
                    for (let i = 0; i < e.sources.length; i++) {
                        const src = e.sources[i];
                        if (src.kind === 'range' && e.captures[i]) {
                            out.push({ name: e.captures[i], wasmType: 'i32' });
                        }
                    }
                    visitBlock(e.body);
                    break;
                case 'if': visitBlock(e.then); if (e.else && e.else.kind === 'block') visitBlock(e.else); break;
                case 'match': for (const a of e.arms) visitExpr(a.expr); break;
                case 'block_expr': visitBlock(e.body); break;
                case 'let': visitExpr(e.value); break;
                case 'binary': visitExpr(e.left); visitExpr(e.right); break;
            }
        };
        const visitBlock = (b) => { for (const s of b.stmts) visitExpr(s); };
        visitBlock(block);
    }

    // ==================== Code generation ====================

    genBlock(block, out, isFnBody = false) {
        const n = block.stmts.length;
        for (let i = 0; i < n; i++) {
            const stmt = block.stmts[i];
            const isLast = i === n - 1;
            const hint = isLast && isFnBody && this.currentReturnType
                ? this.returnHint(this.currentReturnType)
                : null;
            this.genExpr(stmt, hint, out);
            // Non-last statements that produce a value need drop
            if (!isLast && this.exprProducesValue(stmt)) {
                // For let/assign/for we don't drop — they consume their value
                if (!['let', 'assign', 'for', 'unreachable'].includes(stmt.kind)) {
                    out.push('drop');
                }
            }
        }
    }

    genExpr(e, hint, out) {
        switch (e.kind) {
            case 'int':         this.genInt(e.value, hint, out); break;
            case 'float':       this.genFloat(e.value, hint, out); break;
            case 'bool':        out.push(`i32.const ${e.value ? 1 : 0}`); break;
            case 'null':        out.push(`ref.null none`); break;
            case 'string':      out.push(`global.get $__s${this.internString(e.value)}`); break;
            case 'ident':       this.genIdent(e, out); break;
            case 'unary':       this.genUnary(e, hint, out); break;
            case 'binary':      this.genBinary(e, hint, out); break;
            case 'tuple':       this.genTuple(e, out); break;
            case 'pipe':        this.genPipe(e, hint, out); break;
            case 'else':        this.genElse(e, hint, out); break;
            case 'call':        this.genCall(e, out); break;
            case 'field':       this.genField(e, out); break;
            case 'index':       this.genIndex(e, out); break;
            case 'ns_call':     this.genNsCall(e, out); break;
            case 'ns_ref':      this.genNsRef(e, out); break;
            case 'ref_null':    out.push(`ref.null $${e.type}`); break;
            case 'if':          this.genIf(e, hint, out); break;
            case 'match':       this.genMatch(e, hint, out); break;
            case 'for':         this.genFor(e, out); break;
            case 'block_expr':  this.genBlockExpr(e, hint, out); break;
            case 'break':       this.genBreak(e, out); break;
            case 'let':         this.genLet(e, out); break;
            case 'struct_init': this.genStructInit(e, out); break;
            case 'array_init':  this.genArrayInit(e, out); break;
            case 'assign':      this.genAssign(e, out); break;
            case 'unreachable': out.push('unreachable'); break;
            default:
                throw new WatError(`Unknown expr kind: ${e.kind}`);
        }
    }

    // ==================== Literals ====================

    genInt(value, hint, out) {
        if (hint === 'f32') { out.push(`f32.const ${value}`); return; }
        if (hint === 'f64') { out.push(`f64.const ${value}`); return; }
        if (hint === 'i64') { out.push(`i64.const ${value}`); return; }
        out.push(`i32.const ${value}`);
    }

    genFloat(value, hint, out) {
        if (hint === 'f32') { out.push(`f32.const ${value}`); return; }
        out.push(`f64.const ${value}`);
    }

    genIdent(e, out) {
        if (this.paramNames && this.paramNames.has(e.name)) {
            out.push(`local.get $${e.name}`);
        } else {
            out.push(`local.get $${e.name}`);
        }
    }

    // ==================== Unary ====================

    genUnary(e, hint, out) {
        const wt = hint || this.inferType(e.expr) || 'i32';
        this.genExpr(e.expr, wt, out);
        switch (e.op) {
            case '-':
                if (wt === 'f32') { out.push('f32.neg'); }
                else if (wt === 'f64') { out.push('f64.neg'); }
                else { out.push(`${wt}.const -1`); out.push(`${wt}.mul`); } // fallback: * -1
                break;
            case 'not':
                out.push('i32.eqz');
                break;
            case '~':
                out.push(`${wt}.const -1`);
                out.push(`${wt}.xor`);
                break;
        }
    }

    // ==================== Binary ====================

    genBinary(e, hint, out) {
        const leftType  = this.inferType(e.left)  || hint || 'i32';
        const rightType = this.inferType(e.right) || hint || 'i32';
        const wt = this.dominantType(leftType, rightType);

        this.genExpr(e.left,  wt, out);
        this.genExpr(e.right, wt, out);

        const instr = this.binaryInstr(e.op, wt);
        out.push(instr);
    }

    binaryInstr(op, wt) {
        const isFloat  = wt === 'f32' || wt === 'f64';
        const isUnsigned = wt === 'u32' || wt === 'u64';
        const base = isUnsigned ? wt.replace('u', 'i') : wt;

        switch (op) {
            case '+':   return isFloat ? `${base}.add`   : `${base}.add`;
            case '-':   return isFloat ? `${base}.sub`   : `${base}.sub`;
            case '*':   return isFloat ? `${base}.mul`   : `${base}.mul`;
            case '/':   return isFloat ? `${base}.div`   : isUnsigned ? `${base}.div_u` : `${base}.div_s`;
            case '%':   return isFloat ? `${base}.rem`   : isUnsigned ? `${base}.rem_u` : `${base}.rem_s`;
            case '&':   return `${base}.and`;
            case '|':   return `${base}.or`;
            case '^':   return `${base}.xor`;
            case '<<':  return `${base}.shl`;
            case '>>':  return isUnsigned ? `${base}.shr_u` : `${base}.shr_s`;
            case '>>>': return `${base}.shr_u`;
            case '==':  return isFloat ? `${base}.eq`  : `${base}.eq`;
            case '!=':  return isFloat ? `${base}.ne`  : `${base}.ne`;
            case '<':   return isFloat ? `${base}.lt`  : isUnsigned ? `${base}.lt_u` : `${base}.lt_s`;
            case '>':   return isFloat ? `${base}.gt`  : isUnsigned ? `${base}.gt_u` : `${base}.gt_s`;
            case '<=':  return isFloat ? `${base}.le`  : isUnsigned ? `${base}.le_u` : `${base}.le_s`;
            case '>=':  return isFloat ? `${base}.ge`  : isUnsigned ? `${base}.ge_u` : `${base}.ge_s`;
            case 'and': return `${base}.and`;
            case 'or':  return `${base}.or`;
            default:    throw new WatError(`Unknown binary op: ${op}`);
        }
    }

    genTuple(e, out) {
        for (const el of e.elems) this.genExpr(el, null, out);
    }

    // ==================== Pipe ====================

    genPipe(e, _hint, out) {
        // Desugar: value -o f          → f(value)
        //          value -o f(_, b)    → f(value, b)
        //          value -o str.concat → str.concat(value)
        const target = e.target;

        if (target.kind === 'pipe_ident') {
            // Simple: push value then call
            this.genExpr(e.value, null, out);
            out.push(`call $${target.name}`);
        } else if (target.kind === 'pipe_call') {
            // Has args with possible _ placeholder
            const callee = target.callee;
            const args = target.args; // [{kind:'placeholder'|'arg', value?}]
            // Push all args in order, substituting value for _
            for (const arg of args) {
                if (arg.kind === 'placeholder') {
                    this.genExpr(e.value, null, out);
                } else {
                    this.genExpr(arg.value, null, out);
                }
            }
            // If no placeholder, value goes first
            if (!args.some(a => a.kind === 'placeholder')) {
                // value is implicit first arg (shouldn't happen per spec, but be safe)
                // Actually per spec if no _, pipe val goes first — this case shouldn't arise
                // since multi-arg always uses _
            }
            // Emit call
            if (callee.startsWith('str.')) {
                const method = callee.slice(4);
                out.push(`call $str.${method}`);
            } else {
                out.push(`call $${callee}`);
            }
        }
    }

    // ==================== Else (\ operator) ====================

    genElse(e, hint, out) {
        // expr \ fallback
        // expr \ unreachable
        const innerType = this.inferType(e.expr);
        const wt = innerType ? this.wasmTypeStr(innerType) : (hint || 'externref');

        if (e.fallback.kind === 'unreachable') {
            // trap if null
            this.genExpr(e.expr, wt, out);
            out.push(`ref.as_non_null`);
        } else {
            // (block $ok (result T)
            //   (br_on_non_null $ok expr)
            //   fallback)
            const lbl = `$__else_${this.nextUid()}`;
            out.push(`(block ${lbl} (result ${wt})`);
            out.push(`  (br_on_non_null ${lbl}`);
            const exprLines = [];
            this.genExpr(e.expr, wt, exprLines);
            for (const l of exprLines) out.push('  ' + l);
            out.push(`  )`);
            this.genExpr(e.fallback, wt, out);
            out.push(')');
        }
    }

    // ==================== Call ====================

    genCall(e, out) {
        // Direct or indirect call
        for (const arg of e.args) this.genExpr(arg, null, out);

        if (e.callee.kind === 'ident') {
            out.push(`call $${e.callee.name}`);
        } else if (e.callee.kind === 'index') {
            // call_ref via array.get: handlers[event.kind](event)
            this.genExpr(e.callee.object, null, out);
            this.genExpr(e.callee.index, null, out);
            const arrType = this.inferType(e.callee.object);
            const arrTypeName = arrType ? `$${arrType}_array` : '$func_array';
            out.push(`array.get ${arrTypeName}`);
            out.push(`call_ref`);
        } else {
            // Generic indirect
            this.genExpr(e.callee, null, out);
            out.push(`call_ref`);
        }
    }

    // ==================== Field / Index ====================

    genField(e, out) {
        const objType = this.inferType(e.object);
        this.genExpr(e.object, null, out);
        if (objType) {
            out.push(`struct.get $${objType} $${e.field}`);
        } else {
            out.push(`struct.get $__unknown $${e.field}`);
        }
    }

    genIndex(e, out) {
        const objType = this.inferType(e.object);
        this.genExpr(e.object, null, out);
        this.genExpr(e.index, 'i32', out);
        const elemType = objType ? `$${objType}_array` : '$__unknown_array';
        out.push(`array.get ${elemType}`);
    }

    // ==================== Namespace calls ====================

    genNsCall(e, out) {
        switch (e.ns) {
            case 'str':
                for (const a of e.args) this.genExpr(a, null, out);
                out.push(`call $str.${e.method}`);
                break;
            case 'array':
                this.genArrayNsCall(e, out);
                break;
            case 'ref':
                this.genRefNsCall(e, out);
                break;
            case 'i31':
                for (const a of e.args) this.genExpr(a, null, out);
                if (e.method === 'new') out.push('ref.i31');
                else if (e.method === 'get_s') out.push('i31.get_s');
                else if (e.method === 'get_u') out.push('i31.get_u');
                break;
            case 'extern':
                for (const a of e.args) this.genExpr(a, null, out);
                out.push('extern.convert_any');
                break;
            case 'any':
                for (const a of e.args) this.genExpr(a, null, out);
                out.push('any.convert_extern');
                break;
            default:
                throw new WatError(`Unknown namespace: ${e.ns}`);
        }
    }

    genArrayNsCall(e, out) {
        // array.len(arr), array.copy(...), array.fill(...)
        switch (e.method) {
            case 'len':
                this.genExpr(e.args[0], null, out);
                out.push('array.len');
                break;
            case 'copy': {
                const [dst, di, src, si, len] = e.args;
                const dstType = this.inferType(dst) || '__unknown';
                const srcType = this.inferType(src) || '__unknown';
                this.genExpr(dst, null, out);
                this.genExpr(di, 'i32', out);
                this.genExpr(src, null, out);
                this.genExpr(si, 'i32', out);
                this.genExpr(len, 'i32', out);
                out.push(`array.copy $${dstType}_array $${srcType}_array`);
                break;
            }
            case 'fill': {
                const [arr, off, val, len] = e.args;
                const arrType = this.inferType(arr) || '__unknown';
                this.genExpr(arr, null, out);
                this.genExpr(off, 'i32', out);
                this.genExpr(val, null, out);
                this.genExpr(len, 'i32', out);
                out.push(`array.fill $${arrType}_array`);
                break;
            }
            default:
                throw new WatError(`Unknown array namespace method: ${e.method}`);
        }
    }

    genRefNsCall(e, out) {
        switch (e.method) {
            case 'is_null':
                this.genExpr(e.args[0], null, out);
                out.push('ref.is_null');
                break;
            case 'as_non_null':
                this.genExpr(e.args[0], null, out);
                out.push('ref.as_non_null');
                break;
            case 'eq':
                this.genExpr(e.args[0], null, out);
                this.genExpr(e.args[1], null, out);
                out.push('ref.eq');
                break;
            case 'cast':
            case 'test': {
                // ref.cast<T>(val) or ref.test<T>(val)
                // We don't have generics in AST — type comes from first arg or method name
                // The type arg would be encoded differently; for now use inferred type
                this.genExpr(e.args[0], null, out);
                const typeName = e.args.length > 1 ? e.args[1].name : '__unknown';
                out.push(e.method === 'cast'
                    ? `ref.cast (ref $${typeName})`
                    : `ref.test (ref $${typeName})`);
                break;
            }
            default:
                throw new WatError(`Unknown ref namespace method: ${e.method}`);
        }
    }

    genNsRef(e, _out) {
        // namespace.field without call — e.g. str.length as a value (unlikely)
        throw new WatError(`Namespace reference without call not supported: ${e.ns}.${e.method}`);
    }

    // ==================== If ====================

    genIf(e, hint, out) {
        this.genExpr(e.cond, 'i32', out);
        const resultType = hint || (e.else ? this.inferType({ kind: 'block', stmts: e.then.stmts }) : null);
        const resultClause = resultType ? ` (result ${resultType})` : '';

        out.push(`(if${resultClause}`);
        out.push('  (then');
        const thenLines = [];
        this.genBlock(e.then, thenLines, false);
        for (const l of thenLines) out.push('    ' + l);
        out.push('  )');
        if (e.else) {
            out.push('  (else');
            const elseLines = [];
            if (e.else.kind === 'block') {
                this.genBlock(e.else, elseLines, false);
            } else {
                this.genExpr(e.else, resultType, elseLines);
            }
            for (const l of elseLines) out.push('    ' + l);
            out.push('  )');
        }
        out.push(')');
    }

    // ==================== Match ====================

    genMatch(e, hint, out) {
        // Check if it's a type match (has guards) or scalar match
        const hasTypeGuards = e.arms.some(a => a.guard !== null);

        if (hasTypeGuards) {
            this.genTypeMatch(e, hint, out);
        } else {
            this.genScalarMatch(e, hint, out);
        }
    }

    genTypeMatch(e, hint, out) {
        // Nested br_on_cast blocks
        // (block $arm_n (result ...)
        //   (block $arm_{n-1} (result ref $T_{n-1})
        //     ...
        //       (local.get $subject)
        //       (br_on_cast $arm_0 (ref $SuperType) (ref $T0))
        //       ...
        //       (unreachable)
        //     (call $handler_0))
        //   (call $handler_{n-1}))
        // (call $handler_n)

        const subjectType = this.inferType(e.subject) || '__unknown';
        const arms = e.arms;
        const resultType = hint || 'i32';  // fallback

        // Emit subject to a temporary — actually just use local if it's an ident
        // For simplicity, emit subject to a local ref
        // The WAT pattern: emit the subject multiple times (it's a local.get so cheap)

        // Build the nested block structure
        // Each arm except the last gets a block; last arm falls through
        const n = arms.length;
        const labels = arms.slice(0, n - 1).map((_, i) => `$__match_${this.labelStack.length}_${i}`);
        this.labelStack.push({ type: 'match' });

        // Wrap in n-1 nested blocks
        for (let i = n - 2; i >= 0; i--) {
            const guard = arms[i].guard || subjectType;
            out.push(`(block ${labels[i]} (result (ref $${guard}))`);
        }

        // Innermost: emit subject + br_on_cast chain
        this.genExpr(e.subject, null, out);
        for (let i = 0; i < n - 1; i++) {
            const guard = arms[i].guard || subjectType;
            out.push(`br_on_cast ${labels[i]} (ref $${subjectType}) (ref $${guard})`);
        }
        // Last arm — bind pattern var if named
        if (arms[n - 1].pattern !== '_') {
            out.push(`local.set $${arms[n - 1].pattern}`);
            // Register in localTypes with the variant type
            const varType = arms[n - 1].guard || subjectType;
            this.localTypes.set(arms[n - 1].pattern, { kind: 'named', name: varType });
        } else {
            out.push('drop');
        }
        this.genExpr(arms[n - 1].expr, resultType, out);

        // Close inner blocks and emit arm bodies
        for (let i = n - 2; i >= 0; i--) {
            out.push(')'); // close the block for arm i
            // After the block: stack has (ref $GuardType)
            const arm = arms[i];
            if (arm.pattern !== '_') {
                out.push(`local.set $${arm.pattern}`);
                const varType = arm.guard || subjectType;
                this.localTypes.set(arm.pattern, { kind: 'named', name: varType });
            } else {
                out.push('drop');
            }
            this.genExpr(arm.expr, resultType, out);
        }

        this.labelStack.pop();
    }

    genScalarMatch(e, hint, out) {
        // Simple if-else chain (br_table would need contiguous integers)
        // For now emit as if-else chain
        this.genExpr(e.subject, null, out);

        // Save subject to temp local
        const tmpName = `$__match_subj_${this.labelStack.length}`;
        out.push(`local.set ${tmpName}`);

        // Emit as if-else chain
        for (let i = 0; i < e.arms.length; i++) {
            const arm = e.arms[i];
            if (arm.pattern === '_') {
                this.genExpr(arm.expr, hint, out);
                break;
            }
            out.push(`local.get ${tmpName}`);
            out.push(`i32.const ${arm.pattern}`);
            out.push('i32.eq');
            out.push('(if (then');
            this.genExpr(arm.expr, hint, out);
            out.push(') (else');
        }
        // Close else branches
        for (const arm of e.arms) {
            if (arm.pattern === '_') break;
            out.push('))');
        }
    }

    // ==================== For loop ====================

    genFor(e, out) {
        const uid = this.nextUid();
        const breakLbl = `$__break_${uid}`;
        const contLbl  = `$__continue_${uid}`;
        this.labelStack.push({ kind: 'loop', breakLbl });

        if (e.sources.length === 0) {
            // Infinite loop
            out.push(`(block ${breakLbl}`);
            out.push(`  (loop ${contLbl}`);
            const bodyLines = [];
            this.genBlock(e.body, bodyLines, false);
            for (const l of bodyLines) out.push('    ' + l);
            out.push(`    (br ${contLbl})`);
            out.push('  )');
            out.push(')');
            this.labelStack.pop();
            return;
        }

        const src = e.sources[0];

        if (src.kind === 'range') {
            // for (start..end) |cap| { ... }
            const cap = e.captures[0] || `__i_${uid}`;

            const startLines = [];
            this.genExpr(src.start, 'i32', startLines);
            for (const l of startLines) out.push(l);
            out.push(`local.set $${cap}`);

            const endLines = [];
            this.genExpr(src.end, 'i32', endLines);

            out.push(`(block ${breakLbl}`);
            out.push(`  (loop ${contLbl}`);

            // Guard: if cap >= end, break
            out.push(`    local.get $${cap}`);
            for (const l of endLines) out.push('    ' + l);
            out.push('    i32.ge_s');
            out.push(`    br_if ${breakLbl}`);

            // Body
            const bodyLines = [];
            this.genBlock(e.body, bodyLines, false);
            for (const l of bodyLines) out.push('    ' + l);

            // Increment
            out.push(`    local.get $${cap}`);
            out.push('    i32.const 1');
            out.push('    i32.add');
            out.push(`    local.set $${cap}`);

            out.push(`    (br ${contLbl})`);
            out.push('  )');
            out.push(')');
            this.labelStack.pop();
        } else {
            // While-style: for (cond()) { ... }
            out.push(`(block ${breakLbl}`);
            out.push(`  (loop ${contLbl}`);

            const condLines = [];
            this.genExpr(src.expr, 'i32', condLines);
            for (const l of condLines) out.push('    ' + l);
            out.push('    i32.eqz');
            out.push(`    br_if ${breakLbl}`);

            const bodyLines = [];
            this.genBlock(e.body, bodyLines, false);
            for (const l of bodyLines) out.push('    ' + l);

            out.push(`    (br ${contLbl})`);
            out.push('  )');
            out.push(')');
            this.labelStack.pop();
        }
    }

    // ==================== Block expression ====================

    genBlockExpr(e, hint, out) {
        const label = e.label ? `$${e.label}` : `$__block_${this.nextUid()}`;
        const resultType = hint;
        const resultClause = resultType ? ` (result ${resultType})` : '';
        out.push(`(block ${label}${resultClause}`);
        this.labelStack.push({ label: e.label, wasmLabel: label });
        const bodyLines = [];
        this.genBlock(e.body, bodyLines, false);
        for (const l of bodyLines) out.push('  ' + l);
        this.labelStack.pop();
        out.push(')');
    }

    genBreak(e, out) {
        if (e.value) this.genExpr(e.value, null, out);
        let label;
        if (e.label) {
            label = `$${e.label}`;
        } else {
            // Find innermost loop or block label
            const frame = [...this.labelStack].reverse().find(f => f.kind === 'loop' || f.wasmLabel);
            label = frame
                ? (frame.kind === 'loop' ? frame.breakLbl : frame.wasmLabel)
                : '$__break';
        }
        out.push(`br ${label}`);
    }

    // ==================== Let binding ====================

    genLet(e, out) {
        // Evaluate the value
        const targets = e.targets;
        if (targets.length === 1) {
            const wt = this.wasmType(targets[0].type);
            this.genExpr(e.value, wt, out);
            out.push(`local.set $${targets[0].name}`);
        } else {
            // Multi-value: call produces values on stack, set in reverse
            this.genExpr(e.value, null, out);
            for (let i = targets.length - 1; i >= 0; i--) {
                out.push(`local.set $${targets[i].name}`);
            }
        }
    }

    // ==================== Struct init ====================

    genStructInit(e, out) {
        const decl = this.typeDeclMap.get(e.type);
        if (!decl) throw new WatError(`Unknown type: ${e.type}`);

        // Build a field-name -> field map
        let allFields = [];
        if (decl.kind === 'struct_decl') {
            allFields = decl.fields;
        } else if (decl.kind === 'type_decl') {
            // Variant — find the right variant
            const variant = decl.variants.find(v => v.name === e.type);
            if (variant) allFields = variant.fields;
        }

        // Also look in sum type variants
        if (allFields.length === 0) {
            for (const td of this.typeDecls) {
                const v = td.variants.find(v => v.name === e.type);
                if (v) { allFields = v.fields; break; }
            }
        }

        const fieldMap = new Map(e.fields.map(fi => [fi.name, fi.value]));

        // Emit fields in declaration order
        for (const f of allFields) {
            const val = fieldMap.get(f.name);
            if (val) {
                this.genExpr(val, this.wasmType(f.type), out);
            } else {
                // Default zero
                out.push(this.defaultValue(f.type));
            }
        }
        out.push(`struct.new $${e.type}`);
    }

    // ==================== Array init ====================

    genArrayInit(e, out) {
        const elemWt = this.wasmType(e.elem);
        const key = this.elemTypeKey(e.elem);
        this.requireArrayType(key);
        const arrTypeName = this.arrayTypes.get(key);

        switch (e.method) {
            case 'new': {
                // array[T].new(len, init) → array.new $T_array init len
                // (array.new: first arg is init value, second is length)
                const [len, init] = e.args;
                this.genExpr(init, elemWt, out);
                this.genExpr(len, 'i32', out);
                out.push(`array.new ${arrTypeName}`);
                break;
            }
            case 'new_fixed': {
                // array[T].new_fixed(v1, v2, ...) → array.new_fixed $T_array N v1 v2 ...
                for (const a of e.args) this.genExpr(a, elemWt, out);
                out.push(`array.new_fixed ${arrTypeName} ${e.args.length}`);
                break;
            }
            case 'new_default': {
                // array[T].new_default(len) → array.new_default $T_array
                this.genExpr(e.args[0], 'i32', out);
                out.push(`array.new_default ${arrTypeName}`);
                break;
            }
            default:
                throw new WatError(`Unknown array init method: ${e.method}`);
        }
    }

    requireArrayType(key) {
        if (!this.arrayTypes.has(key)) {
            this.arrayTypes.set(key, `$${key}_array`);
        }
    }

    // ==================== Assign ====================

    genAssign(e, out) {
        if (e.lhs.kind === 'ident') {
            const wt = this.wasmType(this.localTypes.get(e.lhs.name) || { kind: 'scalar', name: 'i32' });
            this.genExpr(e.rhs, wt, out);
            out.push(`local.set $${e.lhs.name}`);
        } else if (e.lhs.kind === 'field') {
            const objType = this.inferType(e.lhs.object);
            this.genExpr(e.lhs.object, null, out);
            this.genExpr(e.rhs, null, out);
            out.push(`struct.set $${objType || '__unknown'} $${e.lhs.field}`);
        } else if (e.lhs.kind === 'index') {
            const arrType = this.inferType(e.lhs.object) || '__unknown';
            this.genExpr(e.lhs.object, null, out);
            this.genExpr(e.lhs.index, 'i32', out);
            this.genExpr(e.rhs, null, out);
            out.push(`array.set $${arrType}_array`);
        }
    }

    // ==================== Type system helpers ====================

    wasmType(t) {
        if (!t) return 'i32';
        switch (t.kind) {
            case 'scalar':   return SCALAR_WASM[t.name] || t.name;
            case 'named':    return this.namedWasmType(t.name);
            case 'nullable': return this.nullableWasmType(t.inner);
            case 'array': {
                const key = this.elemTypeKey(t.elem);
                this.requireArrayType(key);
                return `(ref ${this.arrayTypes.get(key)})`;
            }
            case 'func_type': return `(ref $func_${this.funcTypeKey(t)})`;
            case 'exclusive':
            case 'multi_return': return ''; // handled in result lists
            default: return 'i32';
        }
    }

    namedWasmType(name) {
        switch (name) {
            case 'str':       return 'externref';
            case 'externref': return 'externref';
            case 'anyref':    return 'anyref';
            case 'eqref':     return 'eqref';
            case 'i31':       return 'i31ref';
            default:          return `(ref $${name})`;
        }
    }

    nullableWasmType(inner) {
        if (!inner) return 'externref';
        if (inner.kind === 'named') {
            const name = inner.name;
            switch (name) {
                case 'str':       return 'externref';
                case 'externref': return 'externref';
                case 'anyref':    return 'anyref';
                default:          return `(ref null $${name})`;
            }
        }
        // Fallback
        return this.wasmType(inner);
    }

    elemKeyWasmType(key) {
        // Convert elem key back to a wasm type for the array declaration
        if (SCALAR_WASM[key]) return SCALAR_WASM[key];
        switch (key) {
            case 'str':
            case 'externref': return 'externref';
            case 'anyref': return 'anyref';
            case 'i31': return 'i31ref';
            default: return `(ref $${key})`;
        }
    }

    // Emit `(result ...)` clauses for a return type
    watResultList(retType) {
        if (!retType) return '';
        const results = this.flattenResultTypes(retType);
        return results.map(wt => `(result ${wt})`).join(' ');
    }

    flattenResultTypes(t) {
        if (!t) return [];
        switch (t.kind) {
            case 'scalar':   return [SCALAR_WASM[t.name] || t.name];
            case 'named':    return [this.namedWasmType(t.name)];
            case 'nullable': return [this.nullableWasmType(t.inner)];
            case 'array': {
                const key = this.elemTypeKey(t.elem);
                return [`(ref ${this.arrayTypes.get(key) || `$${key}_array`})`];
            }
            case 'exclusive': {
                // A # B → (ref null $A or externref) (ref null $B or externref)
                const okWt  = this.nullableWasmTypeFor(t.ok);
                const errWt = this.nullableWasmTypeFor(t.err);
                return [okWt, errWt];
            }
            case 'multi_return': {
                return t.components.flatMap(c => this.flattenResultTypes(c));
            }
            default: return [this.wasmType(t)];
        }
    }

    nullableWasmTypeFor(t) {
        if (!t) return 'i32';  // null sentinel → i32
        if (t.kind === 'named') return this.nullableWasmType(t);
        if (t.kind === 'nullable') return this.nullableWasmType(t.inner);
        return this.wasmType(t);
    }

    funcTypeKey(t) {
        const params = t.params.map(p => this.wasmType(p)).join('_');
        const ret = this.watResultList(t.returnType).replace(/[() ]/g, '_');
        return `${params}_to_${ret}`;
    }

    returnHint(retType) {
        if (!retType) return null;
        const results = this.flattenResultTypes(retType);
        return results.length === 1 ? results[0] : null;
    }

    wasmTypeStr(inferredType) {
        if (!inferredType) return null;
        if (typeof inferredType === 'string') return SCALAR_WASM[inferredType] || inferredType;
        return this.wasmType(inferredType);
    }

    dominantType(a, b) {
        // If either is float, float wins; if either is u32, unsigned
        const floatTypes = ['f32', 'f64'];
        if (floatTypes.includes(a)) return a;
        if (floatTypes.includes(b)) return b;
        if (a === 'i64' || b === 'i64') return 'i64';
        if (a === 'u64' || b === 'u64') return 'u64';
        if (a === 'u32' || b === 'u32') return 'u32';
        return a || b || 'i32';
    }

    // ==================== Type inference ====================

    inferType(e) {
        if (!e) return null;
        switch (e.kind) {
            case 'int':    return 'i32';
            case 'float':  return 'f64';
            case 'bool':   return 'i32';
            case 'string': return 'str';
            case 'null':   return null;
            case 'ident': {
                const t = this.localTypes && this.localTypes.get(e.name);
                if (!t) return null;
                if (t.kind === 'scalar') return t.name;
                if (t.kind === 'named') return t.name;
                if (t.kind === 'array') return `${this.elemTypeKey(t.elem)}_array`;
                return null;
            }
            case 'binary': {
                const lt = this.inferType(e.left);
                const rt = this.inferType(e.right);
                // Comparison ops always return i32/bool
                if (['==','!=','<','>','<=','>=','and','or'].includes(e.op)) return 'i32';
                return this.dominantType(lt, rt);
            }
            case 'unary':  return this.inferType(e.expr);
            case 'field': {
                const objType = this.inferType(e.object);
                if (!objType) return null;
                const decl = this.typeDeclMap.get(objType);
                if (!decl) return null;
                const fields = decl.kind === 'struct_decl' ? decl.fields : [];
                const field = fields.find(f => f.name === e.field);
                if (!field) return null;
                if (field.type.kind === 'scalar') return field.type.name;
                if (field.type.kind === 'named') return field.type.name;
                return null;
            }
            case 'index': {
                const arrType = this.inferType(e.object);
                if (!arrType) return null;
                // arrType is like "Todo_array" or "i32_array"
                const elemKey = arrType.endsWith('_array') ? arrType.slice(0, -6) : null;
                return elemKey;
            }
            case 'call': {
                if (e.callee.kind !== 'ident') return null;
                const fnName = e.callee.name;
                const fn = this.fnItems.find(fi => fi.fn.name === fnName);
                if (!fn || !fn.fn.returnType) return null;
                const rt = fn.fn.returnType;
                if (rt.kind === 'scalar') return rt.name;
                if (rt.kind === 'named') return rt.name;
                return null;
            }
            case 'ns_call': {
                if (e.ns === 'str') {
                    const b = STR_BUILTINS[e.method];
                    if (!b) return null;
                    if (b.sig.includes('result i32')) return 'i32';
                    if (b.sig.includes('result externref')) return 'str';
                }
                if (e.ns === 'array' && e.method === 'len') return 'i32';
                return null;
            }
            case 'struct_init': return e.type;
            case 'array_init': return `${this.elemTypeKey(e.elem)}_array`;
            case 'if': return this.inferType({ kind: 'block', stmts: e.then.stmts });
            case 'block': {
                const stmts = e.stmts;
                if (stmts.length === 0) return null;
                return this.inferType(stmts[stmts.length - 1]);
            }
            default: return null;
        }
    }

    // ==================== Default values ====================

    defaultValue(t) {
        if (!t) return 'i32.const 0';
        if (t.kind === 'scalar') {
            const wt = SCALAR_WASM[t.name];
            return `${wt}.const 0`;
        }
        if (t.kind === 'named') {
            const name = t.name;
            if (name === 'str' || name === 'externref') return 'ref.null extern';
            return `ref.null $${name}`;
        }
        if (t.kind === 'nullable') return `ref.null ${this.nullableNullTarget(t.inner)}`;
        return 'i32.const 0';
    }

    nullableNullTarget(inner) {
        if (!inner) return 'none';
        if (inner.kind === 'named') {
            const n = inner.name;
            if (n === 'str' || n === 'externref') return 'extern';
            return `$${n}`;
        }
        return 'none';
    }

    // ==================== Inline expression helper ====================

    genExprInline(e, hint) {
        const out = [];
        this.genExpr(e, hint, out);
        return out.join(' ');
    }

    // ==================== Misc ====================

    exprProducesValue(e) {
        return !['assign', 'for', 'let'].includes(e.kind);
    }
}
