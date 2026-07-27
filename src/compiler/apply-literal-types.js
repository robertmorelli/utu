// apply-literal-types.js — give numeric literals the type their context declares
//
// `let x: I64 = 0` must not fail. A numeric literal has no inherent width;
// std/LiteralDefaults.utu supplies a type only for when nothing better is
// known, and a declared context is something better.
//
// This is the one place where context *determines* a type rather than checking
// one, so it is a binding into `type(literal)` — see docs/type-graph.md. It
// runs before inference for exactly that reason: the literal's type feeds every
// enclosing expression, so it has to be settled first.
//
// Which types a literal may adopt is declared by the stdlib and matched by
// name. `Bool` is a wasm i32 exactly like `I32` is and is deliberately not an
// integer type, so `takes_bool(1)` stays an error. Keying on representation
// would silently accept it — the bug class TYPES.md exists to prevent.

import { collectLiteralAdopters } from './infer-type-helpers.js';
import { forEachTypeContext } from './type-contexts.js';
import { unwrapNullable } from './type-strings.js';

/**
 * @param {Document} doc
 * @param {Map<string, object>} typeIndex
 */
export function applyLiteralTypes(doc, typeIndex) {
  const root = doc?.body?.firstChild;
  if (!root) return;
  const adopters = collectLiteralAdopters(root);
  if (adopters.size === 0) return;

  forEachTypeContext(root, { typeIndex }, (value, declaredType) => {
    const literal = unwrapParens(value);
    if (literal?.localName !== 'ir-lit') return;
    // An explicit `type-name` is either a stdlib @ir template pinning the type
    // or a context already applied; either way it wins.
    if (literal.getAttribute('type-name')) return;

    const wanted = unwrapNullable(declaredType);
    if (!adopters.get(literal.getAttribute('kind'))?.has(wanted)) return;

    // Set the attribute, not data-type-name: inference reads this as the
    // literal's pinned type, so nothing later overwrites it.
    literal.setAttribute('type-name', wanted);
    literal.dataset.literalContext = 'true';
  });
}

function unwrapParens(node) {
  let current = node;
  while (current?.localName === 'ir-paren') current = current.firstElementChild;
  return current;
}
