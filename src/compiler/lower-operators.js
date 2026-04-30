// lower-operators.js — Pass between inferTypes and resolveMethods
//
// Rewrites ir-binary, ir-unary, ir-index, ir-slice, and index-assigns into
// ir-call nodes using the operator overload convention:
//
//   a + b          (where a : T)  →  T:add(a, b)
//   -a             (where a : T)  →  T:neg(a)
//   a[i]           (where a : T)  →  T.get_index(a, i)
//   a[s, e]        (where a : T)  →  T.get_slice(a, s, e)
//   a[i] = v       (where a : T)  →  T.set_index(a, i, v)
//
// Logical operators (`and`, `or`, `xor`, `not`) are overloads like every
// other operator — declared by `std/bool.utu` as `&:and`, `&:or`, `&:xor`,
// `&:not`.  The compiler routes them through this pass the same way it
// routes `+` or `-`; there is no special path for logical operators.
//
// Must run AFTER inferTypes (needs data-type on operands).
// The null fallback and pipe are left untouched.
//
// Compound assignment is desugared first:
//   x += rhs  →  x = x + rhs
// Then the resulting ir-binary is lowered in the same pass.

import { restampSubtree } from './parse.js';
import { createSyntheticNode, replaceNodeMeta } from './ir-helpers.js';
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';

// Infix operator token → operator function name (colon convention).
// The function-name half is what the stdlib declares — see e.g.
// `std/i32.utu` (`&:add`) and `std/bool.utu` (`&:and`).
const BINARY_OP_FN = {
  '+':   'add',  '-':   'sub',  '*':   'mul',  '/':   'div',  '%':   'rem',
  '&':   'band', '|':   'bor',  '^':   'bxor',
  '<<':  'shl',  '>>':  'shr',  '>>>': 'ushr',
  '==':  'eq',   '!=':  'ne',
  '<':   'lt',   '<=':  'le',   '>':   'gt',   '>=':  'ge',
  'and': 'and',  'or':  'or',   'xor': 'xor',
};

// Compound assignment op → the base binary op
const COMPOUND_TO_BINARY = {
  '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%',
  '&=': '&', '|=': '|', '^=': '^',
  '<<=': '<<', '>>=': '>>', '>>>=': '>>>',
  'and=': 'and', 'or=': 'or', 'xor=': 'xor',
};

// Unary operator token → operator function name (colon convention)
const UNARY_OP_FN = {
  '-':   'neg',
  '~':   'bnot',
  'not': 'not',
};

/**
 * @param {Document} doc
 */
export function lowerOperators(doc) {
  const root = doc.body.firstChild;
  if (!root) return false;
  let changed = false;

  // ── 1. Desugar compound assignment (x += rhs → x = x + rhs) ─────────────
  for (const node of [...root.querySelectorAll('ir-assign')]) {
    const op = node.getAttribute('op') ?? '=';
    const binOp = COMPOUND_TO_BINARY[op];
    if (!binOp) continue; // plain '=' — leave it

    const [lhs, rhs] = [...node.children];
    if (!lhs || !rhs) continue;

    const doc2 = node.ownerDocument;
    const binary = createSyntheticNode(doc2, 'ir-binary', node, 'lower-operators', 'compound-binary');
    binary.setAttribute('op', binOp);
    for (const part of [lhs, rhs]) {
      const clone = part.cloneNode(true);
      restampSubtree(clone, part.dataset.originFile);
      binary.appendChild(clone);
    }

    node.setAttribute('op', '=');
    rhs.replaceWith(binary);
    changed = true;
  }

  // ── 2. Desugar index-assign (a[i] = v  →  T.set_index(a, i, v)) ─────────
  //
  // Must run before the ir-index lowering pass so we can pull the lhs apart.
  for (const node of [...root.querySelectorAll('ir-assign')]) {
    const op = node.getAttribute('op') ?? '=';
    if (op !== '=') continue; // compound already desugared above

    const [lhs, rhs] = [...node.children];
    if (lhs?.localName !== 'ir-index') continue;

    const [base, idx] = [...lhs.children];
    if (!base) continue;

    const typeName = base.dataset.type ?? lhs.dataset.type;
    if (!typeName || typeName === 'void' || typeName === 'null') continue;

    // Replace the ir-assign with a set_index call
    node.replaceWith(buildMethodCall(
      node.ownerDocument, node, typeName, 'set_index',
      [base, idx, rhs],
    ));
    changed = true;
  }

  // ── 3. Lower ir-binary → ir-call ─────────────────────────────────────────
  for (const node of [...root.querySelectorAll('ir-binary')].reverse()) {
    const op = node.getAttribute('op');
    const fnName = BINARY_OP_FN[op];
    if (!fnName) continue;

    const [lhs, rhs] = [...node.children];
    if (!lhs || !rhs) continue;

    const typeName = lhs.dataset.type ?? node.dataset.type;
    if (!typeName || typeName === 'void' || typeName === 'null') {
      stampUntypedOperator(node, op, lhs);
      continue;
    }

    node.replaceWith(buildOpCall(node.ownerDocument, node, typeName, fnName, [lhs, rhs]));
    changed = true;
  }

  // ── 4. Lower ir-unary → ir-call ──────────────────────────────────────────
  for (const node of [...root.querySelectorAll('ir-unary')].reverse()) {
    const op = node.getAttribute('op');
    const fnName = UNARY_OP_FN[op];
    if (!fnName) continue;

    const operand = node.firstElementChild;
    if (!operand) continue;

    const typeName = operand.dataset.type ?? node.dataset.type;
    if (!typeName || typeName === 'void' || typeName === 'null') {
      stampUntypedOperator(node, op, operand);
      continue;
    }

    node.replaceWith(buildOpCall(node.ownerDocument, node, typeName, fnName, [operand]));
    changed = true;
  }

  // ── 5. Lower ir-index → T.get_index(base, idx) ───────────────────────────
  for (const node of [...root.querySelectorAll('ir-index')]) {
    const [base, idx] = [...node.children];
    if (!base) continue;

    const typeName = base.dataset.type ?? node.dataset.type;
    if (!typeName || typeName === 'void' || typeName === 'null') {
      stampUntypedOperator(node, '[]', base);
      continue;
    }

    node.replaceWith(buildMethodCall(
      node.ownerDocument, node, typeName, 'get_index', [base, idx],
    ));
    changed = true;
  }

  // ── 6. Lower ir-slice → T.get_slice(base, start, end) ────────────────────
  for (const node of [...root.querySelectorAll('ir-slice')]) {
    const [base, start, end_] = [...node.children];
    if (!base) continue;

    const typeName = base.dataset.type ?? node.dataset.type;
    if (!typeName || typeName === 'void' || typeName === 'null') {
      stampUntypedOperator(node, '[,]', base);
      continue;
    }

    node.replaceWith(buildMethodCall(
      node.ownerDocument, node, typeName, 'get_slice', [base, start, end_],
    ));
    changed = true;
  }

  return changed;
}

