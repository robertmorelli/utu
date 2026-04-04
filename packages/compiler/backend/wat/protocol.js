import data from './watgen.data.json' with { type: 'json' };

const I32 = data.i32Type;

function snakeCase(value) {
    const normalized = String(value)
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
    return normalized || 'x';
}

function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0).toString(36);
}

export const TAGGED_ROOT_TYPE = '__utu_tagged';
export const HIDDEN_TAG_FIELD = Object.freeze({ kind: 'field', mut: true, name: '__tag', type: I32 });
export const EQREF_TYPE = Object.freeze({ kind: 'named', name: 'eqref' });

export const protocolMethodKey = (protocol, member) => `${protocol}.${member}`;
export const protocolImplKey = (protocol, member, selfType) => `${protocol}.${member}:${selfType}`;
export const protoFuncTypeName = (protocol, member) => `__utu_proto_sig_${snakeCase(protocol)}_${snakeCase(member)}`;
export const protoDispatchName = (protocol, member, selfType) => `__utu_proto_dispatch_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
export const protoImplName = (protocol, member, selfType) => `__utu_proto_impl_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
export const protoThunkName = (protocol, member, selfType) => `__utu_proto_thunk_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
export const protoDefaultTypeName = (protocol) => `__utu_proto_default_${snakeCase(protocol)}`;
export const protoTrapName = (protocol, member) => `__utu_proto_trap_${snakeCase(protocol)}_${snakeCase(member)}`;
export const protoTableName = (protocol, member) => `__utu_proto_table_${snakeCase(protocol)}_${snakeCase(member)}`;
export const protoElemName = (protocol, member) => `__utu_proto_elem_${snakeCase(protocol)}_${snakeCase(member)}`;
export const protocolSetterKey = (protocol, member) => `${protocol}.set.${member}`;
export const protocolSetterImplKey = (protocol, member, selfType) => `${protocol}.set.${member}:${selfType}`;
export const protoSetterFuncTypeName = (protocol, member) => `__utu_proto_set_sig_${snakeCase(protocol)}_${snakeCase(member)}`;
export const protoSetterDispatchName = (protocol, member, selfType) => `__utu_proto_set_dispatch_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
export const protoSetterThunkName = (protocol, member, selfType) => `__utu_proto_set_thunk_${snakeCase(protocol)}_${snakeCase(member)}_${hashText(selfType)}`;
export const protoSetterTrapName = (protocol, member) => `__utu_proto_set_trap_${snakeCase(protocol)}_${snakeCase(member)}`;
export const protoSetterTableName = (protocol, member) => `__utu_proto_set_table_${snakeCase(protocol)}_${snakeCase(member)}`;
export const protoSetterElemName = (protocol, member) => `__utu_proto_set_elem_${snakeCase(protocol)}_${snakeCase(member)}`;

export function typeUsesNamed(type, name) {
    if (!type)
        return false;
    switch (type.kind) {
        case 'named':
            return type.name === name;
        case 'nullable':
            return typeUsesNamed(type.inner, name);
        case 'array':
            return typeUsesNamed(type.elem, name);
        case 'exclusive':
            return typeUsesNamed(type.ok, name) || typeUsesNamed(type.err, name);
        case 'multi_return':
            return type.components.some((component) => typeUsesNamed(component, name));
        case 'func_type':
            return type.params.some((param) => typeUsesNamed(param, name)) || typeUsesNamed(type.returnType, name);
        default:
            return false;
    }
}

export function typesEqual(left, right) {
    if (left === right)
        return true;
    if (!left || !right)
        return !left && !right;
    if (left.kind !== right.kind)
        return false;
    switch (left.kind) {
        case 'scalar':
        case 'named':
            return left.name === right.name;
        case 'nullable':
            return typesEqual(left.inner, right.inner);
        case 'array':
            return typesEqual(left.elem, right.elem);
        case 'exclusive':
            return typesEqual(left.ok, right.ok) && typesEqual(left.err, right.err);
        case 'multi_return':
            return left.components.length === right.components.length
                && left.components.every((component, index) => typesEqual(component, right.components[index]));
        case 'func_type':
            return left.params.length === right.params.length
                && left.params.every((param, index) => typesEqual(param, right.params[index]))
                && typesEqual(left.returnType, right.returnType);
        default:
            return false;
    }
}

export function substituteProtocolType(type, typeParamName, selfTypeName) {
    if (!type)
        return null;
    switch (type.kind) {
        case 'named':
            return type.name === typeParamName ? { kind: 'named', name: selfTypeName } : type;
        case 'nullable':
            return { ...type, inner: substituteProtocolType(type.inner, typeParamName, selfTypeName) };
        case 'array':
            return { ...type, elem: substituteProtocolType(type.elem, typeParamName, selfTypeName) };
        case 'exclusive':
            return {
                ...type,
                ok: substituteProtocolType(type.ok, typeParamName, selfTypeName),
                err: substituteProtocolType(type.err, typeParamName, selfTypeName),
            };
        case 'multi_return':
            return {
                ...type,
                components: type.components.map((component) => substituteProtocolType(component, typeParamName, selfTypeName)),
            };
        case 'func_type':
            return {
                ...type,
                params: type.params.map((param) => substituteProtocolType(param, typeParamName, selfTypeName)),
                returnType: substituteProtocolType(type.returnType, typeParamName, selfTypeName),
            };
        default:
            return type;
    }
}
