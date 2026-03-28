import {
    childOfType,
    childrenOfType,
    findAnonBetween,
    hasAnon,
    namedChildren,
    stringLiteralValue,
} from '../../frontend/tree.js';
import { parseHostImportName } from '../../../document/index.js';
import data from '../../../../jsondata/watgen.data.json' with { type: 'json' };
import { protoImplName } from './protocol.js';

const kids = namedChildren;
const LITERAL_TEXT_INFO = data.literalTextInfo;

const PARSE_TYPE_HANDLERS = {
    nullable_type: (node) => ({ kind: 'nullable', inner: parseType(kids(node)[0]) }),
    scalar_type: (node) => ({ kind: 'scalar', name: node.text }),
    ref_type: (node) => node.children[0].type === 'array' ? { kind: 'array', elem: parseType(kids(node)[0]) } : { kind: 'named', name: node.children[0].text },
    func_type: () => { throw new Error('First-class function reference types are not supported yet'); },
    paren_type: (node) => parseType(kids(node)[0]),
};

export const parseStructDecl = (node) => ({
    kind: 'struct_decl',
    name: textOf(node, 'type_ident'),
    fields: parseFieldList(childOfType(node, 'field_list')),
    protocols: childrenOfType(childOfType(node, 'protocol_list'), 'type_ident').map((child) => child.text),
    rec: hasAnon(node, 'rec'),
    tagged: hasAnon(node, 'tag'),
});

export const parseProtoDecl = (node) => {
    const typeParams = childrenOfType(childOfType(node, 'module_type_param_list'), 'type_ident').map((child) => child.text);
    const typeParam = typeParams[0] ?? null;
    const memberList = childOfType(node, 'proto_member_list');
    return {
        kind: 'proto_decl',
        name: textOf(node, 'type_ident'),
        typeParam,
        typeParams,
        methods: memberList
            ? childrenOfType(memberList, 'proto_member')
                .map((member) => kids(member)[0])
                .filter((child) => ['proto_method', 'proto_getter', 'proto_setter'].includes(child?.type))
                .map((child) => child.type === 'proto_getter'
                    ? parseProtoGetter(child, typeParam)
                    : child.type === 'proto_setter'
                        ? parseProtoSetter(child, typeParam)
                        : parseProtoMethod(child))
            : [],
    };
};

export const parseTypeDecl = (node) => {
    const name = textOf(node, 'type_ident');
    const tagged = hasAnon(node, 'tag');
    const protocols = childrenOfType(childOfType(node, 'protocol_list'), 'type_ident').map((child) => child.text);
    return {
        kind: 'type_decl',
        name,
        tagged,
        protocols,
        variants: parseVariantList(childOfType(node, 'variant_list')).map((variant) => ({ ...variant, parentTypeName: name })),
        rec: true,
    };
};

export const parseFnItem = (node, exported = false) => {
    const assocNode = childOfType(node, 'associated_fn_name');
    const params = parseParamList(childOfType(node, 'param_list'));
    const ownerNode = assocNode ? kids(assocNode)[0] : null;
    const memberNode = assocNode ? kids(assocNode)[1] : null;
    const selfType = params[0]?.type ?? null;
    const selfTypeName = selfType?.kind === 'named' ? selfType.name : null;
    const name = assocNode
        ? protoImplName(ownerNode.text, memberNode.text, selfTypeName ?? ownerNode.text)
        : textOf(node, 'identifier');
    return {
        node,
        name,
        params,
        returnType: parseReturnType(childOfType(node, 'return_type')),
        body: childOfType(node, 'block'),
        exported,
        exportName: exported
            ? assocNode
                ? `${ownerNode.text}.${memberNode.text}`
                : textOf(node, 'identifier')
            : null,
        protocolOwner: ownerNode?.text ?? null,
        protocolMember: memberNode?.text ?? null,
        selfTypeName,
    };
};

export const parseImportDecl = (node) => {
    const [moduleNode, nameNode, typeNode] = kids(node), module = moduleNode.text.slice(1, -1), name = nameNode.text;
    const { hostName } = parseHostImportName(name);
    return hasAnon(node, '(')
        ? { kind: 'import_fn', module, name, hostName, params: parseImportParamList(childOfType(node, 'import_param_list')), returnType: parseReturnType(childOfType(node, 'return_type')) }
        : { kind: 'import_val', module, name, hostName, type: parseType(typeNode) };
};

export const parseJsgenDecl = (node, index) => {
    const returnType = parseReturnType(childOfType(node, 'return_type'));
    return returnType
        ? {
            kind: 'import_fn',
            module: '',
            name: textOf(node, 'identifier'),
            hostName: String(index),
            jsSource: childOfType(node, 'jsgen_lit')?.text.slice(1, -1) ?? '',
            params: parseImportParamList(childOfType(node, 'import_param_list')),
            returnType,
        }
        : {
            kind: 'import_val',
            module: '',
            name: textOf(node, 'identifier'),
            hostName: String(index),
            jsSource: childOfType(node, 'jsgen_lit')?.text.slice(1, -1) ?? '',
            type: parseType(kids(node).at(-1)),
        };
};

