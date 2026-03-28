import * as shared from "./shared.js";

const {
    WatGen,
    kids,
    childOfType,
    childrenOfType,
    findAnonBetween,
    hasAnon,
    literalInfo,
    namespaceInfo,
    parseMatchArm,
    parseAltArm,
    parseCapture,
    parsePromoteCapture,
    parseType,
    parsePipeTarget,
    parseBindTargets,
    parseForSources,
    flattenTuple,
    pipeArgValues,
    pipeCallee,
    FLOAT_NEG_INSTRS,
    BINARY_INSTR_BUILDERS,
    BINARY_BOOL_OPS,
    DIRECT_BINARY_INSTRS,
    COMPARE_BINARY_INSTRS,
    LITERAL_GENERATORS,
    UNARY_GENERATORS,
    ARRAY_NS_CALL_HANDLERS,
    NS_CALL_HANDLERS,
    REF_NS_OPS,
    SCALAR_PATTERN_GENERATORS,
    CALL_CALLEE_HANDLERS,
    ARRAY_INIT_HANDLERS,
    ASSIGN_TARGET_HANDLERS,
    EXPR_GENERATORS,
    HIDDEN_TAG_FIELD,
    I32,
    DISCARD_HINT,
    SIMPLE_NS_OPS,
} = shared;

