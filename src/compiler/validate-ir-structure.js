import { matchScalarIntrinsic } from './codegen/intrinsics.js';

const BUILTIN_TYPES = new Set(['void', 'null']);

const UNARY_INTRINSICS = new Set([
  'abs', 'ceil', 'clz', 'ctz', 'eqz', 'floor', 'nearest', 'neg', 'not',
  'popcnt', 'sqrt', 'trunc',
  'any_true',
]);

const TERNARY_INTRINSICS = new Set(['bitselect']);
const NULLARY_INTRINSICS = new Set(['const']);

/**
 * Assert mechanical IR shape invariants. This pass intentionally throws:
 * callers only run it under debug assertions, where a loud compiler bug is
 * better than letting malformed IR drift into later passes.
 *
 * @param {Document} doc
 * @param {object} [opts]
 * @param {Map<string, Element>} [opts.typeIndex]
 * @param {string} [opts.phase]
 * @param {boolean} [opts.requireBindings]
 */
export function validateIrStructure(doc, opts = {}) {
  const root = doc.body.firstChild;
  if (!root) return;

  const { typeIndex = null, phase = 'unknown', requireBindings = false, target = 'normal' } = opts;
  const scalarKinds = typeIndex ? scalarKindsFromTypeIndex(typeIndex) : null;
  const ctx = { typeIndex, phase, requireBindings, scalarKinds, target };

  for (const rule of rulesForPhase(phase, opts)) rule(root, ctx);
}

const ALWAYS_RULES = [
  assertLiterals,
  assertExternFns,
];

const RULES_BY_PHASE = new Map([
  ['resolveBindings', [assertBindings]],
  ['resolveMethods', [assertCalls]],
  ['lowerBackendControl', [assertNoResidualBackendControl]],
]);

function rulesForPhase(phase, opts) {
  const rules = [...ALWAYS_RULES];
  const completed = completedPhaseKeys(phase);
  if (opts.requireBindings || completed.has('resolveBindings')) rules.push(...RULES_BY_PHASE.get('resolveBindings'));
  if (completed.has('resolveMethods')) rules.push(...RULES_BY_PHASE.get('resolveMethods'));
  if (completed.has('lowerBackendControl')) rules.push(...RULES_BY_PHASE.get('lowerBackendControl'));
  if (opts.typeIndex) rules.push(assertTypes, assertScalarIntrinsics);
  rules.push(assertSourceLocations);
  return rules;
}

