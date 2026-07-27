// type-contexts.js — where a declared type meets a value
//
// Every entry here is one edge of the binding graph described in
// docs/type-graph.md: a declared type on one side, the expression it binds on
// the other, and the declaration that supplied it. Four consumers need exactly
// this list —
//
//   • literal typing    `let x: I64 = 0` types the literal as I64
//   • closure decay     `let c: cl(I32) I32 = double` wraps the function
//   • expectation recording, which stamps the edge onto the IR
//   • validation, which compares the two ends and blames along the edge
//
// — and before this module existed they each carried their own copy. The copies
// disagreed every time: decay missed return position, struct fields and
// assignment; literal typing and decay both missed method-call arguments, so
// `b.set64(7)` rejected a perfectly good integer literal.
//
// The enumeration needs only declared types and resolved bindings, so it is
// valid any time after resolveBindings — before inference (literal typing) or
// after it (decay, validation).

import {
  bodyOf, declaredTypeStr, directCalleeDecl, firstTypeChild, fnReturnType,
  isFunctionDecl, paramsOf, typeNodeToStr,
} from './ir-helpers.js';
import { unwrapNullable } from './type-strings.js';

/**
 * Call `visit(value, declaredType, site, source)` for every place a declared
 * type constrains an expression.
 *
 *   value        the expression being constrained
 *   declaredType the type string it must satisfy
 *   site         'binding' | 'assign' | 'argument' | 'field' | 'return'
 *   source       the declaration that supplied the type — what blame points at
 *
 * @param {Element} root
 * @param {object}  opts
 * @param {Map}     opts.typeIndex  type registry, for struct field types
 */
export function forEachTypeContext(root, { typeIndex } = {}, visit) {
  const doc = root.ownerDocument;
  const fnIndex = buildFnIndex(root);

  // let / global: the annotation binds the initialiser.
  for (const binding of root.querySelectorAll('ir-let, ir-global')) {
    const declared = declaredTypeStr(binding);
    if (declared) visit(binding.lastElementChild, declared, 'binding', firstTypeChild(binding) ?? binding);
  }

  // assignment: the target's declared type binds the value.
  for (const assign of root.querySelectorAll('ir-assign')) {
    const [lhs, rhs] = [...assign.children];
    const target = assignTarget(lhs, doc, typeIndex);
    if (target) visit(rhs, target.type, 'assign', target.source);
  }

  // call arguments: each parameter declaration binds its argument.
  for (const call of root.querySelectorAll('ir-call')) {
    const fn = calleeDecl(call, doc, fnIndex);
    if (!fn) continue;
    const params = paramsOf(fn);
    const args = [...(call.querySelector(':scope > ir-arg-list')?.children ?? [])];
    // A method invoked through its static name carries the receiver as the
    // first argument, so parameters line up one to the right.
    const offset = receiverIsFirstArg(call, fn, params, args) ? 1 : 0;
    params.forEach((param, i) => {
      const declared = declaredTypeStr(param);
      const arg = args[i + offset];
      if (declared && arg) visit(arg, declared, 'argument', param);
    });
  }

  // struct literals: each field declaration binds its initialiser.
  for (const init of root.querySelectorAll('ir-struct-init')) {
    const entry = typeIndex?.get(init.getAttribute('type-name'));
    if (!entry?.fields) continue;
    const declNodes = fieldDeclNodes(entry);
    const byName = new Map(entry.fields.map(field => [field.name, field.type]));
    for (const fieldInit of init.querySelectorAll(':scope > ir-field-init')) {
      const name = fieldInit.getAttribute('field');
      const declared = byName.get(name);
      if (declared) visit(fieldInit.firstElementChild, declared, 'field', declNodes.get(name) ?? entry.decl);
    }
  }

  // return position: the declared return type binds the tail and every return.
  for (const surface of root.querySelectorAll('ir-fn, ir-export-main, ir-closure')) {
    const declared = surface.localName === 'ir-closure'
      ? typeNodeToStr(firstTypeChild(surface))
      : fnReturnType(surface);
    if (!declared || declared === 'void') continue;
    const body = bodyOf(surface);
    if (!body) continue;
    const source = firstTypeChild(surface) ?? surface;
    visit(body.lastElementChild, declared, 'return', source);
    // Only returns belonging to this body — a nested closure has its own.
    for (const ret of body.querySelectorAll('ir-return')) {
      if (ret.closest('ir-fn, ir-export-main, ir-closure') === surface) {
        visit(ret.firstElementChild, declared, 'return', source);
      }
    }
  }
}

