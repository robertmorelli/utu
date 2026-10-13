// Lower typed surface operators into ordinary calls. Type selection belongs to
// the graph; this pass only changes representation. Given backend facts, the
// calls it builds record their targets there, and clones carry theirs.

import { cloneGraphSubtree, createSyntheticNode, replaceNodeMeta, replaceTypedNode } from './ir-helpers.js';
import { isOperandless } from './type-rules.js';
import { actualType, operatorFunction } from './type-graph.js';
import { BINARY_OP_FN, COMPOUND_OP, UNARY_OP_FN } from './operator-specs.js';

// Compatibility exports for standalone pass consumers.
export { BINARY_OP_FN, UNARY_OP_FN } from './operator-specs.js';

export function lowerOperators(doc, typeGraph = null, facts = null) {
  const root = doc.body.firstChild;
  if (!root) return false;
  const lowering = { graph: typeGraph, facts };
  let changed = lowerCompounds(root, lowering);
  changed = lowerIndexAssignments(root, lowering) || changed;

  const expressions = [...root.querySelectorAll('ir-binary, ir-unary, ir-index, ir-slice')].reverse();
  for (const node of expressions) {
    const spec = operatorSpec(node, lowering);
    if (!spec) continue;
    if (isOperandless(spec.owner)) continue;
    replaceTypedNode(node, isShortCircuit(node, spec) ? buildShortCircuit(node, lowering) : buildCall(node, spec, lowering), facts);
    changed = true;
  }
  return Boolean(changed);
}

function typeOf({ graph, facts }, node) {
  if (facts) return facts.type(node);
  return (graph && actualType(graph, node)) ?? node?.attr?.('data-type-name');
}

// `a and b` / `a or b` on Bool evaluate b only when it decides the result,
// so `i < n and s[i] == c` is a safe guard. They lower to conditionals:
//   a and b  →  if a { b } else { false }
//   a or b   →  if a { true } else { b }
function isShortCircuit(node, spec) {
  return node.localName === 'ir-binary' && spec.owner === 'Bool' && ['and', 'or'].includes(node.getAttribute('op'));
}

function buildShortCircuit(node, { facts }) {
  const doc = node.ownerDocument;
  const [left, right] = [...node.children];
  const branch = (value) => {
    const block = createSyntheticNode(doc, 'ir-block', node, 'lower-operators', 'short-circuit-branch');
    block.appendChild(value);
    block.setAttribute('data-type-name', 'Bool');
    facts?.setType(block, 'Bool');
    facts?.setExpectation(block, 'Bool');
    return block;
  };
  const constant = (value) => {
    const literal = createSyntheticNode(doc, 'ir-lit', node, 'lower-operators', 'short-circuit-constant');
    literal.setAttribute('kind', 'bool');
    literal.setAttribute('value', value);
    literal.setAttribute('type-name', 'Bool');
    literal.setAttribute('data-type-name', 'Bool');
    facts?.setType(literal, 'Bool');
    return literal;
  };
  const conditional = createSyntheticNode(doc, 'ir-if', node, 'lower-operators', 'short-circuit');
  const and = node.getAttribute('op') === 'and';
  conditional.append(left, branch(and ? right : constant('true')), branch(and ? constant('false') : right));
  conditional.setAttribute('data-type-name', 'Bool');
  return conditional;
}

// `a op= b` becomes `a = a op b`. Only the target is duplicated; the value
// moves into the new expression, so compound assignments nested inside it
// (`h += { while (…) { i += 1; }; … }`) are still lowered. Innermost first,
// so nothing is rewritten after it has been copied.
function lowerCompounds(root, { facts }) {
  let changed = false;
  for (const assign of [...root.querySelectorAll('ir-assign')].reverse()) {
    const op = COMPOUND_OP[assign.getAttribute('op') ?? '='];
    if (!op) continue;
    const [lhs, rhs] = [...assign.children];
    if (!lhs || !rhs) continue;
    const binary = createSyntheticNode(assign.ownerDocument, 'ir-binary', assign, 'lower-operators', 'compound-binary');
    binary.setAttribute('op', op);
    binary.appendChild(cloneGraphSubtree(lhs, facts));
    assign.setAttribute('op', '=');
    replaceTypedNode(rhs, binary, facts);
    binary.appendChild(rhs);
    changed = true;
  }
  return changed;
}

function lowerIndexAssignments(root, lowering) {
  let changed = false;
  for (const assign of [...root.querySelectorAll('ir-assign')]) {
    const [target, value] = [...assign.children];
    if ((assign.getAttribute('op') ?? '=') !== '=' || target?.localName !== 'ir-index') continue;
    const [base, index] = [...target.children];
    const owner = typeOf(lowering, base) ?? typeOf(lowering, target);
    if (!base || isOperandless(owner)) continue;
    replaceTypedNode(assign, buildCall(assign, {
      owner, method: 'set_index', syntax: 'method', args: [base, index, value], label: '[]=',
    }, lowering), lowering.facts);
    changed = true;
  }
  return changed;
}

function operatorSpec(node, lowering) {
  const args = [...node.children];
  const owner = typeOf(lowering, args[0]) ?? typeOf(lowering, node);
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

function buildCall(site, { owner, method, syntax, args, label }, { graph, facts }) {
  const doc = site.ownerDocument;
  const call = doc.createElement('ir-call');
  const callee = createSyntheticNode(doc, 'ir-type-member', site, 'lower-operators', `${syntax}-callee`);
  const argList = createSyntheticNode(doc, 'ir-arg-list', site, 'lower-operators', `${syntax}-args`);
  replaceNodeMeta(call, site, 'lower-operators', `${syntax}-call`);

  call.setAttribute('data-operator-name', method);
  call.setAttribute('data-operator-receiver-name', owner);
  if (label) call.setAttribute('data-operator-symbol', label);
  if (site.attr('data-for-array-access')) call.setAttribute('data-for-array-access', site.attr('data-for-array-access'));
  if (site.attr('data-type-name')) call.setAttribute('data-type-name', site.attr('data-type-name'));

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

  const fn = facts && graph && operatorFunction(graph, owner, method, syntax);
  if (fn) {
    facts.callTargets.set(call.id, fn.id);
    facts.resolutions.set(call, 'static-method');
    facts.resolutions.set(callee, 'static-method');
  }
  return call;
}
