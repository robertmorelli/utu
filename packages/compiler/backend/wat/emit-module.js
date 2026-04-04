import * as shared from "./shared.js";

const {
    WatGen,
    kids,
    childOfType,
    childrenOfType,
    findAnonBetween,
    hasAnon,
    walk,
    HIDDEN_TAG_FIELD,
    TAGGED_ROOT_TYPE,
    EQREF_TYPE,
    protoDefaultTypeName,
    protoDispatchName,
    protoElemName,
    protoFuncTypeName,
    protoImplName,
    protoSetterDispatchName,
    protoSetterElemName,
    protoSetterFuncTypeName,
    protoSetterTableName,
    protoSetterThunkName,
    protoSetterTrapName,
    protoTableName,
    protoThunkName,
    protoTrapName,
    protocolSetterImplKey,
    flattenTuple,
    literalInfo,
    parseMatchArm,
    parseAltArm,
    parseType,
    TYPE_VISIT_HANDLERS,
    BODY_TYPE_VISIT_HANDLERS,
    ELEM_TYPE_KEY_HANDLERS,
    LOCAL_COLLECT_HANDLERS,
    VALID_CONST_WASM_TYPES,
    CONST_UNARY_OPS,
    CONST_BINARY_OPS,
    CONST_EXPR_HANDLERS,
    CONST_LITERAL_EVALUATORS,
    I32,
} = shared;