// ── Callee resolution ─────────────────────────────────────────────────────────

/** Every function keyed by declared name, for resolving `Type.method`. */
function buildFnIndex(root) {
  const index = new Map();
  for (const fn of root.querySelectorAll('ir-fn, ir-extern-fn')) {
    const name = fn.getAttribute('name');
    if (name) index.set(name, fn);
  }
  return index;
}

/**
 * The declaration a call targets.
 *
 * Three routes, because this runs both before and after method resolution: the
 * `data-fn-id` stamped by resolve-methods when it is available, a plain
 * identifier callee, and otherwise a method looked up by the receiver's type.
 * The last is what lets literal typing reach method arguments before inference
 * has run.
 */
function calleeDecl(call, doc, fnIndex) {
  if (call.dataset.fnId) {
    const byId = doc.getElementById(call.dataset.fnId);
    if (isFunctionDecl(byId)) return byId;
  }
  const direct = directCalleeDecl(call, doc);
  if (direct) return direct;

  const callee = call.firstElementChild;
  if (callee?.localName !== 'ir-field-access') return null;
  const recvType = receiverType(callee.firstElementChild, doc);
  if (!recvType) return null;
  return fnIndex.get(`${recvType}.${callee.getAttribute('field')}`) ?? null;
}

/**
 * A receiver's type, taken from its declaration when possible so this works
 * before inference, and from the stamped type afterwards.
 */
function receiverType(node, doc) {
  const declared = bindingTypeOf(node, doc) ?? node?.dataset?.['typeName'];
  return declared ? unwrapNullable(declared) : null;
}

function receiverIsFirstArg(call, fn, params, args) {
  return call.dataset.resolvedAs === 'static-method'
    && fn.querySelector(':scope > ir-fn-name')?.getAttribute('kind') === 'method'
    && args.length === params.length + 1;
}

// ── Assignment targets ────────────────────────────────────────────────────────

/**
 * Declared type of an assignment target, and the declaration that stated it.
 *
 * Resolved through declarations rather than through stamped types, so this
 * works before inference has run as well as after — which is what lets the
 * literal pass and the later passes share one enumeration.
 */
function assignTarget(lhs, doc, typeIndex) {
  if (!lhs) return null;
  if (lhs.localName === 'ir-ident') {
    const decl = bindingDecl(lhs, doc);
    const type = decl ? declaredTypeStr(decl) ?? decl.dataset?.['typeName'] : null;
    return type ? { type, source: firstTypeChild(decl) ?? decl } : null;
  }
  if (lhs.localName === 'ir-field-access') {
    const owner = receiverType(lhs.firstElementChild, doc);
    const entry = typeIndex?.get(owner);
    const field = entry?.fields?.find(f => f.name === lhs.getAttribute('field'));
    if (!field) return null;
    return { type: field.type, source: fieldDeclNodes(entry).get(field.name) ?? entry.decl };
  }
  const type = lhs.dataset?.['typeName'];
  return type ? { type, source: lhs } : null;
}

function bindingDecl(node, doc) {
  const id = node?.dataset?.bindingId;
  return id ? doc.getElementById(id) : null;
}

function bindingTypeOf(node, doc) {
  const decl = bindingDecl(node, doc);
  return decl ? declaredTypeStr(decl) ?? decl.dataset?.['typeName'] ?? null : null;
}

/** field name → its declaration node, for pointing blame at the field. */
function fieldDeclNodes(entry) {
  const map = new Map();
  for (const field of entry?.decl?.querySelectorAll(':scope > ir-field') ?? []) {
    const name = field.getAttribute('name');
    if (name) map.set(name, field);
  }
  return map;
}