const ExpressionGeneratorMixin = class {
    pipedArgs(value, args, isPlaceholder, readArg = arg => arg) {
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
        const emit = EXPR_GENERATORS[node.type];
        if (!emit) throw new Error(`Unsupported expr node in watgen: ${node.type}`);
        emit(this, node, hint, out);
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
        if (['==', '!='].includes(op)) {
            const leftExprType = this.exprType(left) ?? this.inferredToType(this.inferType(left));
            const rightExprType = this.exprType(right) ?? this.inferredToType(this.inferType(right));
            if (this.isRefComparableType(leftExprType) || this.isRefComparableType(rightExprType)) {
                this.genExpr(left, this.wasmTypeStr(leftExprType) ?? null, out);
                this.genExpr(right, this.wasmTypeStr(rightExprType) ?? null, out);
                out.push('ref.eq');
                if (op === '!=') out.push('i32.eqz');
                return;
            }
        }
        const leftType = this.inferType(left) || hint || 'i32';
        const rightType = this.inferType(right) || hint || 'i32';
        const wasmType = hint && this.isNumericWasmType(hint) && !BINARY_BOOL_OPS.has(op)
            ? hint
            : this.dominantType(leftType, rightType);

        if (op === '^' && (wasmType === 'f32' || wasmType === 'f64')) {
            const exponent = this.floatExponentValue(right);
            if (exponent === 2) {
                this.genExpr(left, wasmType, out);
                this.genExpr(left, wasmType, out);
                out.push(`${wasmType}.mul`);
                return;
            }
            if (exponent === 0.5) {
                this.genExpr(left, wasmType, out);
                out.push(`${wasmType}.sqrt`);
                return;
            }
            throw new Error('Floating-point "^" currently supports only 2.0 and 0.5 exponents');
        }

        this.genExprForBinaryOperand(left, leftType, wasmType, out);
        this.genExprForBinaryOperand(right, rightType, wasmType, out);
        out.push(this.binaryInstr(op, wasmType));
    }

    floatExponentValue(node) {
        const target = node?.type === 'paren_expr' ? kids(node)[0] : node;
        const info = target?.type === 'literal' ? literalInfo(target) : null;
        return info?.kind === 'float' || info?.kind === 'int' ? Number(info.value) : null;
    }

    genExprForBinaryOperand(node, sourceType, targetType, out) {
        const sourceWasm = this.wasmTypeStr(sourceType) || targetType;
        this.genExpr(node, sourceWasm, out);
        this.coerceNumeric(sourceWasm, targetType, out);
    }

    binaryInstr(op, wasmType) {
        const isFloat = wasmType === 'f32' || wasmType === 'f64';
        const isUnsigned = wasmType === 'u32' || wasmType === 'u64';
        const base = this.scalarWasmType(isUnsigned ? wasmType.replace('u', 'i') : wasmType);
        return BINARY_INSTR_BUILDERS[op]({ base, isFloat, isUnsigned });
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
        for (const arg of this.pipedArgs(value, target.kind === 'pipe_ident' ? [] : target.args, arg => arg.kind === 'placeholder', arg => arg.value))
            this.genExpr(arg, null, out);
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

    genCall(node, out, hint = null) {
        const callee = kids(node)[0], args = this.args(node);
        const emit = CALL_CALLEE_HANDLERS[callee.type];
        if (emit) return void emit(this, callee, args, out, hint);
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
        for (const arg of this.pipedArgs(value, args, arg => arg.type === 'identifier' && arg.text === '_'))
            this.genExpr(arg, null, out);
        out.push(`call $${target.kind === 'pipe_ident' ? target.name : target.callee}`);
    }

    genField(node, out) {
        const [object, field] = kids(node);
        const objectType = this.inferType(object);
        const getterHelper = objectType ? this.protocolHelpersByTypeMember.get(`${objectType}.${field.text}`) : null;
        this.genExpr(object, null, out);
        if (getterHelper) {
            out.push(`call $${getterHelper}`);
            return;
        }
        out.push(`struct.get $${objectType} $${field.text}`);
    }

    genIndex(node, out) {
        const [object, index] = kids(node);
        this.genExpr(object, null, out);
        this.genExpr(index, 'i32', out);
        out.push(`array.get ${this.arrayTypeNameFromInferred(this.inferType(object))}`);
    }

    genNsCall(node, out, explicitArgs = null, hint = null) {
        const { ns, method } = namespaceInfo(node), args = explicitArgs ?? this.args(node);
        const op = SIMPLE_NS_OPS[ns];
        if (op) {
            this.pushArgs(args, out);
            out.push(op);
            return;
        }
        NS_CALL_HANDLERS[ns](this, method, args, out, hint);
    }

    genArrayNsCall(method, args, out, hint = null) {
        ARRAY_NS_CALL_HANDLERS[method](this, args, out, hint);
    }

    genRefNsCall(method, args, out) {
        if (method === 'cast' || method === 'test') {
            this.genExpr(args[0], null, out);
            const typeName = args[1].text;
            out.push(method === 'cast'
                ? `ref.cast (ref $${this.wasmNamedTypeTarget(typeName)})`
                : `ref.test (ref $${this.wasmNamedTypeTarget(typeName)})`);
            return;
        }
        this.pushArgs(args.slice(0, method === 'eq' ? 2 : 1), out);
        out.push(REF_NS_OPS[method]);
    }

    genIf(node, hint, out) {
        const discard = hint === DISCARD_HINT;
        const branchHint = discard ? DISCARD_HINT : null;
        hint = this.valueHint(hint);
        const cond = kids(node)[0];
        const thenBlock = kids(node)[1];
        const elseBranch = kids(node)[2] ?? null;
        const inferredResultType = discard || hint ? null : (elseBranch ? this.exprType(thenBlock) : null);
        const resultType = discard ? null : (hint || this.wasmTypeStr(inferredResultType) || null);
        const branchType = resultType ?? branchHint;
        const resultClause = resultType ? ` (result ${resultType})` : '';
        if (resultType && !elseBranch)
            throw new Error('Value-position if expressions must include an else branch');

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
        const discard = hint === DISCARD_HINT;
        const branchHint = discard ? DISCARD_HINT : null;
        hint = this.valueHint(hint);
        const expr = kids(node)[0];
        const { name: ident } = parsePromoteCapture(kids(node)[1]);
        const thenBlock = kids(node)[2];
        const elseBlock = kids(node)[3] ?? null;
        const inferredResultType = discard || hint ? null : this.exprType(thenBlock);
        const resultType = discard ? null : (hint || this.wasmTypeStr(inferredResultType) || null);
        const branchType = resultType ?? branchHint;
        const resultClause = resultType ? ` (result ${resultType})` : '';
        if (resultType && !elseBlock)
            throw new Error('Value-position promote expressions must include an else branch');

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
        const inferredResultType = hint || discard ? null : this.exprType(arms[arms.length - 1]?.expr);
        const resultType = discard ? null : (hint || this.wasmTypeStr(inferredResultType) || null);
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
        const tempName = this.altSubjectTempName(node);

        out.push(`(block ${exitLabel}${resultType ? ` (result ${resultType})` : ''}`);
        for (let i = typedArms.length - 1; i >= 0; i--) {
            out.push(`  (block ${labels[i]} (result (ref $${typedArms[i].guard}))`);
        }
        this.genExpr(subject, null, out);
        out.push(`local.set $${tempName}`);
        for (let i = 0; i < typedArms.length; i++) {
            out.push(`local.get $${tempName}`);
            out.push(`br_on_cast ${labels[i]} (ref $${subjectType}) (ref $${typedArms[i].guard})`);
        }

        if (fallback) {
            out.push(`local.get $${tempName}`);
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
            out.push(`br ${exitLabel}`);
        }

        out.push(')');
    }

    genScalarMatch(node, arms, hint, out) {
        const discard = hint === DISCARD_HINT;
        hint = this.valueHint(hint);
        const subject = kids(node)[0];
        const tempName = this.scalarMatchTempName(node);
        const inferredResultType = hint || discard ? null : this.exprType(arms[arms.length - 1].expr);
        const resultType = discard ? null : (hint || this.wasmTypeStr(inferredResultType) || null);
        const compareType = this.scalarMatchCompareType(this.inferType(subject));

        this.genExpr(subject, compareType, out);
        out.push(`local.set $${tempName}`);
        const branchTablePlan = this.scalarMatchBranchTablePlan(node, arms, compareType);
        if (branchTablePlan) {
            this.genScalarMatchBranchTable(node, branchTablePlan, tempName, resultType, out);
            return;
        }
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

    genScalarMatchBranchTable(node, plan, tempName, resultType, out) {
        const exitLabel = `$__match_exit_${node.id}`;
        const defaultLabel = `$__match_default_${node.id}`;

        out.push(`(block ${exitLabel}${resultType ? ` (result ${resultType})` : ''}`);
        out.push(`  (block ${defaultLabel}`);
        for (let index = plan.cases.length - 1; index >= 0; index -= 1)
            out.push(`    (block ${plan.cases[index].label}`);

        out.push(`      local.get $${tempName}`);
        if (plan.minValue !== 0) {
            out.push(`      i32.const ${plan.minValue}`);
            out.push('      i32.sub');
        }
        out.push(`      br_table ${plan.tableLabels.join(' ')} ${defaultLabel}`);

        for (const matchCase of plan.cases) {
            out.push('    )');
            this.pushGenerated(out, lines => this.genBranchExpr(matchCase.arm.expr, resultType, lines), '    ');
            out.push(`    br ${exitLabel}`);
        }

        out.push('  )');
        if (plan.fallback) this.genBranchExpr(plan.fallback.expr, resultType, out);
        else out.push('  unreachable');
        out.push(')');
    }

    genFor(node, out) {
        const sources = parseForSources(childOfType(node, 'for_sources'));
        const captures = parseCapture(childOfType(node, 'capture'));
        if (sources.length !== 1)
            throw new Error('for loops support exactly one range source in v1');
        if (captures.length > 1)
            throw new Error('for loops support at most one capture in v1');
        const body = childOfType(node, 'block');
        const emitBody = lines => this.genBody(kids(body), lines, false);

        const source = sources[0];
        if (source.kind === 'range') {
            const capture = captures[0] || `__i_${node.id}`;
            this.genExpr(source.start, 'i32', out);
            out.push(`local.set $${capture}`);
            this.withLoop(out, (breakLabel, continueLabel, uid) => {
                out.push(`    local.get $${capture}`);
                this.pushGenerated(out, lines => this.genExpr(source.end, 'i32', lines));
                out.push(source.inclusive ? '    i32.gt_s' : '    i32.ge_s');
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
        this.withLoop(out, (breakLabel, continueLabel) => {
            out.push('    local.get $iterations');
            out.push('    i32.eqz');
            out.push(`    br_if ${breakLabel}`);
            this.pushGenerated(out, lines => this.genBody(kids(bench.measureBody), lines));
            out.push('    local.get $iterations');
            out.push('    i32.const 1');
            out.push('    i32.sub');
            out.push('    local.set $iterations');
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
        const fields = this.runtimeTypeFields(typeName);
        if (!fields) throw new Error(`Unknown type: ${typeName}`);
        const fieldNodes = childrenOfType(node, 'field_init');
        const fieldMap = new Map();
        const declaredFields = new Set(fields.filter((field) => field.name !== HIDDEN_TAG_FIELD.name).map((field) => field.name));
        for (const field of fieldNodes) {
            const name = kids(field)[0].text;
            if (fieldMap.has(name))
                throw new Error(`Duplicate field "${name}" in struct initializer for "${typeName}"`);
            if (!declaredFields.has(name))
                throw new Error(`Unknown field "${name}" in struct initializer for "${typeName}"`);
            fieldMap.set(name, kids(field)[1]);
        }
        if (this.taggedStructTags.has(typeName))
            out.push(`i32.const ${this.taggedStructTags.get(typeName)}`);
        for (const field of fields) {
            if (field.name === HIDDEN_TAG_FIELD.name) continue;
            const value = fieldMap.get(field.name);
            if (!value)
                throw new Error(`Missing field "${field.name}" in struct initializer for "${typeName}"`);
            this.genExpr(value, this.wasmType(field.type), out);
        }
        out.push(`struct.new $${typeName}`);
    }

    genArrayInit(node, out) {
        const elemType = parseType(kids(node)[0]), method = kids(node)[1].text, args = this.args(node);
        const elemWasm = this.wasmType(elemType), key = this.elemTypeKey(elemType);
        this.requireArrayType(key);
        const arrayTypeName = this.arrayTypes.get(key);
        ARRAY_INIT_HANDLERS[method](this, args, elemType, elemWasm, arrayTypeName, out);
    }

};

export function installExpressionGeneratorMixin(Target = WatGen) {
    for (const name of Object.getOwnPropertyNames(ExpressionGeneratorMixin.prototype)) {
        if (name !== "constructor") Target.prototype[name] = ExpressionGeneratorMixin.prototype[name];
    }
}
