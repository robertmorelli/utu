import * as shared from "./shared.js";

const {
    WatGen,
    kids,
    childOfType,
    childrenOfType,
    walk,
    walkBlock,
    stringLiteralValue,
    hasAnon,
    parseStructDecl,
    parseProtoDecl,
    parseTypeDecl,
    parseFnItem,
    parseType,
    parsePipeTarget,
    HIDDEN_TAG_FIELD,
    TAGGED_ROOT_TYPE,
    EQREF_TYPE,
    TOP_LEVEL_COLLECT_HANDLERS,
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
    pipeCallee,
    substituteProtocolType,
    typeUsesNamed,
    typesEqual,
} = shared;

const CollectionMixin = class {
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

    collectLibraryDecl(node) {
        for (const item of kids(node)) {
            if (item.type === 'fn_decl') {
                const fn = parseFnItem(item, this.shouldExportLibraryFunction(item));
                this.fnItems.push(fn);
                this.callables.set(fn.name, fn);
                continue;
            }
            const collect = TOP_LEVEL_COLLECT_HANDLERS[item.type];
            if (collect) collect(this, item);
            else throw new Error(`Unknown library item: ${item.type}`);
        }
    }

    shouldExportLibraryFunction(node) {
        const assocNode = childOfType(node, 'associated_fn_name');
        const exportName = assocNode
            ? (() => {
                const [ownerNode, memberNode] = kids(assocNode);
                return ownerNode && memberNode ? `${ownerNode.text}.${memberNode.text}` : null;
            })()
            : childOfType(node, 'identifier')?.text ?? null;
        return this.mode === 'normal'
            && this.compilePlan.exports.some((entry) => entry.exportName === exportName);
    }

    analyzeProtocols() {
        this.assignTagIds();

        for (const decl of this.protoDecls) {
            this.validateProtocolDecl(decl);
            for (const method of decl.methods) {
                const entry = {
                    ...method,
                    protocol: decl.name,
                    typeParam: decl.typeParam,
                };
                if (method.setter) this.protocolSetterMap.set(protocolSetterKey(decl.name, method.name), entry);
                else this.protocolMethodMap.set(protocolMethodKey(decl.name, method.name), entry);
            }
        }

        for (const fn of this.fnItems) {
            if (!fn.protocolOwner) continue;
            this.registerProtocolImpl(fn);
        }

        this.synthesizeProtocolGetterImpls();
        this.validateProtocolImplementers();

        const maxTag = Math.max(-1, ...this.taggedStructTags.values());
        const sliceSize = Math.max(0, maxTag + 1);
        const slicesByKey = new Map([...this.protocolMethodMap.entries()].map(([key, method]) => [key, {
            protocol: method.protocol,
            member: method.name,
            funcTypeName: protoFuncTypeName(method.protocol, method.name),
            trapName: protoTrapName(method.protocol, method.name),
            tableName: protoTableName(method.protocol, method.name),
            elemName: protoElemName(method.protocol, method.name),
            dispatchParams: this.protocolDispatchParams(method),
            returnType: method.returnType,
            size: sliceSize,
            entries: Array.from({ length: sliceSize }, () => protoTrapName(method.protocol, method.name)),
        }]));
        this.protocolSlices.push(...slicesByKey.values());

        for (const impl of this.protocolImplMap.values()) {
            const key = protocolMethodKey(impl.protocol, impl.member);
            const method = this.protocolMethodMap.get(key);
            const helperParams = method.params.map((type, index) => ({
                kind: 'param',
                name: index === 0 ? 'self' : `arg${index}`,
                type: substituteProtocolType(type, method.typeParam, impl.selfTypeName),
            }));
            const helperReturnType = substituteProtocolType(method.returnType, method.typeParam, impl.selfTypeName);
            const slice = slicesByKey.get(key);

            const thunk = {
                name: protoThunkName(impl.protocol, impl.member, impl.selfTypeName),
                funcTypeName: slice.funcTypeName,
                params: slice.dispatchParams,
                returnType: slice.returnType,
                selfTypeName: impl.selfTypeName,
                impl,
            };
            this.protocolThunks.push(thunk);
            slice.entries[impl.tag] = thunk.name;

            const helper = {
                name: protoDispatchName(impl.protocol, impl.member, impl.selfTypeName),
                selfTypeName: impl.selfTypeName,
                tagTypeName: this.variantParents.get(impl.selfTypeName) ?? impl.selfTypeName,
                params: helperParams,
                returnType: helperReturnType,
                funcTypeName: slice.funcTypeName,
                tableName: slice.tableName,
            };
            this.protocolHelpers.push(helper);
            this.protocolHelpersByTypeMember.set(`${impl.selfTypeName}.${impl.member}`, helper.name);
            this.callables.set(helper.name, helper);
        }

        const setterSlicesByKey = new Map([...this.protocolSetterMap.entries()].map(([key, method]) => [key, {
            protocol: method.protocol,
            member: method.name,
            funcTypeName: protoSetterFuncTypeName(method.protocol, method.name),
            trapName: protoSetterTrapName(method.protocol, method.name),
            tableName: protoSetterTableName(method.protocol, method.name),
            elemName: protoSetterElemName(method.protocol, method.name),
            dispatchParams: this.protocolDispatchParams(method),
            returnType: null,
            size: sliceSize,
            entries: Array.from({ length: sliceSize }, () => protoSetterTrapName(method.protocol, method.name)),
        }]));
        this.protocolSetterSlices.push(...setterSlicesByKey.values());
        for (const impl of this.protocolSetterImplMap.values()) {
            const key = protocolSetterKey(impl.protocol, impl.member);
            const method = this.protocolSetterMap.get(key);
            const helperParams = method.params.map((type, index) => ({
                kind: 'param',
                name: index === 0 ? 'self' : `arg${index}`,
                type: substituteProtocolType(type, method.typeParam, impl.selfTypeName),
            }));
            const slice = setterSlicesByKey.get(key);

            const thunk = {
                name: protoSetterThunkName(impl.protocol, impl.member, impl.selfTypeName),
                funcTypeName: slice.funcTypeName,
                params: slice.dispatchParams,
                returnType: null,
                selfTypeName: impl.selfTypeName,
                impl,
            };
            this.protocolSetterThunks.push(thunk);
            slice.entries[impl.tag] = thunk.name;

            const helper = {
                name: protoSetterDispatchName(impl.protocol, impl.member, impl.selfTypeName),
                selfTypeName: impl.selfTypeName,
                tagTypeName: this.variantParents.get(impl.selfTypeName) ?? impl.selfTypeName,
                params: helperParams,
                returnType: null,
                funcTypeName: slice.funcTypeName,
                tableName: slice.tableName,
            };
            this.protocolSetterHelpers.push(helper);
            this.protocolSetterHelpersByTypeMember.set(`${impl.selfTypeName}.${impl.member}`, helper.name);
            this.callables.set(helper.name, helper);
        }

        for (const protoDecl of this.protoDecls) {
            for (const method of protoDecl.methods) {
                const helperParams = method.params.map((type, index) => ({
                    kind: 'param',
                    name: index === 0 ? 'self' : `arg${index}`,
                    type: substituteProtocolType(type, protoDecl.typeParam, protoDecl.name),
                }));
                if (method.setter) {
                    const helper = {
                        name: protoSetterDispatchName(protoDecl.name, method.name, protoDecl.name),
                        selfTypeName: protoDecl.name,
                        tagTypeName: TAGGED_ROOT_TYPE,
                        params: helperParams,
                        returnType: null,
                        funcTypeName: protoSetterFuncTypeName(protoDecl.name, method.name),
                        tableName: protoSetterTableName(protoDecl.name, method.name),
                    };
                    this.protocolSetterHelpers.push(helper);
                    this.protocolSetterHelpersByTypeMember.set(`${protoDecl.name}.${method.name}`, helper.name);
                    this.callables.set(helper.name, helper);
                    continue;
                }
                const helper = {
                    name: protoDispatchName(protoDecl.name, method.name, protoDecl.name),
                    selfTypeName: protoDecl.name,
                    tagTypeName: TAGGED_ROOT_TYPE,
                    params: helperParams,
                    returnType: substituteProtocolType(method.returnType, protoDecl.typeParam, protoDecl.name),
                    funcTypeName: protoFuncTypeName(protoDecl.name, method.name),
                    tableName: protoTableName(protoDecl.name, method.name),
                };
                this.protocolHelpers.push(helper);
                this.protocolHelpersByTypeMember.set(`${protoDecl.name}.${method.name}`, helper.name);
                this.callables.set(helper.name, helper);
            }
        }

        for (const typeDecl of this.typeDecls) {
            if (!typeDecl.tagged) continue;
            for (const protocol of typeDecl.protocols) {
                const protoDecl = this.protoDecls.find((decl) => decl.name === protocol);
                if (!protoDecl) continue;
                for (const method of protoDecl.methods) {
                    if (method.setter) {
                        const helperName = protoSetterDispatchName(protocol, method.name, typeDecl.name);
                        if (this.callables.has(helperName)) continue;
                        const helper = {
                            name: helperName,
                            selfTypeName: typeDecl.name,
                            tagTypeName: typeDecl.name,
                            params: method.params.map((type, index) => ({
                                kind: 'param',
                                name: index === 0 ? 'self' : `arg${index}`,
                                type: substituteProtocolType(type, protoDecl.typeParam, typeDecl.name),
                            })),
                            returnType: null,
                            funcTypeName: protoSetterFuncTypeName(protocol, method.name),
                            tableName: protoSetterTableName(protocol, method.name),
                        };
                        this.protocolSetterHelpers.push(helper);
                        this.protocolSetterHelpersByTypeMember.set(`${typeDecl.name}.${method.name}`, helper.name);
                        this.callables.set(helper.name, helper);
                        continue;
                    }
                    const helperName = protoDispatchName(protocol, method.name, typeDecl.name);
                    if (this.callables.has(helperName)) continue;
                    const helper = {
                        name: helperName,
                        selfTypeName: typeDecl.name,
                        tagTypeName: typeDecl.name,
                        params: method.params.map((type, index) => ({
                            kind: 'param',
                            name: index === 0 ? 'self' : `arg${index}`,
                            type: substituteProtocolType(type, protoDecl.typeParam, typeDecl.name),
                        })),
                        returnType: substituteProtocolType(method.returnType, protoDecl.typeParam, typeDecl.name),
                        funcTypeName: protoFuncTypeName(protocol, method.name),
                        tableName: protoTableName(protocol, method.name),
                    };
                    this.protocolHelpers.push(helper);
                    this.protocolHelpersByTypeMember.set(`${typeDecl.name}.${method.name}`, helper.name);
                    this.callables.set(helper.name, helper);
                }
            }
        }
    }

    assignTagIds() {
        let nextTag = 0;
        for (const decl of this.structDecls) {
            if (decl.protocols.length > 0 && !decl.tagged)
                throw new Error(`Struct "${decl.name}" must be declared with "tag struct" to implement protocols`);
            if (!decl.tagged) continue;
            for (const protocol of decl.protocols) {
                if (!this.taggedTypeProtocols.has(decl.name)) this.taggedTypeProtocols.set(decl.name, new Set());
                this.taggedTypeProtocols.get(decl.name).add(protocol);
            }
            if (decl.fields.some((field) => field.name === HIDDEN_TAG_FIELD.name))
                throw new Error(`Tagged struct "${decl.name}" cannot declare a field named "${HIDDEN_TAG_FIELD.name}"`);
            this.taggedStructTags.set(decl.name, nextTag++);
        }
        for (const decl of this.typeDecls) {
            if (decl.protocols.length > 0 && !decl.tagged)
                throw new Error(`Type "${decl.name}" must be declared with "tag type" to implement protocols`);
            if (!decl.tagged) continue;
            for (const protocol of decl.protocols) {
                if (!this.taggedTypeProtocols.has(decl.name)) this.taggedTypeProtocols.set(decl.name, new Set());
                this.taggedTypeProtocols.get(decl.name).add(protocol);
            }
            if (decl.variants.some((variant) => variant.fields.some((field) => field.name === HIDDEN_TAG_FIELD.name)))
                throw new Error(`Tagged type "${decl.name}" cannot declare a field named "${HIDDEN_TAG_FIELD.name}" on its variants`);
            for (const variant of decl.variants) {
                this.variantParents.set(variant.name, decl.name);
                this.taggedStructTags.set(variant.name, nextTag++);
            }
        }
        for (const decl of this.protoDecls) {
            this.taggedStructTags.set(protoDefaultTypeName(decl.name), nextTag++);
        }
    }

    validateProtocolDecl(decl) {
        if (decl.typeParams.length !== 1) throw new Error(`Protocol "${decl.name}" must declare exactly one type parameter in v1`);
        const seenReadable = new Set();
        const seenSetter = new Set();
        for (const method of decl.methods) {
            const seen = method.setter ? seenSetter : seenReadable;
            if (seen.has(method.name)) throw new Error(`Protocol "${decl.name}" declares "${method.name}" more than once`);
            seen.add(method.name);
            if (method.params.length === 0) throw new Error(`Protocol method "${decl.name}.${method.name}" must take the protocol type as its first parameter`);
            if (method.params[0]?.kind !== 'named' || method.params[0].name !== decl.typeParam)
                throw new Error(`Protocol method "${decl.name}.${method.name}" must use "${decl.typeParam}" as its first parameter`);
            const laterParams = method.params.slice(1);
            if (method.setter) {
                if (laterParams.length !== 1) throw new Error(`Protocol setter "${decl.name}.${method.name}" must take exactly one value parameter`);
                if (method.returnType) throw new Error(`Protocol setter "${decl.name}.${method.name}" must return void`);
            }
            if (laterParams.some((type) => typeUsesNamed(type, decl.typeParam)) || typeUsesNamed(method.returnType, decl.typeParam))
                throw new Error(`Protocol method "${decl.name}.${method.name}" may only use "${decl.typeParam}" as the first parameter in v1`);
        }
    }

    registerProtocolImpl(fn) {
        const method = this.protocolMethodMap.get(protocolMethodKey(fn.protocolOwner, fn.protocolMember));
        const setter = this.protocolSetterMap.get(protocolSetterKey(fn.protocolOwner, fn.protocolMember));
        if (!method && !setter) throw new Error(`Unknown protocol method "${fn.protocolOwner}.${fn.protocolMember}"`);
        if (method?.getter)
            throw new Error(`Protocol getter "${fn.protocolOwner}.${fn.protocolMember}" is field-backed and must not be implemented with "fun"`);
        if (setter)
            throw new Error(`Protocol setter "${fn.protocolOwner}.${fn.protocolMember}" is field-backed and must not be implemented with "fun"`);
        if (!fn.selfTypeName) throw new Error(`Protocol implementation "${fn.protocolOwner}.${fn.protocolMember}" must use a concrete named self type`);
        if (!this.taggedStructTags.has(fn.selfTypeName))
            throw new Error(`Type "${fn.selfTypeName}" must be declared with "tag struct" or belong to a "tag type" that implements protocol "${fn.protocolOwner}"`);
        const parentTypeName = this.variantParents.get(fn.selfTypeName) ?? null;
        if (parentTypeName && !this.taggedTypeProtocols.get(parentTypeName)?.has(fn.protocolOwner))
            throw new Error(`Variant "${fn.selfTypeName}" cannot implement protocol "${fn.protocolOwner}" because parent type "${parentTypeName}" does not declare it`);
        const structDecl = this.structDecls.find((decl) => decl.name === fn.selfTypeName) ?? null;
        if (structDecl && !structDecl.protocols.includes(fn.protocolOwner))
            throw new Error(`Struct "${fn.selfTypeName}" cannot implement protocol "${fn.protocolOwner}" without declaring ": ${fn.protocolOwner}"`);
        if (fn.exported) throw new Error(`Protocol implementation "${fn.protocolOwner}.${fn.protocolMember}" cannot be exported directly`);
        const expectedParams = method.params.map((type) => substituteProtocolType(type, method.typeParam, fn.selfTypeName));
        const expectedReturn = substituteProtocolType(method.returnType, method.typeParam, fn.selfTypeName);
        if (fn.params.length !== expectedParams.length)
            throw new Error(`Protocol implementation "${fn.protocolOwner}.${fn.protocolMember}" on "${fn.selfTypeName}" must have ${expectedParams.length} parameter(s)`);
        for (let index = 0; index < expectedParams.length; index += 1) {
            if (!typesEqual(fn.params[index]?.type, expectedParams[index]))
                throw new Error(`Protocol implementation "${fn.protocolOwner}.${fn.protocolMember}" on "${fn.selfTypeName}" does not match parameter ${index + 1}`);
        }
        if (!typesEqual(fn.returnType, expectedReturn))
            throw new Error(`Protocol implementation "${fn.protocolOwner}.${fn.protocolMember}" on "${fn.selfTypeName}" does not match the protocol return type`);

        const key = protocolImplKey(fn.protocolOwner, fn.protocolMember, fn.selfTypeName);
        if (this.protocolImplMap.has(key))
            throw new Error(`Duplicate protocol implementation for "${fn.protocolOwner}.${fn.protocolMember}" on "${fn.selfTypeName}"`);
        this.protocolImplMap.set(key, {
            protocol: fn.protocolOwner,
            member: fn.protocolMember,
            selfTypeName: fn.selfTypeName,
            fn,
            tag: this.taggedStructTags.get(fn.selfTypeName),
        });
        if (!this.protocolImplementersByProtocol.has(fn.protocolOwner)) this.protocolImplementersByProtocol.set(fn.protocolOwner, new Set());
        this.protocolImplementersByProtocol.get(fn.protocolOwner).add(fn.selfTypeName);
    }

    synthesizeProtocolGetterImpls() {
        for (const decl of this.protoDecls) {
            const implementers = this.declaredProtocolImplementers(decl.name);
            if (implementers.size > 0) this.protocolImplementersByProtocol.set(decl.name, implementers);

            for (const selfTypeName of implementers) {
                for (const method of decl.methods) {
                    if (method.getter) {
                        const key = protocolImplKey(decl.name, method.name, selfTypeName);
                        if (this.protocolImplMap.has(key)) continue;
                        const field = this.requireProtocolGetterField(decl.name, method, selfTypeName);
                        this.protocolImplMap.set(key, {
                            protocol: decl.name,
                            member: method.name,
                            selfTypeName,
                            tag: this.taggedStructTags.get(selfTypeName),
                            syntheticGetterField: field.name,
                        });
                        continue;
                    }
                    if (method.setter) {
                        const key = protocolSetterImplKey(decl.name, method.name, selfTypeName);
                        if (this.protocolSetterImplMap.has(key)) continue;
                        const field = this.requireProtocolSetterField(decl.name, method, selfTypeName);
                        this.protocolSetterImplMap.set(key, {
                            protocol: decl.name,
                            member: method.name,
                            selfTypeName,
                            tag: this.taggedStructTags.get(selfTypeName),
                            syntheticSetterField: field.name,
                        });
                    }
                }
            }
        }
    }

    declaredProtocolImplementers(protocol) {
        const implementers = new Set(this.protocolImplementersByProtocol.get(protocol) ?? []);
        for (const decl of this.structDecls) {
            if (decl.protocols.includes(protocol)) implementers.add(decl.name);
        }
        for (const decl of this.typeDecls) {
            if (!decl.protocols.includes(protocol)) continue;
            for (const variant of decl.variants) implementers.add(variant.name);
        }
        return implementers;
    }

    requireProtocolGetterField(protocol, method, selfTypeName) {
        const field = this.typeFields(selfTypeName)?.find((candidate) => candidate.name === method.name) ?? null;
        if (!field)
            throw new Error(`Type "${selfTypeName}" must declare field "${method.name}" to satisfy protocol getter "${protocol}.${method.name}"`);
        if (!typesEqual(field.type, method.returnType))
            throw new Error(`Protocol getter "${protocol}.${method.name}" requires field "${method.name}" on "${selfTypeName}" to have type "${this.typeText(method.returnType)}"`);
        return field;
    }

    requireProtocolSetterField(protocol, method, selfTypeName) {
        const field = this.typeFields(selfTypeName)?.find((candidate) => candidate.name === method.name) ?? null;
        if (!field)
            throw new Error(`Type "${selfTypeName}" must declare field "${method.name}" to satisfy protocol setter "${protocol}.${method.name}"`);
        if (!field.mut)
            throw new Error(`Protocol setter "${protocol}.${method.name}" requires field "${method.name}" on "${selfTypeName}" to be declared "mut"`);
        if (!typesEqual(field.type, method.params[1]))
            throw new Error(`Protocol setter "${protocol}.${method.name}" requires field "${method.name}" on "${selfTypeName}" to have type "${this.typeText(method.params[1])}"`);
        return field;
    }

    validateProtocolImplementers() {
        for (const structDecl of this.structDecls) {
            for (const protocol of structDecl.protocols) {
                const protoDecl = this.protoDecls.find((decl) => decl.name === protocol);
                if (!protoDecl) throw new Error(`Unknown protocol "${protocol}" on struct "${structDecl.name}"`);
                for (const method of protoDecl.methods) {
                    const covered = method.setter
                        ? this.protocolSetterImplMap.has(protocolSetterImplKey(protocol, method.name, structDecl.name))
                        : this.protocolImplMap.has(protocolImplKey(protocol, method.name, structDecl.name));
                    if (!covered)
                        throw new Error(`Struct "${structDecl.name}" does not fully implement protocol "${protocol}"; missing "${method.name}"`);
                }
            }
        }
        for (const decl of this.protoDecls) {
            const implementers = this.protocolImplementersByProtocol.get(decl.name);
            if (!implementers) continue;
            for (const selfTypeName of implementers) {
                if (this.variantParents.has(selfTypeName)) continue;
                for (const method of decl.methods) {
                    const covered = method.setter
                        ? this.protocolSetterImplMap.has(protocolSetterImplKey(decl.name, method.name, selfTypeName))
                        : this.protocolImplMap.has(protocolImplKey(decl.name, method.name, selfTypeName));
                    if (!covered)
                        throw new Error(`Type "${selfTypeName}" does not fully implement protocol "${decl.name}"; missing "${method.name}"`);
                }
            }
        }
        for (const typeDecl of this.typeDecls) {
            for (const protocol of typeDecl.protocols) {
                const protoDecl = this.protoDecls.find((decl) => decl.name === protocol);
                if (!protoDecl) throw new Error(`Unknown protocol "${protocol}" on type "${typeDecl.name}"`);
                for (const variant of typeDecl.variants) {
                    for (const method of protoDecl.methods) {
                        const covered = method.setter
                            ? this.protocolSetterImplMap.has(protocolSetterImplKey(protocol, method.name, variant.name))
                            : this.protocolImplMap.has(protocolImplKey(protocol, method.name, variant.name));
                        if (!covered)
                            throw new Error(`Variant "${variant.name}" does not fully implement protocol "${protocol}" required by type "${typeDecl.name}"; missing "${method.name}"`);
                    }
                }
            }
        }
    }

    protocolDispatchParams(method) {
        return [
            { kind: 'param', name: 'self', type: EQREF_TYPE },
            ...method.params.slice(1).map((type, index) => ({ kind: 'param', name: `arg${index + 1}`, type })),
        ];
    }

    scanAll() {
        for (const fn of this.fnItems) this.scanNode(fn.body);
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

    runtimeStructFields(decl) {
        return decl.tagged ? [HIDDEN_TAG_FIELD, ...decl.fields] : decl.fields;
    }

    runtimeTypeFields(typeName) {
        const decl = this.typeDeclMap.get(typeName);
        if (decl?.kind === 'struct_decl') return this.runtimeStructFields(decl);
        if (decl?.kind === 'type_decl') return decl.tagged ? [HIDDEN_TAG_FIELD] : [];
        const variant = this.variantDecls.get(typeName);
        if (!variant) return null;
        const parentTypeName = this.variantParents.get(typeName) ?? null;
        return this.typeDeclMap.get(parentTypeName)?.tagged ? [HIDDEN_TAG_FIELD, ...variant.fields] : variant.fields;
    }
};

export function installCollectionMixin(Target = WatGen) {
    for (const name of Object.getOwnPropertyNames(CollectionMixin.prototype)) {
        if (name !== "constructor") Target.prototype[name] = CollectionMixin.prototype[name];
    }
}
