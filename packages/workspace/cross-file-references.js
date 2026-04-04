import { findNamedChild, spanFromNode } from '../document/index.js';
import { sameRange, treePoint } from '../language-platform/core/completion-helpers.js';
import { getOccurrencesForSymbol, resolveSymbol } from '../language-platform/core/document-index/build.js';
import { copyRange, rangeKey } from '../language-platform/core/types.js';
import { findModuleNameNode, sameNode } from './cross-file-shared.js';
import { collectCrossFileReferences, resolveCrossFileSymbol } from './cross-file-definition.js';

export async function getWorkspaceReferences(session, document, position, includeDeclaration = false) {
    const target = await resolveWorkspaceReferenceTarget(session, document, position);
    if (!target)
        return session.languageService.getReferences(document, position, includeDeclaration);
    const locations = new Map();
    if (target.kind === 'symbol') {
        for (const reference of await getWorkspaceSymbolReferences(session, target, includeDeclaration))
            locations.set(locationKey(reference), reference);
    } else if (target.uri === document.uri) {
        locations.set(locationKey(target.declaration), cloneLocation(target.declaration));
    }
    if (includeDeclaration)
        locations.set(locationKey(target.declaration), cloneLocation(target.declaration));
    for (const candidate of await session.documents.listWorkspaceDocuments()) {
        if (candidate.uri === target.uri)
            continue;
        for (const reference of await collectCrossFileReferences(session, candidate, target.identity))
            locations.set(locationKey(reference), reference);
    }
    return [...locations.values()].sort(compareLocations);
}

export async function getWorkspaceDocumentHighlights(session, document, position) {
    const target = await resolveWorkspaceReferenceTarget(session, document, position);
    if (!target)
        return session.languageService.getDocumentHighlights(document, position);
    const references = await getWorkspaceReferences(session, document, position, true);
    return references
        .filter((reference) => reference.uri === document.uri)
        .map((reference) => ({
            range: copyRange(reference.range),
            kind: sameRange(reference.range, target.declaration.range) ? 'write' : 'read',
        }));
}

async function resolveWorkspaceReferenceTarget(session, document, position) {
    const index = await session.languageService.getDocumentIndex(document);
    const symbol = resolveSymbol(index, position);
    if (symbol) {
        return {
            kind: 'symbol',
            uri: symbol.uri,
            declaration: { uri: symbol.uri, range: copyRange(symbol.range) },
            identity: { kind: 'symbol', uri: symbol.uri, symbolKey: symbol.key },
        };
    }
    const localModule = await resolveLocalModuleTarget(session, document, position);
    if (localModule)
        return localModule;
    const foreign = await resolveCrossFileSymbol(session, document, position);
    return foreign ? targetFromForeignResult(foreign) : undefined;
}

async function getWorkspaceSymbolReferences(session, target, includeDeclaration) {
    if (target.kind !== 'symbol')
        return [];
    const references = [];
    for (const candidate of await session.documents.listWorkspaceDocuments()) {
        const index = await session.languageService.getDocumentIndex(candidate);
        if (!index)
            continue;
        const includeDocumentDeclaration = includeDeclaration || candidate.uri !== target.uri;
        references.push(...getDocumentSymbolReferences(candidate, index, target.identity.symbolKey, includeDocumentDeclaration));
    }
    return references;
}

function getDocumentSymbolReferences(document, index, symbolKey, includeDeclaration) {
    return getOccurrencesForSymbol(index, symbolKey)
        .filter((occurrence) => includeDeclaration || !occurrence.isDefinition)
        .map((occurrence) => ({ uri: document.uri, range: copyRange(occurrence.range) }));
}

async function resolveLocalModuleTarget(session, document, position) {
    const documentState = await session.languageService.getCachedDocumentState(document);
    const point = treePoint(position.line, position.character);
    const anchor = documentState.tree.rootNode.namedDescendantForPosition(point, point);
    for (let node = anchor; node; node = node.parent) {
        if (node.type !== 'module_decl')
            continue;
        const nameNode = findModuleNameNode(node);
        if (!sameNode(nameNode, anchor))
            continue;
        const range = spanFromNode(document, nameNode).range;
        return {
            kind: 'module',
            uri: document.uri,
            declaration: { uri: document.uri, range: copyRange(range) },
            identity: { kind: 'module', uri: document.uri, moduleName: nameNode.text },
        };
    }
    return undefined;
}

function targetFromForeignResult(result) {
    if (result.kind === 'module') {
        return {
            kind: 'module',
            uri: result.uri,
            declaration: { uri: result.uri, range: copyRange(result.range) },
            identity: { kind: 'module', uri: result.uri, moduleName: result.moduleName },
        };
    }
    return {
        kind: 'symbol',
        uri: result.uri,
        declaration: { uri: result.uri, range: copyRange(result.range) },
        identity: { kind: 'symbol', uri: result.uri, symbolKey: result.symbol.key },
    };
}

function locationKey(location) {
    return `${location.uri}:${rangeKey(location.range)}`;
}

function compareLocations(left, right) {
    return left.uri.localeCompare(right.uri)
        || left.range.start.line - right.range.start.line
        || left.range.start.character - right.range.start.character
        || left.range.end.line - right.range.end.line
        || left.range.end.character - right.range.end.character;
}

function cloneLocation(location) {
    return { uri: location.uri, range: copyRange(location.range) };
}
