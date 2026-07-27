// type-contexts.js — where a declared type meets a value
//
// Every entry here is one edge of the binding graph described in
// docs/type-graph.md: a declared type on one side, the expression it binds on
// the other. Two passes need exactly this list —
//
//   • literal typing   `let x: I64 = 0` types the literal as I64
//   • closure decay    `let c: cl(I32) I32 = double` wraps the function
//
// — and before this module existed they each carried their own copy. The copies
// disagreed: decay handled `let`, globals, and call arguments, but not return
// position, struct fields, or assignment, so `fn f() cl(I32) I32 { double; }`
// passed the typechecker and then crashed the backend. Any future pass that
// asks "where does a declared type reach a value?" should consume this rather
// than grow a third copy.
//
// The enumeration needs only declared types and resolved bindings, so it is
// valid any time after resolveBindings — before inference (literal typing) or
// after it (decay).

import { bodyOf, declaredTypeStr, directCalleeDecl, firstTypeChild, fnReturnType, paramsOf, typeNodeToStr } from './ir-helpers.js';
import { unwrapNullable } from './type-strings.js';

/**
 * Call `visit(valueNode, declaredType, site)` for every place a declared type
 * constrains an expression.
 *
 * @param {Element} root      document root
 * @param {object}  opts
 * @param {Map}     opts.typeIndex  type registry, for struct field types
 */
export function forEachTypeContext(root, { typeIndex } = {}, visit) {
  const doc = root.ownerDocument;

  // let / global: the annotation binds the initialiser.
  for (const binding of root.querySelectorAll('ir-let, ir-global')) {
    const declared = declaredTypeStr(binding);
    if (declared) visit(binding.lastElementChild, declared, 'binding');
  }

  // assignment: the target's declared type binds the value.
  for (const assign of root.querySelectorAll('ir-assign')) {
    const [lhs, rhs] = [...assign.children];
    const declared = assignTargetType(lhs, doc, typeIndex);
    if (declared) visit(rhs, declared, 'assign');
  }

  // call arguments: each parameter declaration binds its argument.
  for (const call of root.querySelectorAll('ir-call')) {
    const fn = directCalleeDecl(call, doc);
    if (!fn) continue;
    const params = paramsOf(fn);
    const args = [...(call.querySelector(':scope > ir-arg-list')?.children ?? [])];
    args.forEach((arg, i) => {
      const declared = params[i] ? declaredTypeStr(params[i]) : null;
      if (declared) visit(arg, declared, 'argument');
    });
  }

  // struct literals: each field declaration binds its initialiser.
  for (const init of root.querySelectorAll('ir-struct-init')) {
    const fields = typeIndex?.get(init.getAttribute('type-name'))?.fields;
    if (!fields) continue;
    const byName = new Map(fields.map(field => [field.name, field.type]));
    for (const fieldInit of init.querySelectorAll(':scope > ir-field-init')) {
      const declared = byName.get(fieldInit.getAttribute('field'));
      if (declared) visit(fieldInit.firstElementChild, declared, 'field');
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
    visit(body.lastElementChild, declared, 'return');
    // Only returns belonging to this body — a nested closure has its own.
    for (const ret of body.querySelectorAll('ir-return')) {
      if (ret.closest('ir-fn, ir-export-main, ir-closure') === surface) {
        visit(ret.firstElementChild, declared, 'return');
      }
    }
  }
}

/**
 * Declared type of an assignment target: a binding, or a struct field.
 *
 * Resolved through declarations rather than through stamped types, so this
 * works before inference has run as well as after — which is what lets the
 * literal pass and the decay pass share one enumeration despite running on
 * either side of it.
 */
function assignTargetType(lhs, doc, typeIndex) {
  if (!lhs) return null;
  if (lhs.localName === 'ir-ident') return bindingTypeOf(lhs, doc);
  if (lhs.localName === 'ir-field-access') {
    const owner = bindingTypeOf(lhs.firstElementChild, doc)
      ?? lhs.firstElementChild?.dataset?.['typeName'];
    const fields = typeIndex?.get(unwrapNullable(owner))?.fields;
    return fields?.find(field => field.name === lhs.getAttribute('field'))?.type ?? null;
  }
  return lhs.dataset?.['typeName'] ?? null;
}

function bindingTypeOf(node, doc) {
  const id = node?.dataset?.bindingId;
  if (!id) return null;
  const decl = doc.getElementById(id);
  return decl ? declaredTypeStr(decl) ?? decl.dataset?.['typeName'] ?? null : null;
}