function completedPhaseKeys(phase) {
  const base = phase.replace(/#\d+$/, '');
  const order = ['resolveBindings', 'resolveMethods', 'lowerBackendControl'];
  const index = order.indexOf(base);
  return new Set(index < 0 ? [] : order.slice(0, index + 1));
}

function assertCalls(root, { phase }) {
  for (const call of root.querySelectorAll('ir-call')) {
    if (hasDiagnostic(call)) continue;
    const children = [...call.children];
    const argLists = children.filter((child) => child.localName === 'ir-arg-list');
    if (children.length < 1 || children.length > 2 || argLists.length > 1 || (argLists.length === 1 && children[1]?.localName !== 'ir-arg-list')) {
      fail(phase, call, 'ir-call must have exactly callee + ir-arg-list children');
    }
    if (children[0]?.localName === 'ir-arg-list') {
      fail(phase, call, 'ir-call callee cannot be ir-arg-list');
    }
  }
}

function hasDiagnostic(node) {
  return Boolean(node.dataset.errorKind || node.querySelector('[data-error-kind]'));
}

function assertLiterals(root, { phase }) {
  for (const lit of root.querySelectorAll('ir-lit')) {
    if (lit.children.length !== 0) {
      fail(phase, lit, 'ir-lit must not have element children');
    }
  }
}

function assertExternFns(root, { phase }) {
  for (const fn of root.querySelectorAll('ir-extern-fn')) {
    if (!fn.getAttribute('name')) {
      fail(phase, fn, 'ir-extern-fn must have a name attribute');
    }
    if (!fn.dataset.extern) {
      fail(phase, fn, 'ir-extern-fn must have data-extern');
    }
    if (!fn.dataset.importModule || !fn.dataset.importName) {
      fail(phase, fn, 'ir-extern-fn must have data-import-module and data-import-name');
    }
    const fnName = fn.querySelector(':scope > ir-fn-name');
    if (!fnName?.getAttribute('name')) {
      fail(phase, fn, 'ir-extern-fn must have an ir-fn-name child');
    }
    const paramLists = fn.querySelectorAll(':scope > ir-param-list');
    if (paramLists.length !== 1) {
      fail(phase, fn, 'ir-extern-fn must have exactly one ir-param-list child');
    }
    if (fn.querySelector(':scope > ir-block')) {
      fail(phase, fn, 'ir-extern-fn must not have an ir-block body');
    }
    const signatureChildren = [...fn.children].filter(child =>
      child.localName?.startsWith('ir-type-') ||
      child.localName === 'ir-param-list' ||
      child.localName === 'ir-fn-name'
    );
    if (signatureChildren.length !== fn.children.length) {
      fail(phase, fn, 'ir-extern-fn may only contain ir-fn-name, ir-param-list, and return type children');
    }
    const returnTypes = [...fn.children].filter(child => child.localName?.startsWith('ir-type-'));
    if (returnTypes.length !== 1) {
      fail(phase, fn, 'ir-extern-fn must have exactly one return type child');
    }
  }
}

function assertSourceLocations(root, { phase }) {
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (!node.localName?.startsWith('ir-')) continue;
    if (!node.dataset.row || !node.dataset.col || !node.dataset.endRow || !node.dataset.endCol || !node.dataset.sourceFile) {
      fail(phase, node, 'must have data-row, data-col, data-end-row, data-end-col, and data-source-file');
    }
  }
}

function assertBindings(root, { phase }) {
  for (const ident of root.querySelectorAll('ir-ident')) {
    if (ident.dataset.error) continue;
    if (!ident.dataset.bindingId) {
      fail(phase, ident, 'ir-ident must have data-binding-id after binding resolution');
    }
  }
}

function assertTypes(root, { typeIndex, phase }) {
  for (const node of root.querySelectorAll('[data-type]')) {
    const type = node.dataset.type;
    if (type && !resolvesType(type, typeIndex)) {
      fail(phase, node, `data-type "${type}" does not resolve in the type registry`);
    }
  }
}

function assertScalarIntrinsics(root, { scalarKinds, phase }) {
  for (const node of root.querySelectorAll('*')) {
    const intr = matchScalarIntrinsic(node.localName, scalarKinds);
    if (!intr) continue;
    const expected = scalarIntrinsicArity(intr.op);
    if (node.children.length !== expected) {
      fail(phase, node, `<${node.localName}> expects ${expected} operand children, got ${node.children.length}`);
    }
  }
}

function assertNoResidualBackendControl(root, { phase, target }) {
  if (target === 'analysis') return;
  for (const node of root.querySelectorAll('ir-alt, ir-promote, ir-binary, ir-unary')) {
    fail(phase, node, `<${node.localName}> must be lowered before backend codegen`);
  }
}

function resolvesType(type, typeIndex) {
  const name = type.startsWith('?') ? type.slice(1) : type;
  return BUILTIN_TYPES.has(name) || typeIndex.has(name);
}

function scalarKindsFromTypeIndex(typeIndex) {
  const kinds = new Set();
  for (const decl of typeIndex.values()) {
    const scalar = decl.localName === 'ir-type-def'
      ? decl.querySelector(':scope > ir-wasm-scalar')
      : null;
    const kind = scalar?.getAttribute('kind');
    if (kind) kinds.add(kind);
  }
  return kinds;
}

function scalarIntrinsicArity(op) {
  if (NULLARY_INTRINSICS.has(op)) return 0;
  if (TERNARY_INTRINSICS.has(op)) return 3;
  if (UNARY_INTRINSICS.has(op)) return 1;
  return 2;
}

function fail(phase, node, message) {
  const id = node.id ? `#${node.id}` : '';
  throw new Error(`IR structural assertion failed after ${phase}: <${node.localName}${id}> ${message}`);
}
