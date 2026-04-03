import { findNamedChild, spanFromNode } from '../document/index.js';
import { inferCompletionExpressionType, normalizeTypeText, treePoint } from '../language-platform/core/completion-helpers.js';
import { resolveSymbol } from '../language-platform/core/document-index/build.js';
import { copyRange, rangeKey } from '../language-platform/core/types.js';
import { findModuleNameNode, sameNode } from './cross-file-shared.js';

export async function resolveCrossFileDefinition(session, document, position) {
    const result = await resolveCrossFileSymbol(session, document, position);
    return result ? { uri: result.uri, range: copyRange(result.range) } : undefined;
}

export async function resolveCrossFileSymbol(session, document, position) {
    const header = await session.analysisCache.getHeaderSnapshot(document);
    const bindingState = buildImportedBindingState(header);
    if (bindingState.visibleBindings.size === 0 && bindingState.openBindings.length === 0)
        return undefined;
    const documentState = await session.languageService.getCachedDocumentState(document);
    const point = treePoint(position.line, position.character);
    const anchor = documentState.tree.rootNode.namedDescendantForPosition(point, point);
    if (!anchor)
        return undefined;
    const targetCache = new Map();
    for (let node = anchor; node; node = node.parent) {
        const context = resolveDefinitionContext(node, anchor, bindingState, documentState.index);
        if (!context)
            continue;
        const result = await resolveDefinitionTarget(session, document, context, targetCache);
        if (result)
            return result;
    }
    return undefined;
}

