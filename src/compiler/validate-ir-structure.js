import { matchScalarIntrinsic } from './codegen/intrinsics.js';
import { callableParts, INFERRED_PRIMITIVES } from './type-rules.js';
import { collectScalarKinds } from './link-type-decls.js';
import { unwrapNullable } from './type-strings.js';
import { bodyOf } from './ir-helpers.js';
import { retainedGraphs } from './graph-store.js';

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
 * @param {Map<string, object>} [opts.typeIndex]
 * @param {string} [opts.phase]
 * @param {boolean} [opts.requireBindings]
 */
export function validateIrStructure(doc, opts = {}) {
  const root = doc.body.firstChild;
  if (!root) return;

  const { typeIndex = null, phase = 'unknown', requireBindings = false, target = 'normal' } = opts;
  const scalarKinds = typeIndex ? collectScalarKinds(typeIndex) : null;
  const ctx = { typeIndex, phase, requireBindings, scalarKinds, target };

  for (const rule of rulesForPhase(phase, opts)) rule(root, ctx);
}

const ALWAYS_RULES = [
  assertLiterals,
  assertExternFns,
];

function rulesForPhase(phase, opts) {
  const rules = [...ALWAYS_RULES];
  const base = phase.replace(/#\d+$/, '');
  if (opts.requireBindings || base === 'resolveBindings') rules.push(assertBindings);
  if (base === 'resolveMethods' || base === 'lowerBackendControl') rules.push(assertCalls);
  if (base === 'lowerBackendControl') rules.push(assertNoResidualBackendControl);
  if (opts.typeIndex) rules.push(assertTypes, assertScalarIntrinsics);
  return [...rules, assertSourceLocations];
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
  if (node.dataset.errorKind || node.querySelector('[data-error-kind]')) return true;
  // Debug structural validation can run before graph diagnostics have been
  // projected onto the DOM. Consult canonical failures as well, otherwise an
  // ordinary bad program is misreported as a compiler invariant crash.
  const failures = retainedGraphs(node.ownerDocument).types?.failures ?? [];
  return failures.some(failure => failure.node === node || node.contains(failure.node));
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
    const signature = [...fn.children];
    const allowed = child => child.localName?.startsWith('ir-type-')
      || child.localName === 'ir-param-list' || child.localName === 'ir-fn-name';
    const checks = [
      [fn.getAttribute('name'), 'ir-extern-fn must have a name attribute'],
      [fn.dataset.extern, 'ir-extern-fn must have data-extern'],
      [fn.dataset.importModule && fn.dataset.importName, 'ir-extern-fn must have data-import-module and data-import-name'],
      [fn.querySelector(':scope > ir-fn-name')?.getAttribute('name'), 'ir-extern-fn must have an ir-fn-name child'],
      [fn.querySelectorAll(':scope > ir-param-list').length === 1, 'ir-extern-fn must have exactly one ir-param-list child'],
      [!bodyOf(fn), 'ir-extern-fn must not have an ir-block body'],
      [signature.every(allowed), 'ir-extern-fn may only contain ir-fn-name, ir-param-list, and return type children'],
      [signature.filter(child => child.localName?.startsWith('ir-type-')).length === 1, 'ir-extern-fn must have exactly one return type child'],
    ];
    const failed = checks.find(([valid]) => !valid);
    if (failed) fail(phase, fn, failed[1]);
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
  const graphs = retainedGraphs(root.ownerDocument);
  const resolutions = graphs.scope?.resolutions;
  for (const ident of root.querySelectorAll('ir-ident')) {
    if (graphs.diagnostics?.facts.has(ident.id) || ident.dataset.error) continue;
    if (!resolutions?.has(ident.id) && !ident.dataset.bindingId) {
      fail(phase, ident, 'ir-ident must have data-binding-id after binding resolution');
    }
  }
}

function assertTypes(root, { typeIndex, phase }) {
  const canonicalTypes = retainedGraphs(root.ownerDocument).types;
  for (const node of root.querySelectorAll('[data-type-name]')) {
    if (hasDiagnostic(node)) continue;
    const type = node.dataset['typeName'];
    // Canonical type slots are validated by checkTypeGraph. This assertion is
    // for orphan/stale projections, especially in standalone pass consumers.
    if (canonicalTypes?.slots.has(node)) continue;
    if (type && !resolvesType(type, typeIndex)) {
      fail(phase, node, `data-type-name "${type}" does not resolve in the type registry`);
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
    // Erroneous source forms deliberately remain in place so diagnostics keep
    // their original span. Only diagnostic-free residuals are compiler bugs.
    if (hasDiagnostic(node)) continue;
    fail(phase, node, `<${node.localName}> must be lowered before backend codegen`);
  }
}

function resolvesType(type, typeIndex) {
  const name = unwrapNullable(type);
  // Callable types are structural, not registry entries: `fun(I32) Bool` names
  // no declaration.  Validate their components instead.
  const callable = callableParts(name);
  if (callable) {
    return [...callable.params, callable.ret]
      .every(part => part === 'void' || resolvesType(part, typeIndex));
  }
  return INFERRED_PRIMITIVES.has(name) || typeIndex.has(name);
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
