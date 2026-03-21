import { rootNode, childOfType, hasAnon } from './tree.js';

export function analyzeHostRequirements(treeOrNode) {
    const root = rootNode(treeOrNode);
    const importFns = [];
    const importVals = [];
    const modules = new Set();
    const capabilities = new Set();
    const platformHints = new Set();

    for (const item of root.namedChildren) {
        if (item.type !== 'import_decl') continue;

        const decl = parseHostImport(item);
        modules.add(decl.module);

        if (decl.module.startsWith('node:')) {
            capabilities.add('node-builtins');
            platformHints.add('node');
            platformHints.add('bun');
        }

        (decl.kind === 'function' ? importFns : importVals).push(decl);
    }

    const imports = [...importFns, ...importVals].map(({ kind, module, name }) => ({ kind, module, name }));
    const metadata = {
        imports,
        modules: [...modules],
        capabilities: [...capabilities],
        platformHints: [...platformHints],
        assumptions: {
            needsNothing: imports.length === 0,
            needsEsHost: modules.has('es'),
            needsNodeBuiltins: capabilities.has('node-builtins'),
        },
    };

    return { importFns, importVals, metadata };
}

function parseHostImport(node) {
    const [moduleNode, nameNode] = node.namedChildren;
    const module = moduleNode.text.slice(1, -1);
    const name = nameNode.text;

    if (hasAnon(node, '(')) {
        return {
            kind: 'function',
            module,
            name,
            paramCount: childOfType(node, 'import_param_list')?.namedChildren.length ?? 0,
            exceptionFallback: importExceptionFallback(childOfType(node, 'return_type')),
        };
    }

    return { kind: 'value', module, name };
}

function importExceptionFallback(returnTypeNode) {
    if (!returnTypeNode) return null;

    const components = [];
    for (let i = 0; i < returnTypeNode.children.length; i++) {
        const child = returnTypeNode.children[i];
        if (!child.isNamed) continue;

        const hasHash = returnTypeNode.children[i + 1]?.type === '#';
        const errType = hasHash && returnTypeNode.children[i + 2]?.isNamed ? returnTypeNode.children[i + 2] : null;
        const fallback = hasHash && errType
            ? exclusiveFallback([child, errType])
            : singleResultFallback(child);

        if (fallback === null) return null;
        components.push(fallback);
        if (hasHash) i += errType ? 2 : 1;
    }

    if (!components.length) return null;
    return components.length === 1 ? components[0] : `[${components.join(', ')}]`;
}

function singleResultFallback(typeNode) {
    return typeNode?.type === 'nullable_type' && typeAllowsNullPlaceholder(typeNode.namedChildren[0]) ? 'null' : null;
}

function exclusiveFallback(branches) {
    const fallbacks = branches.map(branch => typeAllowsNullPlaceholder(branch) ? 'null' : null);
    return fallbacks.every(Boolean) ? `[${fallbacks.join(', ')}]` : null;
}

function typeAllowsNullPlaceholder(typeNode) {
    if (!typeNode) return false;
    if (typeNode.type === 'paren_type') return typeAllowsNullPlaceholder(typeNode.namedChildren[0]);
    if (typeNode.type === 'nullable_type') return typeAllowsNullPlaceholder(typeNode.namedChildren[0]);
    return typeNode.type === 'ref_type' && typeNode.children[0]?.type !== 'array';
}