export async function collectCrossFileReferences(session, document, targetIdentity) {
    const header = await session.analysisCache.getHeaderSnapshot(document);
    const bindingState = buildImportedBindingState(header);
    if (bindingState.visibleBindings.size === 0 && bindingState.openBindings.length === 0)
        return [];
    const documentState = await session.languageService.getCachedDocumentState(document);
    const targetCache = new Map();
    const references = [];
    const seen = new Set();
    await walkNamedNodes(documentState.tree.rootNode, async (node) => {
        for (const context of collectReferenceContexts(node, bindingState, documentState.index)) {
            const result = await resolveDefinitionTarget(session, document, context, targetCache);
            if (!matchesTargetIdentity(targetIdentity, result))
                continue;
            const location = { uri: document.uri, range: copyRange(spanFromNode(document, context.sourceNode).range) };
            const key = `${location.uri}:${rangeKey(location.range)}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            references.push(location);
        }
    });
    return references;
}

function buildImportedBindingState(header = {}) {
    const directBindings = new Map((header.fileImports ?? []).map((entry) => [entry.localName, entry]));
    const visibleBindings = new Map(directBindings);
    const openBindings = [];
    const pendingConstructs = [...(header.constructs ?? [])];
    let progress = true;
    while (pendingConstructs.length > 0 && progress) {
        progress = false;
        for (let index = 0; index < pendingConstructs.length; index += 1) {
            const construct = pendingConstructs[index];
            const binding = visibleBindings.get(construct.target);
            if (!binding)
                continue;
            progress = true;
            pendingConstructs.splice(index, 1);
            index -= 1;
            if (construct.alias)
                visibleBindings.set(construct.alias, binding);
            else
                openBindings.push(binding);
        }
    }
    return { visibleBindings, openBindings };
}

function resolveDefinitionContext(node, anchor, bindingState, index) {
    switch (node.type) {
        case 'file_import_decl':
            return resolveFileImportContext(node, anchor, bindingState);
        case 'construct_decl':
            return resolveConstructContext(node, anchor, bindingState);
        case 'type_member_expr':
            return resolveTypeMemberContext(node, anchor, bindingState);
        case 'qualified_type_ref':
            return resolveQualifiedTypeContext(node, anchor, bindingState);
        case 'field_expr':
            return resolveFieldContext(node, anchor, bindingState, index);
        default:
            break;
    }
    if (sameNode(node, anchor) && node.type === 'identifier')
        return resolveOpenValueContext(node, bindingState);
    if (sameNode(node, anchor) && node.type === 'type_ident')
        return { kind: 'open_type', typeName: node.text, sourceNode: node };
    return undefined;
}

function resolveFileImportContext(node, anchor, bindingState) {
    const binding = bindingFromImportNode(node, bindingState);
    if (!binding)
        return undefined;
    const sourceNode = findModuleNameNode(findNamedChild(node, 'imported_module_name'));
    const captureNode = findModuleNameNode(findNamedChild(node, 'captured_module_name'));
    if (containsNode(sourceNode, anchor) || containsNode(captureNode, anchor))
        return { kind: 'module', binding, sourceNode: containsNode(sourceNode, anchor) ? sourceNode : captureNode };
    return undefined;
}

function resolveConstructContext(node, anchor, bindingState) {
    const namedChildren = node.namedChildren ?? [];
    const aliasNode = namedChildren[0]?.type === 'identifier' && namedChildren.length > 1 ? namedChildren[0] : undefined;
    const moduleNode = aliasNode ? namedChildren[1] : namedChildren[0];
    const moduleNameNode = findModuleNameNode(moduleNode);
    if (!containsNode(moduleNameNode, anchor))
        return undefined;
    const binding = bindingState.visibleBindings.get(moduleNameNode?.text ?? '');
    return binding ? { kind: 'module', binding, sourceNode: moduleNameNode } : undefined;
}

function resolveQualifiedTypeContext(node, anchor, bindingState) {
    const namespaceNode = findModuleNameNode(findNamedChild(node, 'module_ref'));
    const typeNode = findNamedChild(node, 'type_ident');
    const binding = bindingState.visibleBindings.get(namespaceNode?.text ?? '');
    if (!binding)
        return undefined;
    if (containsNode(namespaceNode, anchor))
        return { kind: 'module', binding, sourceNode: namespaceNode };
    if (containsNode(typeNode, anchor))
        return { kind: 'type', binding, typeName: typeNode.text, sourceNode: typeNode };
    return undefined;
}

function resolveTypeMemberContext(node, anchor, bindingState) {
    const [ownerNode, memberNode] = node.namedChildren ?? [];
    if (containsNode(memberNode, anchor))
        return resolveImportedMemberContext(ownerNode, memberNode, bindingState);
    if (containsNode(ownerNode, anchor)) {
        if (ownerNode?.type === 'qualified_type_ref')
            return resolveQualifiedTypeContext(ownerNode, anchor, bindingState);
        if (ownerNode?.type === 'type_ident')
            return { kind: 'open_type', typeName: ownerNode.text, sourceNode: ownerNode };
    }
    return undefined;
}

function resolveFieldContext(node, anchor, bindingState, index) {
    const [baseNode, memberNode] = node.namedChildren ?? [];
    const namespaceBinding = baseNode?.type === 'identifier' ? bindingState.visibleBindings.get(baseNode.text) : undefined;
    if (namespaceBinding) {
        if (containsNode(baseNode, anchor))
            return { kind: 'module', binding: namespaceBinding, sourceNode: baseNode };
        if (containsNode(memberNode, anchor))
            return { kind: 'member', binding: namespaceBinding, memberName: memberNode.text, ownerTypeName: null, sourceNode: memberNode };
    }
    const typedMemberContext = memberNode && containsNode(memberNode, anchor)
        ? resolveTypedMemberContext(baseNode, memberNode, bindingState, index)
        : undefined;
    if (typedMemberContext)
        return typedMemberContext;
    return undefined;
}

function resolveImportedMemberContext(ownerNode, memberNode, bindingState) {
    if (ownerNode?.type === 'qualified_type_ref') {
        const namespaceNode = findModuleNameNode(findNamedChild(ownerNode, 'module_ref'));
        const typeNode = findNamedChild(ownerNode, 'type_ident');
        const binding = bindingState.visibleBindings.get(namespaceNode?.text ?? '');
        return binding && typeNode
            ? { kind: 'member', binding, memberName: memberNode.text, ownerTypeName: typeNode.text, sourceNode: memberNode }
            : undefined;
    }
    if (ownerNode?.type === 'type_ident')
        return { kind: 'open_member', typeName: ownerNode.text, memberName: memberNode.text, sourceNode: memberNode };
    return undefined;
}

function resolveOpenValueContext(node, bindingState) {
    return bindingState.openBindings.length > 0
        ? { kind: 'open_value', valueName: node.text, sourceNode: node }
        : undefined;
}

async function resolveDefinitionTarget(session, document, context, targetCache) {
    switch (context.kind) {
        case 'module':
            return finalizeCrossFileResult(document, context, resolveImportedModuleLocation(await loadImportedTarget(session, document.uri, context.binding, targetCache), context.binding.sourceModuleName));
        case 'type':
            return finalizeCrossFileResult(document, context, findTargetTypeLocation(await loadImportedTarget(session, document.uri, context.binding, targetCache), context.binding.sourceModuleName, context.typeName));
        case 'member':
            return finalizeCrossFileResult(document, context, findTargetMemberLocation(await loadImportedTarget(session, document.uri, context.binding, targetCache), context.binding.sourceModuleName, context.memberName, context.ownerTypeName));
        case 'open_value':
            return resolveOpenImportedLocation(session, document, context, targetCache, findTargetMemberLocation);
        case 'open_type':
            return resolveOpenImportedLocation(session, document, context, targetCache, findTargetTypeLocation);
        case 'open_member':
            return resolveOpenImportedLocation(session, document, context, targetCache, findTargetMemberLocation);
        default:
            return undefined;
    }
}

async function resolveOpenImportedLocation(session, document, context, targetCache, resolveLocation) {
    const header = await session.analysisCache.getHeaderSnapshot(document);
    const { openBindings } = buildImportedBindingState(header);
    const matches = [];
    for (const binding of openBindings) {
        const target = await loadImportedTarget(session, document.uri, binding, targetCache);
        const result = resolveOpenImportedTarget(target, binding.sourceModuleName, context, resolveLocation);
        if (result)
            matches.push(finalizeCrossFileResult(document, { ...context, binding }, result));
    }
    return matches.length === 1 ? matches[0] : undefined;
}

async function loadImportedTarget(session, fromUri, binding, targetCache) {
    const targetUri = resolveImportUri(fromUri, binding.specifier);
    if (!targetUri)
        return null;
    if (!targetCache.has(targetUri)) {
        targetCache.set(targetUri, loadImportedTargetNow(session, targetUri));
    }
    return targetCache.get(targetUri);
}

async function loadImportedTargetNow(session, targetUri) {
    const targetDocument = await session.documents.resolve(targetUri);
    if (!targetDocument)
        return null;
    const [body, documentState] = await Promise.all([
        session.analysisCache.getBodySnapshot(targetDocument, { mode: 'editor' }),
        session.languageService.getCachedDocumentState(targetDocument),
    ]);
    return {
        document: targetDocument,
        index: body?.documentIndex ?? null,
        rootNode: documentState?.tree?.rootNode ?? null,
    };
}

function resolveImportedModuleLocation(target, moduleName) {
    const moduleNameNode = findModuleDeclarationNameNode(target?.rootNode, moduleName);
    if (!moduleNameNode || !target?.document)
        return undefined;
    return {
        kind: 'module',
        moduleName,
        uri: target.document.uri,
        range: spanFromNode(target.document, moduleNameNode).range,
    };
}

function findTargetTypeLocation(target, moduleName, typeName) {
    const symbol = target?.index?.symbols.find((candidate) => candidate.containerName === moduleName
        && ['struct', 'sumType', 'variant'].includes(candidate.kind)
        && candidate.name === typeName);
    return symbol ? { kind: 'symbol', symbol, uri: symbol.uri, range: copyRange(symbol.range) } : undefined;
}

function findTargetMemberLocation(target, moduleName, memberName, ownerTypeName = null) {
    const directName = ownerTypeName ? `${ownerTypeName}.${memberName}` : memberName;
    const symbol = target?.index?.symbols.find((candidate) => candidate.containerName === moduleName && candidate.name === directName);
    return symbol ? { kind: 'symbol', symbol, uri: symbol.uri, range: copyRange(symbol.range) } : undefined;
}

function findModuleDeclarationNameNode(rootNode, moduleName) {
    for (const item of rootNode?.namedChildren ?? []) {
        if (item.type !== 'module_decl')
            continue;
        const moduleNameNode = findModuleNameNode(item);
        if (moduleNameNode?.text === moduleName)
            return moduleNameNode;
    }
    return undefined;
}

function bindingFromImportNode(node, bindingState) {
    const captureNode = findModuleNameNode(findNamedChild(node, 'captured_module_name'));
    const sourceNode = findModuleNameNode(findNamedChild(node, 'imported_module_name'));
    return bindingState.visibleBindings.get(captureNode?.text ?? '') ?? bindingState.visibleBindings.get(sourceNode?.text ?? '');
}

function collectReferenceContexts(node, bindingState, index) {
    switch (node.type) {
        case 'file_import_decl':
            return collectFileImportReferenceContexts(node, bindingState);
        case 'construct_decl':
            return collectConstructReferenceContexts(node, bindingState);
        case 'qualified_type_ref':
            return collectQualifiedTypeReferenceContexts(node, bindingState);
        case 'type_member_expr':
            return collectTypeMemberReferenceContexts(node, bindingState);
        case 'field_expr':
            return collectFieldReferenceContexts(node, bindingState, index);
        case 'identifier':
            return collectOpenValueReferenceContexts(node, bindingState, index);
        case 'type_ident':
            return isStandaloneOpenTypeNode(node) ? [{ kind: 'open_type', typeName: node.text, sourceNode: node }] : [];
        default:
            return [];
    }
}

function collectFileImportReferenceContexts(node, bindingState) {
    const binding = bindingFromImportNode(node, bindingState);
    if (!binding)
        return [];
    const sourceNode = findModuleNameNode(findNamedChild(node, 'imported_module_name'));
    const captureNode = findModuleNameNode(findNamedChild(node, 'captured_module_name'));
    return [sourceNode, captureNode]
        .filter(Boolean)
        .map((sourceNode) => ({ kind: 'module', binding, sourceNode }));
}

function collectConstructReferenceContexts(node, bindingState) {
    const namedChildren = node.namedChildren ?? [];
    const aliasNode = namedChildren[0]?.type === 'identifier' && namedChildren.length > 1 ? namedChildren[0] : undefined;
    const moduleNode = aliasNode ? namedChildren[1] : namedChildren[0];
    const moduleNameNode = findModuleNameNode(moduleNode);
    const binding = bindingState.visibleBindings.get(moduleNameNode?.text ?? '');
    return binding && moduleNameNode ? [{ kind: 'module', binding, sourceNode: moduleNameNode }] : [];
}

function collectQualifiedTypeReferenceContexts(node, bindingState) {
    const namespaceNode = findModuleNameNode(findNamedChild(node, 'module_ref'));
    const typeNode = findNamedChild(node, 'type_ident');
    const binding = bindingState.visibleBindings.get(namespaceNode?.text ?? '');
    if (!binding)
        return [];
    const contexts = [];
    if (namespaceNode)
        contexts.push({ kind: 'module', binding, sourceNode: namespaceNode });
    if (typeNode)
        contexts.push({ kind: 'type', binding, typeName: typeNode.text, sourceNode: typeNode });
    return contexts;
}

function collectTypeMemberReferenceContexts(node, bindingState) {
    const [ownerNode, memberNode] = node.namedChildren ?? [];
    if (!memberNode)
        return [];
    const context = resolveImportedMemberContext(ownerNode, memberNode, bindingState);
    return context ? [context] : [];
}

function collectFieldReferenceContexts(node, bindingState, index) {
    const [baseNode, memberNode] = node.namedChildren ?? [];
    const namespaceBinding = baseNode?.type === 'identifier' ? bindingState.visibleBindings.get(baseNode.text) : undefined;
    const contexts = [];
    if (namespaceBinding && baseNode) {
        contexts.push({ kind: 'module', binding: namespaceBinding, sourceNode: baseNode });
        if (memberNode)
            contexts.push({ kind: 'member', binding: namespaceBinding, memberName: memberNode.text, ownerTypeName: null, sourceNode: memberNode });
    }
    const typedMemberContext = memberNode ? resolveTypedMemberContext(baseNode, memberNode, bindingState, index) : undefined;
    if (typedMemberContext)
        contexts.push(typedMemberContext);
    return contexts;
}

function resolveTypedMemberContext(baseNode, memberNode, bindingState, index) {
    const baseType = normalizeTypeText(inferCompletionExpressionType(baseNode, index) ?? '');
    if (!baseType)
        return undefined;
    const lastDot = baseType.lastIndexOf('.');
    if (lastDot >= 0) {
        const ownerTypeName = baseType.slice(lastDot + 1);
        const namespaceText = baseType.slice(0, lastDot);
        const binding = resolveBindingForTypeNamespace(namespaceText, bindingState);
        return binding && ownerTypeName
            ? { kind: 'member', binding, memberName: memberNode.text, ownerTypeName, sourceNode: memberNode }
            : undefined;
    }
    return bindingState.openBindings.length > 0
        ? { kind: 'open_member', typeName: baseType, memberName: memberNode.text, sourceNode: memberNode }
        : undefined;
}

function resolveBindingForTypeNamespace(typeNamespace, bindingState) {
    const normalized = normalizeTypeText(typeNamespace);
    if (!normalized)
        return undefined;
    const bracketIndex = normalized.indexOf('[');
    const bindingName = bracketIndex >= 0 ? normalized.slice(0, bracketIndex) : normalized;
    return bindingState.visibleBindings.get(bindingName);
}

function collectOpenValueReferenceContexts(node, bindingState, index) {
    if (bindingState.openBindings.length === 0 || !isStandaloneOpenValueNode(node))
        return [];
    if (resolveSymbol(index, nodePosition(node)))
        return [];
    return [{ kind: 'open_value', valueName: node.text, sourceNode: node }];
}

function isStandaloneOpenTypeNode(node) {
    const parentType = node.parent?.type;
    return ![
        'qualified_type_ref',
        'associated_fn_name',
        'module_name',
        'module_ref',
        'file_import_decl',
        'module_decl',
        'struct_decl',
        'type_decl',
        'proto_decl',
    ].includes(parentType);
}

function isStandaloneOpenValueNode(node) {
    const parentType = node.parent?.type;
    return ![
        'associated_fn_name',
        'module_name',
        'captured_module_name',
        'imported_module_name',
        'file_import_decl',
        'module_decl',
        'struct_decl',
        'type_decl',
        'proto_decl',
        'global_decl',
        'jsgen_decl',
        'param',
        'capture',
        'bind_target',
        'field_init',
        'field_decl',
        'type_member_expr',
        'field_expr',
    ].includes(parentType);
}

function nodePosition(node) {
    return {
        line: node.startPosition.row,
        character: node.startPosition.column,
    };
}

function containsNode(target, candidate) {
    for (let node = candidate; node; node = node.parent) {
        if (sameNode(target, node))
            return true;
    }
    return false;
}


function matchesTargetIdentity(targetIdentity, result) {
    if (!targetIdentity || !result)
        return false;
    if (targetIdentity.kind === 'module')
        return result.kind === 'module' && result.uri === targetIdentity.uri && result.moduleName === targetIdentity.moduleName;
    return result.kind === 'symbol' && result.uri === targetIdentity.uri && result.symbol?.key === targetIdentity.symbolKey;
}

async function walkNamedNodes(node, visit) {
    if (!node)
        return;
    await visit(node);
    for (const child of node.namedChildren ?? [])
        await walkNamedNodes(child, visit);
}

function resolveOpenImportedTarget(target, moduleName, context, resolveLocation) {
    if (context.kind === 'open_value')
        return resolveLocation(target, moduleName, context.valueName, null);
    if (context.kind === 'open_type')
        return resolveLocation(target, moduleName, context.typeName);
    if (context.kind === 'open_member')
        return resolveLocation(target, moduleName, context.memberName, context.typeName);
    return undefined;
}

function resolveImportUri(fromUri, specifier) {
    try {
        return new URL(specifier, fromUri).href;
    }
    catch {
        return null;
    }
}

function finalizeCrossFileResult(document, context, target) {
    return target ? {
        ...target,
        binding: context.binding,
        sourceRange: spanFromNode(document, context.sourceNode).range,
    } : undefined;
}