export const parsePipeTarget = (node) => {
    const argsNode = childOfType(node, 'pipe_args');
    const callee = kids(node).filter((child) => child.type === 'identifier').map((child) => child.text).join('.');
    return argsNode ? { kind: 'pipe_call', callee, args: parsePipeArgs(argsNode) } : { kind: 'pipe_ident', name: callee };
};
export const pipeCallee = (target) => target.kind === 'pipe_ident' ? target.name : target.callee;
export const pipeArgValues = (target) => target.args.filter((arg) => arg.kind === 'arg').map((arg) => arg.value);
export const namespaceInfo = (node) => ({ ns: node.children[0].text, method: childOfType(node, 'identifier').text });
export const parseForSources = (node) => mapType(node, 'for_source', parseForSource);
export const parseCapture = (node) => mapType(node, 'identifier', (child) => child.text);
export const parsePromoteCapture = (node) => ({ name: childOfType(node, 'identifier').text });
export const parseMatchArm = (node) => {
    const named = kids(node), [first] = named;
    return { pattern: named.length === 2 ? first : null, expr: named.at(-1) };
};
export const parseAltArm = (node) => {
    const named = kids(node);
    const typeNode = named.find((child) => child.type === 'type_ident') ?? null;
    const identNode = named[0]?.type === 'identifier' ? named[0] : null;
    return { pattern: identNode?.text ?? '_', guard: typeNode?.text ?? null, expr: named.at(-1) };
};
export const parseBindTargets = (node) => childrenOfType(node, 'bind_target').map((target) => ({ name: kids(target)[0].text, type: parseType(kids(target)[1]) }));

export function parseType(node) {
    return node ? PARSE_TYPE_HANDLERS[node.type](node) : null;
}

export function parseReturnType(node) {
    if (!node)
        return null;
    if (childOfType(node, 'void_type'))
        return null;
    const components = [];
    for (let i = 0; i < node.children.length; i += 1) {
        const child = node.children[i];
        if (!child.isNamed || child.type === 'void_type')
            continue;
        const ok = parseType(child);
        const hash = node.children[i + 1]?.type === '#';
        const err = hash && node.children[i + 2]?.isNamed ? parseType(node.children[i + 2]) : null;
        components.push(hash && err ? { kind: 'exclusive', ok, err } : ok);
        if (hash)
            i += err ? 2 : 1;
    }
    return !components.length ? null : components.length === 1 ? components[0] : { kind: 'multi_return', components };
}

export function literalInfo(node) {
    const child = kids(node)[0];
    const string = stringLiteralValue(node);
    if (string !== null)
        return { kind: 'string', value: string };
    if (child?.type === 'int_lit')
        return { kind: 'int', value: parseIntLit(child.text) };
    if (child?.type === 'float_lit')
        return { kind: 'float', value: parseFloat(child.text) };
    return LITERAL_TEXT_INFO[node.text];
}

export const parseIntLit = (text) => {
    const value = BigInt(text);
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
        ? Number(value)
        : value;
};

export const flattenTuple = (node, out = []) => {
    if (node.type === 'tuple_expr') {
        for (const child of kids(node))
            flattenTuple(child, out);
        return out;
    }
    out.push(node);
    return out;
};

const parseFieldList = (node) => mapType(node, 'field', parseField);
const parseField = (node) => {
    const [name, type] = kids(node);
    return { kind: 'field', mut: hasAnon(node, 'mut'), name: name.text, type: parseType(type) };
};
const parseProtoMethod = (node) => ({
    kind: 'proto_method',
    name: textOf(node, 'identifier'),
    params: kids(childOfType(node, 'type_list')).map(parseType),
    returnType: parseReturnType(childOfType(node, 'return_type')),
    getter: false,
    setter: false,
});
const parseProtoGetter = (node, typeParam) => ({
    kind: 'proto_method',
    name: textOf(node, 'identifier'),
    params: typeParam ? [{ kind: 'named', name: typeParam }] : [],
    returnType: parseType(kids(node).at(-1)),
    getter: true,
    setter: false,
});
const parseProtoSetter = (node, typeParam) => ({
    kind: 'proto_method',
    name: textOf(node, 'identifier'),
    params: [
        ...(typeParam ? [{ kind: 'named', name: typeParam }] : []),
        parseType(kids(node).at(-1)),
    ],
    returnType: null,
    getter: false,
    setter: true,
});
const parseVariantList = (node) => mapType(node, 'variant', parseVariant);
const parseVariant = (node) => ({ kind: 'variant', name: textOf(node, 'type_ident'), fields: parseFieldList(childOfType(node, 'field_list')) });
const parseParamList = (node) => mapType(node, 'param', parseParam);
const parseParam = (node) => {
    const [name, type] = kids(node);
    return { kind: 'param', name: name.text, type: parseType(type) };
};
const parseImportParamList = (node) => kids(node).map((child) => child.type === 'param' ? parseParam(child) : { kind: 'anon_param', type: parseType(child) });
const parsePipeArgs = (node) => namedChildren(node)
    .flatMap((child) => child.type === 'pipe_args_with_placeholder' || child.type === 'pipe_args_no_placeholder' ? namedChildren(child) : [child])
    .filter((child) => child.type === 'pipe_arg' || child.type === 'pipe_arg_placeholder')
    .map((arg) => arg.type === 'pipe_arg_placeholder' ? { kind: 'placeholder' } : { kind: 'arg', value: kids(arg)[0] });
const parseForSource = (node) => {
    const [start, end] = kids(node);
    return { kind: 'range', start, end, inclusive: findAnonBetween(node, start, end) === '...' };
};
const mapType = (node, type, parse) => childrenOfType(node, type).map(parse);
const textOf = (node, type) => childOfType(node, type).text;
