// Analysis-only source token sidecar.
//
// These tokens are for display/LSP-style highlighting. They are not semantic IR
// and compile/codegen passes should not read them.

export const ANALYSIS_TOKENS = Symbol('utu.analysisTokens');

export function collectAnalysisTokens(root, file) {
  const tokens = [];
  walkAnalysisTokens(root, file, tokens);
  return tokens;
}

function walkAnalysisTokens(node, file, tokens) {
  collectNamedSemanticToken(node, file, tokens);

  if (!node.isNamed) {
    const role = tokenRole(node.type);
    if (role && node.endIndex > node.startIndex) {
      tokens.push({ file, start: node.startIndex, end: node.endIndex, kind: 'syntax', role, text: node.type });
    }
  } else if (node.type === 'comment') {
    tokens.push({ file, start: node.startIndex, end: node.endIndex, kind: 'syntax', role: 'comment' });
  } else {
    const role = namedTokenRole(node.type);
    if (role && node.endIndex > node.startIndex) {
      tokens.push({ file, start: node.startIndex, end: node.endIndex, kind: 'syntax', role });
    }
  }

  for (const child of node.children ?? []) walkAnalysisTokens(child, file, tokens);
}

function collectNamedSemanticToken(node, file, tokens) {
  const sectionTag = sectionTagForNode(node.type);
  if (sectionTag) tokens.push({ file, start: node.startIndex, end: node.endIndex, kind: 'section', role: 'section', tag: sectionTag });

  if (node.type === 'test_decl' || node.type === 'bench_decl') {
    const labelToken = node.namedChildren?.find?.(child => child.type === 'string_lit');
    if (labelToken) tokens.push({ file, start: labelToken.startIndex, end: labelToken.endIndex, kind: 'syntax', role: 'string' });
  }

  if (node.type === 'dsl_body' && node.endIndex >= node.startIndex + 4) {
    tokens.push({ file, start: node.startIndex, end: node.startIndex + 2, kind: 'syntax', role: 'operator' });
    tokens.push({ file, start: node.endIndex - 2, end: node.endIndex, kind: 'syntax', role: 'operator' });
  }

  if (node.type === 'export_main_decl') {
    const mainToken = node.children?.find?.(child => child.type === 'main');
    if (mainToken) tokens.push({ file, start: mainToken.startIndex, end: mainToken.endIndex, kind: 'syntax', role: 'function' });
    return;
  }

  if ((node.type === 'global_decl' || node.type === 'bind_expr') && hasDirectFuncType(node)) {
    const nameToken = node.namedChildren?.find?.(child => child.type === 'identifier');
    if (nameToken) tokens.push({ file, start: nameToken.startIndex, end: nameToken.endIndex, kind: 'syntax', role: 'function' });
  }
}

function sectionTagForNode(type) {
  switch (type) {
    case 'test_decl': return 'ir-test';
    case 'bench_decl': return 'ir-bench';
    case 'module_decl': return 'ir-module';
    case 'export_lib_decl': return 'ir-export-lib';
    case 'export_main_decl': return 'ir-export-main';
    default: return '';
  }
}

function hasDirectFuncType(node) {
  return node.namedChildren?.some?.(child => child.type === 'func_type') ?? false;
}

function namedTokenRole(type) {
  if (type === 'type_ident') return 'type';
  return '';
}

function tokenRole(type) {
  if (KEYWORD_TOKENS.has(type)) return keywordRole(type);
  if (OPERATOR_TOKENS.has(type)) return type === 'not' ? 'keyword.operator' : 'operator';
  if (BRACKET_TOKENS.has(type)) return 'punctuation.bracket';
  if (DELIMITER_TOKENS.has(type)) return 'punctuation.delimiter';
  if (type === '@') return 'attribute';
  return '';
}

function keywordRole(type) {
  if (['if', 'else', 'while', 'for', 'match', 'alt', 'promote', 'return', 'break'].includes(type)) return 'keyword.control';
  if (['let', 'fn', 'fun', 'struct', 'enum', 'proto'].includes(type)) return 'keyword.storage';
  if (type === 'from') return 'keyword.control.import';
  return 'keyword';
}

const KEYWORD_TOKENS = new Set([
  'export', 'main', 'let', 'fn', 'fun', 'struct', 'enum', 'proto', 'using', 'from',
  'test', 'bench', 'if', 'else', 'while', 'for', 'match', 'alt', 'promote',
  'return', 'break', 'fatal', 'assert', 'not',
]);

const OPERATOR_TOKENS = new Set([
  '=', '+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=', '|>', '-o', '=>', '\\', 'not', ':', '..<', '...',
]);

const BRACKET_TOKENS = new Set(['(', ')', '{', '}', '[', ']']);
const DELIMITER_TOKENS = new Set([',', '.', ';']);
