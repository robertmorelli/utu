// Lower typed surface operators into ordinary calls. Type selection belongs to
// the graph; this pass only changes representation.

import { cloneGraphSubtree, createSyntheticNode, replaceNodeMeta, replaceTypedNode } from './ir-helpers.js';
import { isOperandless } from './type-rules.js';
import { actualType } from './type-graph.js';
import { BINARY_OP_FN, COMPOUND_OP, UNARY_OP_FN } from './operator-specs.js';

// Compatibility exports for standalone pass consumers.
export { BINARY_OP_FN, UNARY_OP_FN } from './operator-specs.js';

export function lowerOperators(doc, typeGraph = null) {
  const root = doc.body.firstChild;
  if (!root) return false;
  let changed = lowerCompounds(root);
  changed = lowerIndexAssignments(root, typeGraph) || changed;

  const expressions = [...root.querySelectorAll('ir-binary, ir-unary, ir-index, ir-slice')].reverse();
  for (const node of expressions) {
    const spec = operatorSpec(node, typeGraph);
    if (!spec) continue;
    if (isOperandless(spec.owner)) continue;
    replaceTypedNode(node, isShortCircuit(node, spec) ? buildShortCircuit(node) : buildCall(node, spec));
    changed = true;
  }
  return Boolean(changed);
}

// `a and b` / `a or b` on Bool evaluate b only when it decides the result,
// so `i < n and s[i] == c` is a safe guard. They lower to conditionals:
//   a and b  →  if a { b } else { false }
//   a or b   →  if a { true } else { b }
function isShortCircuit(node, spec) {
  return node.localName === 'ir-binary' && spec.owner === 'Bool' && ['and', 'or'].includes(node.getAttribute('op'));
}

function buildShortCircuit(node) {
  const doc = node.ownerDocument;
  const [left, right] = [...node.children];
  const branch = (value) => {
    const block = createSyntheticNode(doc, 'ir-block', node, 'lower-operators', 'short-circuit-branch');
    block.appendChild(value);
    block.dataset.typeName = 'Bool';
    return block;
  };
  const constant = (value) => {
    const literal = createSyntheticNode(doc, 'ir-lit', node, 'lower-operators', 'short-circuit-constant');
    literal.setAttribute('kind', 'bool');
    literal.setAttribute('value', value);
    literal.setAttribute('type-name', 'Bool');
    literal.dataset.typeName = 'Bool';
    return literal;
  };
  const conditional = createSyntheticNode(doc, 'ir-if', node, 'lower-operators', 'short-circuit');
  const and = node.getAttribute('op') === 'and';
  conditional.append(left, branch(and ? right : constant('true')), branch(and ? constant('false') : right));
  conditional.dataset.typeName = 'Bool';
  return conditional;
}

// `a op= b` becomes `a = a op b`. Only the target is duplicated; the value
// moves into the new expression, so compound assignments nested inside it
// (`h += { while (…) { i += 1; }; … }`) are still lowered. Innermost first,
// so nothing is rewritten after it has been copied.
function lowerCompounds(root) {
  let changed = false;
  for (const assign of [...root.querySelectorAll('ir-assign')].reverse()) {
    const op = COMPOUND_OP[assign.getAttribute('op') ?? '='];
    if (!op) continue;
    const [lhs, rhs] = [...assign.children];
    if (!lhs || !rhs) continue;
    const binary = createSyntheticNode(assign.ownerDocument, 'ir-binary', assign, 'lower-operators', 'compound-binary');
    binary.setAttribute('op', op);
    binary.appendChild(cloneGraphSubtree(lhs));
    assign.setAttribute('op', '=');
    replaceTypedNode(rhs, binary);
    binary.appendChild(rhs);
    changed = true;
  }
  return changed;
}

function lowerIndexAssignments(root, graph) {
  let changed = false;
  for (const assign of [...root.querySelectorAll('ir-assign')]) {
    const [target, value] = [...assign.children];
    if ((assign.getAttribute('op') ?? '=') !== '=' || target?.localName !== 'ir-index') continue;
    const [base, index] = [...target.children];
    const owner = (graph && actualType(graph, base)) ?? base?.dataset.typeName
      ?? (graph && actualType(graph, target)) ?? target.dataset.typeName;
    if (!base || isOperandless(owner)) continue;
    replaceTypedNode(assign, buildCall(assign, {
      owner, method: 'set_index', syntax: 'method', args: [base, index, value], label: '[]=',
    }));
    changed = true;
  }
  return changed;
}

function operatorSpec(node, graph) {
  const args = [...node.children];
  const first = args[0];
  const owner = (graph && actualType(graph, first)) ?? first?.dataset.typeName
    ?? (graph && actualType(graph, node)) ?? node.dataset.typeName;
  if (node.localName === 'ir-binary') {
    const op = node.getAttribute('op');
    return { owner, method: BINARY_OP_FN[op], syntax: 'operator', args, label: op };
  }
  if (node.localName === 'ir-unary') {
    const op = node.getAttribute('op');
    return { owner, method: UNARY_OP_FN[op], syntax: 'operator', args, label: op };
  }
  if (node.localName === 'ir-index') return { owner, method: 'get_index', syntax: 'method', args, label: '[]' };
  if (node.localName === 'ir-slice') return { owner, method: 'get_slice', syntax: 'method', args, label: '[,]' };
  return null;
}

function buildCall(site, { owner, method, syntax, args, label }) {
  const doc = site.ownerDocument;
  const call = doc.createElement('ir-call');
  const callee = createSyntheticNode(doc, 'ir-type-member', site, 'lower-operators', `${syntax}-callee`);
  const argList = createSyntheticNode(doc, 'ir-arg-list', site, 'lower-operators', `${syntax}-args`);
  replaceNodeMeta(call, site, 'lower-operators', `${syntax}-call`);

  call.dataset.operatorName = method;
  call.dataset.operatorReceiverName = owner;
  if (label) call.dataset.operatorSymbol = label;
  if (site.dataset.forArrayAccess) call.dataset.forArrayAccess = site.dataset.forArrayAccess;
  if (site.dataset.typeName) call.dataset.typeName = site.dataset.typeName;

  callee.setAttribute('method', method);
  if (syntax === 'operator') {
    callee.setAttribute('type-name', owner);
  } else {
    const type = createSyntheticNode(doc, 'ir-type-ref', site, 'lower-operators', 'method-type');
    type.setAttribute('name', owner);
    callee.appendChild(type);
  }
  for (const arg of args) if (arg) argList.appendChild(arg);
  call.appendChild(callee);
  call.appendChild(argList);
  return call;
}
