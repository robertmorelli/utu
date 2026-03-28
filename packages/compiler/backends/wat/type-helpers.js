import * as shared from "./shared.js";

const {
    WatGen,
    kids,
    childOfType,
    childrenOfType,
    findAnonBetween,
    hasAnon,
    parseIntLit,
    parseType,
    flattenTuple,
    namespaceInfo,
    literalInfo,
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
    INFER_TYPE_HANDLERS,
    INFER_NS_CALL_HANDLERS,
    DEFAULT_VALUE_GENERATORS,
    TYPE_VISIT_HANDLERS,
    BODY_TYPE_VISIT_HANDLERS,
    ELEM_TYPE_KEY_HANDLERS,
    SCALAR_PATTERN_GENERATORS,
    TAGGED_ROOT_TYPE,
    SCALAR_MATCH_COMPARE_TYPES,
    BINARY_BOOL_OPS,
    DISCARD_HINT_NODES,
    VALUELESS_EXPR_TYPES,
    INFERRED_VALUE_EXPR_TYPES,
    SCALAR_NAMES,
    DISCARD_HINT,
    COMPOUND_ASSIGN_BINARY_OPS,
    ASSIGN_TARGET_HANDLERS,
} = shared;

const TypeHelperMixin = class {
    requireArrayType(key) { if (!this.arrayTypes.has(key)) this.arrayTypes.set(key, `$${key}_array`); }
    arrayCtorInfoFromHint(hint, opname) {
        if (!hint) {
            throw new Error(`${opname} requires an expected array type such as "let xs: array[T] = array.new_default(...)"`);
        }
        const match = /^\(ref(?: null)? (\$[^\s)]+)\)$/.exec(hint);
        const arrayTypeName = match?.[1] ?? null;
        if (!arrayTypeName) {
            throw new Error(`${opname} requires an expected array type, got "${hint}"`);
        }
        for (const [key, name] of this.arrayTypes) {
            if (name === arrayTypeName) {
                return {
                    key,
                    arrayTypeName: name,
                    elemWasm: this.elemKeyWasmType(key),
                };
            }
        }
        throw new Error(`${opname} could not resolve the expected array type from "${hint}"`);
    }

    genAssign(node, out) {
        const [lhs, rhs] = kids(node);
        const op = this.assignOperator(node);
        const emit = ASSIGN_TARGET_HANDLERS[lhs.type];
        if (emit) return void emit(this, lhs, rhs, op, node, out);
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
    namedWasmType(name) { return REF_WASM[name] || `(ref $${this.wasmNamedTypeTarget(name)})`; }
    nullableWasmType(inner) { return !inner ? 'externref' : inner.kind === 'named' ? NULLABLE_REF_WASM[inner.name] || `(ref null $${this.wasmNamedTypeTarget(inner.name)})` : this.wasmType(inner); }
    arrayWasmType(elemType) {
        const key = this.elemTypeKey(elemType);
        this.requireArrayType(key);
        return `(ref ${this.arrayTypes.get(key)})`;
    }
    elemKeyWasmType(key) {
        if (SCALAR_WASM[key]) return SCALAR_WASM[key];
        if (REF_WASM[key]) return REF_WASM[key];
        if (key.startsWith('nullable_')) return this.nullableElemKeyWasmType(key.slice('nullable_'.length));
        return `(ref $${this.wasmNamedTypeTarget(key)})`;
    }
    nullableElemKeyWasmType(key) {
        if (SCALAR_WASM[key]) return SCALAR_WASM[key];
        if (REF_WASM[key]) return NULLABLE_REF_WASM[key] || `(ref null $${key})`;
        if (key.startsWith('nullable_')) return this.nullableElemKeyWasmType(key.slice('nullable_'.length));
        if (key.endsWith('_array')) return `(ref null $${key})`;
        return `(ref null $${this.wasmNamedTypeTarget(key)})`;
    }
    watResultList(returnType) { return this.flattenResultTypes(returnType).map(type => `(result ${type})`).join(' '); }
    funcTypeClause(params, returnType) {
        return [
            ...params.map((param) => ` (param ${this.wasmType(param.type)})`),
            ...this.flattenResultTypes(returnType).map((type) => ` (result ${type})`),
        ].join('');
    }

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
    needsDiscardHint(node) { return DISCARD_HINT_NODES.has(node.type) || node.type === 'promote_expr'; }
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

    isRefComparableType(type) {
        if (!type) return false;
        if (typeof type === 'string') return !SCALAR_NAMES.has(type);
        return ['named', 'nullable', 'array', 'func_type'].includes(type.kind);
    }

    inferType(node) { return INFER_TYPE_HANDLERS[node.type]?.(this, node) ?? null; }
    inferredToType(inferred) {
        if (!inferred) return null;
        if (inferred.startsWith('nullable_')) {
            const inner = this.inferredToType(inferred.slice('nullable_'.length));
            return inner ? { kind: 'nullable', inner } : null;
        }
        if (inferred.endsWith('_array')) {
            const elem = this.inferredToType(inferred.slice(0, -6));
            return elem ? { kind: 'array', elem } : null;
        }
        return { kind: SCALAR_NAMES.has(inferred) ? 'scalar' : 'named', name: inferred };
    }
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
    typeText(type) {
        if (!type) return 'void';
        switch (type.kind) {
            case 'scalar':
            case 'named':
                return type.name;
            case 'nullable':
                return `?${this.typeText(type.inner)}`;
            case 'array':
                return `array[${this.typeText(type.elem)}]`;
            case 'exclusive':
                return `${this.typeText(type.ok)} # ${this.typeText(type.err)}`;
            case 'multi_return':
                return type.components.map((component) => this.typeText(component)).join(', ');
            case 'func_type':
                return `fun(${type.params.map((param) => this.typeText(param)).join(', ')}) ${this.typeText(type.returnType)}`;
            default:
                return 'unknown';
        }
    }
    typeFields(typeName) { return this.typeDeclMap.get(typeName)?.fields ?? this.variantDecls.get(typeName)?.fields ?? null; }

    lookupFieldType(typeName, fieldName) {
        const direct = this.typeFields(typeName)?.find(field => field.name === fieldName)?.type ?? null;
        if (direct) return direct;
        const helperName = this.protocolHelpersByTypeMember.get(`${typeName}.${fieldName}`) ?? null;
        return helperName ? this.lookupCallableReturnType(helperName) : null;
    }

    arrayTypeNameFromInferred(inferred) { return `$${inferred.endsWith('_array') ? inferred : `${inferred}_array`}`; }
    arrayElemKeyFromInferred(inferred) { return inferred?.endsWith('_array') ? inferred.slice(0, -6) : null; }
    scalarMatchTempName(node) { return `__match_subj_${node.id}`; }
    altSubjectTempName(node) { return `__alt_subj_${node.id}`; }
    assignValueTempName(node) { return `__assign_value_${node.id}`; }
    assignObjectTempName(node) { return `__assign_obj_${node.id}`; }
    assignIndexTempName(node) { return `__assign_index_${node.id}`; }
    assignOperator(node) {
        const [lhs, rhs] = kids(node);
        return findAnonBetween(node, lhs, rhs);
    }
    isCompoundAssign(node) { return this.assignOperator(node) !== '='; }
    tempLocalTypeForExpr(node) {
        return this.exprType(node) ?? this.inferredToType(this.inferType(node)) ?? I32;
    }
    assignValueType(lhs) {
        switch (lhs.type) {
            case 'identifier':
                return this.localTypes.get(lhs.text) ?? this.globalTypeMap.get(lhs.text) ?? I32;
            case 'field_expr': {
                const [object, field] = kids(lhs);
                return this.lookupFieldType(this.inferType(object), field.text) ?? I32;
            }
            case 'index_expr': {
                const [object] = kids(lhs);
                const elem = this.arrayElemKeyFromInferred(this.inferType(object));
                return this.inferredToType(elem) ?? I32;
            }
            default:
                return I32;
        }
    }
    genCompoundAssignValue(node, rhs, targetType, out) {
        const compoundOp = this.assignOperator(node);
        const binaryOp = COMPOUND_ASSIGN_BINARY_OPS.get(compoundOp);
        if (!binaryOp)
            throw new Error(`Unsupported assignment operator "${compoundOp}"`);
        const valueTemp = this.assignValueTempName(node);
        const targetInferred = this.typeName(targetType) ?? this.wasmType(targetType);
        const wasmType = this.wasmTypeStr(targetInferred) ?? this.wasmType(targetType);
        if (binaryOp === '^' && (targetInferred === 'f32' || targetInferred === 'f64')) {
            const exponent = this.floatExponentValue(rhs);
            if (exponent === 2) {
                out.push(`local.get $${valueTemp}`);
                out.push(`local.get $${valueTemp}`);
                out.push(`${wasmType}.mul`);
                return;
            }
            if (exponent === 0.5) {
                out.push(`local.get $${valueTemp}`);
                out.push(`${wasmType}.sqrt`);
                return;
            }
            throw new Error('Floating-point "^" currently supports only 2.0 and 0.5 exponents');
        }
        const binaryType = BINARY_BOOL_OPS.has(binaryOp)
            ? this.dominantType(this.inferType(rhs) || targetInferred, targetInferred)
            : targetInferred;
        out.push(`local.get $${valueTemp}`);
        this.genExprForBinaryOperand(rhs, this.inferType(rhs) || targetInferred, binaryType, out);
        out.push(this.binaryInstr(binaryOp, binaryType));
    }
    scalarMatchBranchTablePlan(node, arms, compareType) {
        if (compareType !== 'i32') return null;

        const fallbackIndex = arms.findIndex(arm => !arm.pattern);
        if (fallbackIndex !== -1 && fallbackIndex !== arms.length - 1) return null;

        const explicitArms = (fallbackIndex === -1 ? arms : arms.slice(0, fallbackIndex))
            .map((arm) => ({ arm, value: this.scalarMatchPatternValue(arm.pattern) }));
        if (!explicitArms.length || explicitArms.some(({ value }) => value === null)) return null;

        const caseMap = new Map();
        for (const { arm, value } of explicitArms) {
            if (caseMap.has(value)) return null;
            caseMap.set(value, arm);
        }

        const values = [...caseMap.keys()].sort((left, right) => Number(left - right));
        const minValue = values[0];
        const maxValue = values[values.length - 1];
        const span = maxValue - minValue + 1;
        if (span > Math.max(8, values.length * 4)) return null;

        const cases = values.map((value, index) => ({
            value,
            arm: caseMap.get(value),
            label: `$__match_${node.id}_${index}`,
        }));
        const labelsByValue = new Map(cases.map((matchCase) => [matchCase.value, matchCase.label]));
        return {
            minValue,
            fallback: fallbackIndex === -1 ? null : arms[fallbackIndex],
            cases,
            tableLabels: Array.from({ length: span }, (_, offset) => labelsByValue.get(minValue + offset) ?? `$__match_default_${node.id}`),
        };
    }
    scalarMatchPatternValue(node) {
        if (!node) return null;
        const patternNode = node.type === 'match_lit' ? kids(node)[0] ?? node : node;
        if (patternNode.type === 'int_lit') {
            const value = parseIntLit(patternNode.text);
            return typeof value === 'bigint' ? null : value;
        }
        if (patternNode.text === 'true') return 1;
        if (patternNode.text === 'false') return 0;
        return null;
    }
    lookupCallableReturnType(name) { return this.callables.get(name)?.returnType ?? null; }
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

    wasmNamedTypeTarget(name) { return this.protocolNames.has(name) ? TAGGED_ROOT_TYPE : name; }
    refNullTarget(name) { return name === 'str' || name === 'externref' ? 'extern' : `$${this.wasmNamedTypeTarget(name)}`; }
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
};

export function installTypeHelperMixin(Target = WatGen) {
    for (const name of Object.getOwnPropertyNames(TypeHelperMixin.prototype)) {
        if (name !== "constructor") Target.prototype[name] = TypeHelperMixin.prototype[name];
    }
}