function stampUntypedOperator(node, op, operand) {
  if (node.dataset.errorKind) return;
  const actual = operand?.dataset?.type ?? node.dataset.type ?? 'unknown';
  stampDiagnostic(node, DIAGNOSTIC_KINDS.TYPE_MISMATCH, `Cannot lower operator '${op}' with operand type ${actual}`, {
    operator: op,
    operandType: actual,
  });
}

// ── Builders ──────────────────────────────────────────────────────────────────

// Build a COLON operator call:  T:fnName(arg0, arg1, ...)
// The callee is ir-type-member with a `type` attribute (fast path — no child
// type node needed since resolveStaticCall falls back to the attribute).
// Used for overloadable binary/unary operators (T:add, T:neg, …).
function buildOpCall(doc, site, typeName, fnName, argNodes) {
  const call    = doc.createElement('ir-call');
  const callee  = createSyntheticNode(doc, 'ir-type-member', site, 'lower-operators', 'operator-callee');
  const argList = createSyntheticNode(doc, 'ir-arg-list', site, 'lower-operators', 'operator-args');

  replaceNodeMeta(call, site, 'lower-operators', 'operator-call');
  call.dataset.operatorName = fnName;
  call.dataset.operatorReceiverType = typeName;
  if (site.dataset.type) call.dataset.type = site.dataset.type;

  // Keep type as a plain attribute — resolveStaticCall's fallback reads it.
  callee.setAttribute('type',   typeName);
  callee.setAttribute('method', fnName);

  // Move args (don't clone) so nested operators captured by an outer
  // querySelectorAll iteration remain reachable and get lowered too.
  for (const arg of argNodes) if (arg) argList.appendChild(arg);

  call.appendChild(callee);
  call.appendChild(argList);
  return call;
}

// Build a DOT method call:  T.fnName(arg0, arg1, ...)
// The callee is ir-type-member with a child ir-type-ref (primary format read
// by resolveStaticCall).  Used for index operators (get_index, set_index, …).
function buildMethodCall(doc, site, typeName, fnName, argNodes) {
  const call    = doc.createElement('ir-call');
  const callee  = createSyntheticNode(doc, 'ir-type-member', site, 'lower-operators', 'method-callee');
  const typeRef = createSyntheticNode(doc, 'ir-type-ref', site, 'lower-operators', 'method-type');
  const argList = createSyntheticNode(doc, 'ir-arg-list', site, 'lower-operators', 'method-args');

  replaceNodeMeta(call, site, 'lower-operators', 'method-call');
  call.dataset.operatorName = fnName;
  call.dataset.operatorReceiverType = typeName;
  if (site.dataset.type) call.dataset.type = site.dataset.type;

  typeRef.setAttribute('name', typeName);
  callee.setAttribute('method', fnName);
  callee.appendChild(typeRef);

  // Move args (don't clone) so nested operators captured by an outer
  // querySelectorAll iteration remain reachable and get lowered too.
  for (const arg of argNodes) if (arg) argList.appendChild(arg);

  call.appendChild(callee);
  call.appendChild(argList);
  return call;
}
