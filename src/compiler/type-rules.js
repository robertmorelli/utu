import { typeEntryDecl } from './link-type-decls.js';
import { callableParts, unwrapNullable, isNullable } from './type-strings.js';

export {
  callableParts, isCallableType, callableTypeStr, splitTypeList,
  unwrapNullable, isNullable, isOperandless,
  SOURCE_PRIMITIVES, INFERRED_PRIMITIVES,
} from './type-strings.js';

export function unifyTypes(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  if (a === b) return a;
  if (isNullable(a) && unwrapNullable(a) === b) return a;
  if (isNullable(b) && unwrapNullable(b) === a) return b;
  return null;
}

function sameSignature(a, b) {
  return a.ret === b.ret
    && a.params.length === b.params.length
    && a.params.every((param, i) => param === b.params[i]);
}

export function isAssignable(actual, expected, ctx = {}) {
  if (actual === expected) return true;
  if (isNullable(expected) && actual === unwrapNullable(expected)) return true;
  if (actual === 'null' && isNullable(expected)) return true;

  // Closure decay: a function pointer becomes a closure by wrapping it in a JS
  // thunk over an empty environment.  One direction only — going the other way
  // would have to discard the environment.
  const actualFn = callableParts(actual);
  const expectedFn = callableParts(expected);
  if (actualFn && expectedFn) {
    if (actualFn.kind === expectedFn.kind) return sameSignature(actualFn, expectedFn);
    return actualFn.kind === 'fun' && expectedFn.kind === 'cl' && sameSignature(actualFn, expectedFn);
  }

  const actualDecl = typeEntryDecl(ctx.typeIndex?.get(actual));
  const expectedDecl = typeEntryDecl(ctx.typeIndex?.get(expected));
  if (actualDecl?.localName === 'ir-variant' && expectedDecl?.localName === 'ir-enum') {
    return actualDecl.parentElement === expectedDecl;
  }
  return false;
}
