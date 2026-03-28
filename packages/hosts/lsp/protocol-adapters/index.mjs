import { copyRange } from '../../../language-platform/index.js';
import data from '../../../../jsondata/lsp.data.json' with { type: 'json' };

const DOCUMENT_SYMBOL_KINDS = data.documentSymbolKinds;
const DOCUMENT_HIGHLIGHT_KINDS = data.documentHighlightKinds;
const DIAGNOSTIC_SEVERITIES = data.diagnosticSeverities;
const SEMANTIC_TOKEN_TYPES = data.semanticTokenTypes;
const SEMANTIC_TOKEN_MODIFIERS = data.semanticTokenModifiers;
const SEMANTIC_TOKEN_TYPE_INDEX = Object.fromEntries(
  SEMANTIC_TOKEN_TYPES.map((type, index) => [type, index]),
);
const SEMANTIC_TOKEN_MODIFIER_MASKS = Object.fromEntries(
  SEMANTIC_TOKEN_MODIFIERS.map((modifier, index) => [modifier, 1 << index]),
);

export const JSON_RPC_ERRORS = data.jsonRpcErrors;
export const INITIALIZE_RESULT = data.initializeResult;

export function getRequiredTextDocumentUri(params) {
  return getRequiredTextDocument(params).uri;
}

export function getRequiredTextDocument(params) {
  ensure(isObject(params) && isObject(params.textDocument), 'Missing textDocument payload.');
  return {
    uri: requireString(params.textDocument.uri, 'textDocument.uri'),
    version: typeof params.textDocument.version === 'number' ? params.textDocument.version : 0,
    text: typeof params.textDocument.text === 'string' ? params.textDocument.text : '',
  };
}

export function getRequiredPosition(params) {
  ensure(isObject(params) && isObject(params.position), 'Missing position payload.');
  return {
    line: requireNumber(params.position.line, 'position.line'),
    character: requireNumber(params.position.character, 'position.character'),
  };
}

export function getIncludeDeclaration(params) {
  return Boolean(isObject(params) && isObject(params.context) && params.context.includeDeclaration);
}

export function getRequiredContentChanges(params) {
  ensure(isObject(params) && Array.isArray(params.contentChanges), 'Missing contentChanges payload.');
  return params.contentChanges.map((change) => {
    ensure(isObject(change) && typeof change.text === 'string', 'Invalid content change payload.');
    return { text: change.text, range: isRange(change.range) ? change.range : undefined };
  });
}

export function getWorkspaceSymbolQuery(params) {
  return isObject(params) && typeof params.query === 'string' ? params.query : '';
}

export function getOptionalText(params) {
  return isObject(params) && typeof params.text === 'string' ? params.text : undefined;
}

export function getWorkspaceFolderUris(params) {
  return isObject(params) ? readFolderUris(params.workspaceFolders) : [];
}

export function getWorkspaceFolderChanges(params) {
  return isObject(params) && isObject(params.event)
    ? { added: readFolderUris(params.event.added), removed: readFolderUris(params.event.removed) }
    : { added: [], removed: [] };
}

export function toLspLocation(location) {
  return mapNullable(location, copyUriRange);
}

export function toLspHover(hover) {
  return mapNullable(hover, (value) => ({
    contents: value.contents,
    range: copyRange(value.range),
  }));
}

export function toLspDiagnostic(diagnostic) {
  return {
    range: copyRange(diagnostic.range),
    severity: DIAGNOSTIC_SEVERITIES[diagnostic.severity],
    source: diagnostic.source,
    message: diagnostic.message,
  };
}

export function toLspDocumentHighlight(highlight) {
  return {
    range: copyRange(highlight.range),
    kind: DOCUMENT_HIGHLIGHT_KINDS[highlight.kind],
  };
}

export function toLspCompletionItem(item, completionItemKinds) {
  return {
    label: item.label,
    kind: completionItemKinds[item.kind],
    detail: item.detail,
  };
}

export function toLspDocumentSymbol(symbol) {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: DOCUMENT_SYMBOL_KINDS[symbol.kind],
    range: copyRange(symbol.range),
    selectionRange: copyRange(symbol.selectionRange),
  };
}

export function toLspWorkspaceSymbol(symbol) {
  return {
    name: symbol.name,
    kind: DOCUMENT_SYMBOL_KINDS[symbol.kind],
    location: copyUriRange(symbol.location),
    containerName: symbol.detail,
  };
}

export function encodeSemanticTokens(tokens) {
  const data = [];
  let previousLine = 0;
  let previousCharacter = 0;
  for (const token of [...tokens].filter(isEncodableSemanticToken).sort(compareSemanticTokens)) {
    const typeIndex = SEMANTIC_TOKEN_TYPE_INDEX[token.type];
    if (typeIndex === undefined) continue;
    const line = token.range.start.line;
    const character = token.range.start.character;
    const deltaLine = line - previousLine;
    const deltaCharacter = deltaLine === 0 ? character - previousCharacter : character;
    const length = token.range.end.character - token.range.start.character;
    const modifierMask = getModifierMask(token.modifiers);
    data.push(deltaLine, deltaCharacter, length, typeIndex, modifierMask);
    previousLine = line;
    previousCharacter = character;
  }
  return data;
}

export function getErrorCode(error) {
  return error instanceof JsonRpcError ? error.code : JSON_RPC_ERRORS.internalError;
}

export function errorToData(error) {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : error;
}

export class JsonRpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function copyUriRange(value) {
  return { uri: value.uri, range: copyRange(value.range) };
}

function readFolderUris(value) {
  return Array.isArray(value)
    ? value.flatMap((folder) =>
        isObject(folder) && typeof folder.uri === 'string' ? [folder.uri] : [],
      )
    : [];
}

function isEncodableSemanticToken(token) {
  return (
    token.range.start.line === token.range.end.line &&
    token.range.end.character > token.range.start.character
  );
}

function compareSemanticTokens(left, right) {
  return (
    left.range.start.line - right.range.start.line ||
    left.range.start.character - right.range.start.character
  );
}

function getModifierMask(modifiers) {
  return modifiers.reduce(
    (mask, modifier) => mask | (SEMANTIC_TOKEN_MODIFIER_MASKS[modifier] ?? 0),
    0,
  );
}

function isRange(value) {
  return (
    isObject(value) &&
    isObject(value.start) &&
    isObject(value.end) &&
    typeof value.start.line === 'number' &&
    typeof value.start.character === 'number' &&
    typeof value.end.line === 'number' &&
    typeof value.end.character === 'number'
  );
}

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

function requireString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, `Expected ${fieldName} to be a string.`);
  }
  return value;
}

function requireNumber(value, fieldName) {
  if (typeof value !== 'number') {
    throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, `Expected ${fieldName} to be a number.`);
  }
  return value;
}

function ensure(condition, message) {
  if (!condition) throw new JsonRpcError(JSON_RPC_ERRORS.invalidRequest, message);
}

function mapNullable(value, map) {
  return value ? map(value) : null;
}
