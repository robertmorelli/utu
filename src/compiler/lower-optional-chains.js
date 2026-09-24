// lower-optional-chains.js — `a?.b` in statements
//
// `?.` is only allowed in a statement, where "skip it when absent" needs no
// value:
//
//   el?.focus();          →  promote el { |o| => o.focus(), ~> {}, };
//   el?.value = text;     →  promote el { |o| => o.value = text, ~> {}, };
//   a?.b?.c();            →  promote a { |o| => promote o.b { |p| => p.c(), ~> {}, }, ~> {}, };
//
// The rewrite is syntactic and runs before typing; `promote` then checks that
// each base is nullable and lowers to a null test.

import { createSyntheticNode, replaceNodeMeta } from './ir-helpers.js';
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';

const STATEMENT_PARENTS = new Set(['ir-block', 'ir-promote-arm']);
const NOT_STATEMENTS = new Set(['ir-let', 'ir-return', 'ir-global']);

/** @returns {boolean} whether anything was rewritten */
export function lowerOptionalChains(doc) {
  let changed = false;
  let count = 0;
  for (;;) {
    // The leftmost `?.` of a chain first: its base holds no other `?.`.
    const node = [...doc.querySelectorAll('ir-optional-field')].find(n => {
      const base = n.firstElementChild;
      return base?.localName !== 'ir-optional-field' && !base?.querySelector('ir-optional-field');
    });
    if (!node) return changed;
    changed = true;
    const statement = statementOf(node);
    if (!statement) {
      const field = replaceNodeMeta(doc.createElement('ir-field-access'), node, 'lower-optional-chains', 'rejected');
      field.setAttribute('field', node.getAttribute('field'));
      field.append(...node.childNodes);
      field.dataset.optionalChainRejected = 'true';
      node.replaceWith(field);
      stampDiagnostic(field, DIAGNOSTIC_KINDS.TYPE_MISMATCH,
        "'?.' is only allowed in statements; use promote or orelse for a value");
      continue;
    }
    const name = `__optional_${count++}`;
    const promote = replaceNodeMeta(doc.createElement('ir-promote'), statement, 'lower-optional-chains', 'optional-chain');
    promote.setAttribute('binding', name);
    const field = replaceNodeMeta(doc.createElement('ir-field-access'), node, 'lower-optional-chains', 'present');
    field.setAttribute('field', node.getAttribute('field'));
    const present = createSyntheticNode(doc, 'ir-ident', node, 'lower-optional-chains', 'present-value');
    present.setAttribute('name', name);
    field.appendChild(present);
    const base = node.firstElementChild;
    node.replaceWith(field);
    const arm = createSyntheticNode(doc, 'ir-promote-arm', statement, 'lower-optional-chains', 'present-arm');
    const absent = createSyntheticNode(doc, 'ir-default-arm', statement, 'lower-optional-chains', 'absent-arm');
    absent.appendChild(createSyntheticNode(doc, 'ir-block', statement, 'lower-optional-chains', 'absent'));
    statement.replaceWith(promote);
    arm.appendChild(statement);
    promote.append(base, arm, absent);
  }
}

/** The statement containing `node`, when that statement's value is discarded. */
function statementOf(node) {
  let statement = node;
  while (statement.parentElement && !STATEMENT_PARENTS.has(statement.parentElement.localName)) {
    // Stop at anything that gives the chain a value (arguments, operands, conditions).
    if (!['ir-call', 'ir-field-access', 'ir-optional-field', 'ir-assign', 'ir-arg-list', 'ir-index'].includes(statement.parentElement.localName)) return null;
    statement = statement.parentElement;
  }
  if (!statement.parentElement || NOT_STATEMENTS.has(statement.localName)) return null;
  // An argument or an assigned value is not part of the chain being skipped.
  for (let child = node; child !== statement; child = child.parentElement) {
    const parent = child.parentElement;
    if (parent.localName === 'ir-arg-list') return null;
    if (parent.localName === 'ir-assign' && parent.lastElementChild === child) return null;
  }
  const block = statement.parentElement;
  // The tail of a value-producing block would give the chain a value.
  if (block.localName === 'ir-block' && block.lastElementChild === statement && producesValue(block)) return null;
  return statement;
}

function producesValue(block) {
  const owner = block.parentElement;
  if (!owner) return false;
  if (['ir-fn', 'ir-export-main', 'ir-closure'].includes(owner.localName)) {
    const declared = [...owner.children].find(child => child.localName.startsWith('ir-type') && child !== block);
    return !!declared && declared.localName !== 'ir-type-void';
  }
  return false;
}