const ModuleEmitterMixin = class {
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
        for (const slice of this.protocolSlices) lines.push(this.emitProtocolFuncType(slice));
        for (const slice of this.protocolSetterSlices) lines.push(this.emitProtocolFuncType(slice));
        for (const slice of this.protocolSlices) lines.push(this.emitProtocolTable(slice));
        for (const slice of this.protocolSetterSlices) lines.push(this.emitProtocolTable(slice));

        for (const [i, fn] of this.fnItems.entries()) {
            lines.push(this.emitFn(fn, this.profile === 'ticks' ? i : null));
            if (fn.exported) lines.push(`  (export "${fn.exportName}" (func $${fn.name}))`);
        }

        for (const slice of this.protocolSlices) lines.push(this.emitProtocolTrapThunk(slice));
        for (const slice of this.protocolSetterSlices) lines.push(this.emitProtocolTrapThunk(slice));
        for (const thunk of this.protocolThunks) lines.push(this.emitProtocolThunk(thunk));
        for (const thunk of this.protocolSetterThunks) lines.push(this.emitProtocolThunk(thunk));
        for (const helper of this.protocolHelpers) lines.push(this.emitProtocolHelper(helper));
        for (const helper of this.protocolSetterHelpers) lines.push(this.emitProtocolHelper(helper));

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

        for (const slice of this.protocolSlices) lines.push(this.emitProtocolElem(slice));
        for (const slice of this.protocolSetterSlices) lines.push(this.emitProtocolElem(slice));

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

        for (const decl of this.protoDecls) {
            for (const method of decl.methods) {
                for (const param of method.params) visitType(param);
                visitType(method.returnType);
            }
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
            for (const param of fn.params) visitType(param.type);
            visitType(fn.returnType);
            visitBody(fn.body);
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
        return [];
    }

    emitRecTypeDefs() {
        return [
            ...[...this.arrayTypes].map(([key, name]) => `    (type ${name} (array (mut ${this.elemKeyWasmType(key)})))`),
            ...(this.usesTaggedRoot() ? [this.emitTaggedRootType('    '), ...this.emitProtocolDefaultTypes('    ')] : []),
            ...this.structDecls.map((decl) => this.emitStructType(decl)),
            ...this.typeDecls.flatMap((decl) => this.emitSumType(decl)),
        ];
    }

    usesTaggedRoot() {
        return this.taggedStructTags.size > 0 || this.protoDecls.length > 0;
    }

    emitTaggedRootType(indent = '  ') {
        return `${indent}(type $${TAGGED_ROOT_TYPE} (sub (struct\n${indent}  ${this.watField(HIDDEN_TAG_FIELD)}\n${indent})))`;
    }

    emitProtocolDefaultTypes(indent = '  ') {
        return this.protoDecls.map((decl) => this.emitStructLikeType(
            `${indent}(type $${protoDefaultTypeName(decl.name)} (sub $${TAGGED_ROOT_TYPE} (struct`,
            [HIDDEN_TAG_FIELD],
            `${indent})))`,
        ));
    }

    emitStructType(decl, indent = '    ') {
        const prefix = decl.tagged
            ? `${indent}(type $${decl.name} (sub $${TAGGED_ROOT_TYPE} (struct`
            : `${indent}(type $${decl.name} (struct`;
        const closing = decl.tagged ? `${indent})))` : `${indent}))`;
        return this.emitStructLikeType(prefix, this.runtimeStructFields(decl), closing);
    }

    emitSumType(decl, indent = '    ') {
        const lines = [this.emitStructLikeType(
            decl.tagged
                ? `${indent}(type $${decl.name} (sub $${TAGGED_ROOT_TYPE} (struct`
                : `${indent}(type $${decl.name} (sub (struct`,
            decl.tagged ? [HIDDEN_TAG_FIELD] : [],
            `${indent})))`,
        )];
        for (const variant of decl.variants)
            lines.push(this.emitStructLikeType(
                `${indent}(type $${variant.name} (sub $${decl.name} (struct`,
                decl.tagged ? [HIDDEN_TAG_FIELD, ...variant.fields] : variant.fields,
                `${indent})))`,
            ));
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

    emitProtocolTable(table) {
        return `  (table $${table.tableName} ${table.size} funcref)`;
    }

    emitProtocolFuncType(slice) {
        return `  (type $${slice.funcTypeName} (func${this.funcTypeClause(slice.dispatchParams, slice.returnType)}))`;
    }

    emitProtocolTrapThunk(slice) {
        return this.emitFunc(slice.trapName, slice.dispatchParams, slice.returnType, [], out => out.push('unreachable'), [], null, slice.funcTypeName);
    }

    emitProtocolThunk(thunk) {
        return this.emitFunc(thunk.name, thunk.params, thunk.returnType, [], out => {
            out.push('local.get $self');
            out.push(`ref.cast (ref $${thunk.selfTypeName})`);
            if (thunk.impl.syntheticGetterField) {
                out.push(`struct.get $${thunk.selfTypeName} $${thunk.impl.syntheticGetterField}`);
                return;
            }
            if (thunk.impl.syntheticSetterField) {
                out.push(`local.get $${thunk.params[1].name}`);
                out.push(`struct.set $${thunk.selfTypeName} $${thunk.impl.syntheticSetterField}`);
                return;
            }
            for (const param of thunk.params.slice(1)) out.push(`local.get $${param.name}`);
            out.push(`call $${thunk.impl.fn.name}`);
        }, [], null, thunk.funcTypeName);
    }

    emitProtocolHelper(helper) {
        return this.emitFunc(helper.name, helper.params, helper.returnType, [], out => {
            for (const param of helper.params) out.push(`local.get $${param.name}`);
            out.push('local.get $self');
            out.push(`struct.get $${helper.tagTypeName} $${HIDDEN_TAG_FIELD.name}`);
            out.push(`call_indirect $${helper.tableName}${this.callIndirectSig(helper.funcTypeName, null, null)}`);
        });
    }

    emitProtocolElem(slice) {
        return `  (elem $${slice.elemName} (table $${slice.tableName}) (i32.const 0) func ${slice.entries.map((name) => `$${name}`).join(' ')})`;
    }

    callIndirectSig(funcTypeName, params, returnType) {
        if (funcTypeName) return ` (type $${funcTypeName})`;
        const parts = [
            ...params.map((param) => `(param ${this.wasmType(param.type)})`),
            ...this.flattenResultTypes(returnType).map((type) => `(result ${type})`),
        ];
        return parts.length ? ` ${parts.join(' ')}` : '';
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

    emitFunc(name, params, returnType, body, emitBody, extraLocals = [], profileId = null, funcTypeName = null) {
        const paramNames = new Set();
        for (const param of params) {
            if (paramNames.has(param.name))
                throw new Error(`Duplicate parameter name "${param.name}" is not allowed`);
            paramNames.add(param.name);
        }
        this.localTypes = new Map(params.map(param => [param.name, param.type]));
        this.currentReturnType = returnType;
        this.labelStack = [];
        this.currentProfileId = profileId;
        const locals = this.collectLocals(body, extraLocals);

        const paramList = params
            .map(param => `(param $${param.name} ${this.wasmType(param.type)})`)
            .join(' ');
        const results = returnType ? ` ${this.watResultList(returnType)}` : '';
        const sig = [funcTypeName ? `(type $${funcTypeName})` : null, paramList, results].filter(Boolean).join(' ');

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
        const body = fn.body;
        return this.emitFunc(fn.name, fn.params, fn.returnType, body, out => this.genBody(kids(body), out, true), [], profileId, fn.protocolFuncTypeName ?? null);
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
            [],
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
        if (seen.has(name) || this.localTypes.has(name))
            throw new Error(`Local shadowing is not allowed; duplicate binding "${name}"`);
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
};

export function installModuleEmitterMixin(Target = WatGen) {
    for (const name of Object.getOwnPropertyNames(ModuleEmitterMixin.prototype)) {
        if (name !== "constructor") Target.prototype[name] = ModuleEmitterMixin.prototype[name];
    }
}
