// parse.js — Phase 1: tree-sitter CST → HTML IR DOM
//
// Walks the tree-sitter parse tree produced by tree-sitter-utu and emits a
// linkedom document whose root is <ir-source-file>.  Every construct in the
// grammar maps 1-to-1 to a custom ir-* element; no semantic information is
// added here — that is the job of later analysis passes which stamp data-*
// attributes onto the nodes.
//
// Conventions
//   - `n` is always a tree-sitter SyntaxNode
//   - `el` is always a linkedom Element
//   - `doc` is the linkedom Document threaded through every helper
//   - named children are accessed by field name (n.childForFieldName)
//   - unnamed / anonymous children are skipped (they are punctuation)

import { T } from './ir-tags.js';
import {
  createIRDocument,
  resetNodeIds,
  nextNodeId,
  restampSubtree,
  stamp,
  el,
  text,
  namedChildren,
  append,
  walkChildren,
} from './parse-helpers.js';
import { walkers as declWalkers } from './parse-decls.js';
import { walkers as exprWalkers } from './parse-exprs.js';
import { walkers as typeWalkers } from './parse-types.js';
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';

// ── Re-exports ────────────────────────────────────────────────────────────────
// These were previously defined here; now they live in parse-helpers.js.
// External callers (lower-pipe.js, compiler.js, etc.) import from parse.js.
export {
  createIRDocument,
  resetNodeIds,
  nextNodeId,
  restampSubtree,
  stamp,
  el,
  text,
  namedChildren,
  append,
  walkChildren,
};

// ── Walker registry ───────────────────────────────────────────────────────────

const registry = new Map([
  ...Object.entries(declWalkers),
  ...Object.entries(exprWalkers),
  ...Object.entries(typeWalkers),
]);

function dispatchNode(n, doc, source) {
  const fn = registry.get(n.type);
  if (fn) return fn(n, doc, source, dispatchNode);

  // Special cases not in sub-module registries
  if (['int_lit', 'float_lit', 'string_lit', 'multiline_string_lit', 'bool_lit', 'null_lit'].includes(n.type)) {
    return registry.get('literal')?.(n, doc, source, dispatchNode) ?? walkUnknown(n, doc, source);
  }
  if (n.type === 'return_type') return dispatchNode(namedChildren(n)[0], doc, source);
  if (n.type === 'paren_type')  return dispatchNode(namedChildren(n)[0], doc, source);
  if (n.type === 'comment')     return null;

  return walkUnknown(n, doc, source);
}

// ── Source file ───────────────────────────────────────────────────────────────

function walkSourceFile(n, doc, source) {
  const node = stamp(el(T.SOURCE_FILE, doc), n);
  for (const child of namedChildren(n)) {
    const ir = dispatchNode(child, doc, source);
    if (ir) node.appendChild(ir);
  }
  return node;
}

// ── Unknown node fallback ─────────────────────────────────────────────────────

function walkUnknown(n, doc, source) {
  const node = stamp(el('ir-unknown', doc), n);
  node.setAttribute('ts-type', n.type);
  node.setAttribute('raw', text(n));
  if (n.type === 'ERROR' || n.isMissing) {
    stampDiagnostic(node, DIAGNOSTIC_KINDS.PARSE_ERROR, `Parse error at ${n.startPosition.row + 1}:${n.startPosition.column + 1}`, {
      tsType: n.type,
      missing: Boolean(n.isMissing),
    });
    if (n.isMissing) node.dataset.missing = 'true';
  }
  return node;
}

// ── Syntax diagnostics ────────────────────────────────────────────────────────

function stampSyntaxDiagnostics(root, cstRoot) {
  const diagnostics = [];
  walkSyntaxDiagnostics(cstRoot, diagnostics);
  root.dataset.parseErrorCount = String(diagnostics.length);
  if (diagnostics.length) {
    root.dataset.parseErrors = JSON.stringify(diagnostics);
    stampDiagnostic(root, DIAGNOSTIC_KINDS.PARSE_ERROR, `${diagnostics.length} parse error(s)`);
  }
}

function walkSyntaxDiagnostics(node, acc) {
  if (node.type === 'ERROR' || node.isMissing) {
    acc.push({
      message:
        `Parse error at ${node.startPosition.row + 1}:${node.startPosition.column + 1}` +
        (node.isMissing ? ` (missing ${node.type})` : ''),
      start: node.startIndex,
      end: node.endIndex,
      row: node.startPosition.row,
      column: node.startPosition.column,
      missing: Boolean(node.isMissing),
      tsType: node.type,
    });
  }
  for (const child of node.children ?? []) walkSyntaxDiagnostics(child, acc);
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Convert a tree-sitter parse tree into an IR document.
 *
 * @param {import('web-tree-sitter').Tree} tree
 * @param {string} source
 * @param {() => Document} [createDoc] - document factory for DI.
 */
export function treeToIR(tree, source, sourceFileOrCreateDoc = '', maybeCreateDoc = createIRDocument) {
  const createDoc = typeof sourceFileOrCreateDoc === 'function' ? sourceFileOrCreateDoc : maybeCreateDoc;
  const sourceFile = (typeof sourceFileOrCreateDoc === 'string' ? sourceFileOrCreateDoc : '') || '<memory>';
  const doc  = createDoc();
  doc.__utuSourceFile = sourceFile;
  const root = walkSourceFile(tree.rootNode, doc, source);
  stampSyntaxDiagnostics(root, tree.rootNode);
  doc.body.appendChild(root);
  return doc;
}
