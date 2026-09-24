import { typeEntryDecl } from './type-entries.js';
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
  // A bare null branch adopts the nullable form of the other branch. This is
  // what lets `if flag { value } else { null }` infer `?T` without requiring
  // the legacy `T.null` spelling.
  if (a === 'null' && b !== 'null') return isNullable(b) ? b : `?${b}`;
  if (b === 'null' && a !== 'null') return isNullable(a) ? a : `?${a}`;
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

  const foreign = ctx.typeIndex?.get(unwrapNullable(actual));
  if (foreign?.foreign && (!isNullable(actual) || isNullable(expected))) {
    const parents = [...foreign.foreignBases ?? []], seen = new Set();
    for (let i = 0; i < parents.length; i++) {
      if (parents[i] === unwrapNullable(expected)) return true;
      if (seen.has(parents[i])) continue;
      seen.add(parents[i]); parents.push(...ctx.typeIndex.get(parents[i])?.foreignBases ?? []);
    }
  }

  // Declaration-level structure: `any` flows both ways, `Function` and `object`
  // accept host references, and unions accept any reference-represented member.
  const target = ctx.typeIndex?.get(unwrapNullable(expected));
  if (target?.foreign && (!isNullable(actual) || isNullable(expected))) {
    const source = ctx.typeIndex?.get(unwrapNullable(actual));
    const closure = callableParts(unwrapNullable(actual))?.kind === 'cl';
    const host = source?.foreign || source?.typeRepr === 'wasm-stringref' || closure;
    if (host && (target.foreignDynamic || source?.foreignDynamic)) return true;
    if (target.foreignTop === 'function' && closure) return true;
    if (target.foreignTop === 'object' && (source?.foreign || closure)) return true;
    // `Map<Str, F64>` is a `Map<any, any>`: `any` arguments accept any instantiation.
    if (source?.foreignTemplate && source.foreignTemplate === target.foreignTemplate
      && target.foreignArguments.every((arg, i) => arg === source.foreignArguments[i]
        || ctx.typeIndex.get(unwrapNullable(arg))?.foreignDynamic)) return true;
    if (target.foreignUnion?.some(member => member !== unwrapNullable(expected)
      && isAssignable(unwrapNullable(actual), member, ctx))) return true;
  }

  // Strings and closures already have host-reference representations. Widening
  // them to an opaque JS value needs no allocation, adapter, or coercion call.
  const hostTarget = ctx.typeIndex?.get(unwrapNullable(expected))?.typeRepr === 'wasm-externref' && !ctx.typeIndex?.get(unwrapNullable(expected))?.foreign;
  const hostSource = ctx.typeIndex?.get(unwrapNullable(actual))?.foreign
    || ctx.typeIndex?.get(unwrapNullable(actual))?.typeRepr === 'wasm-stringref'
    || callableParts(unwrapNullable(actual))?.kind === 'cl';
  if (hostTarget && hostSource && (!isNullable(actual) || isNullable(expected))) return true;

  const sourceClosure = callableParts(actual), targetClosure = callableParts(expected);
  if (sourceClosure?.kind === 'cl' && targetClosure?.kind === 'cl'
      && sourceClosure.params.length === targetClosure.params.length
      && sourceClosure.params.every((p, i) => isAssignable(targetClosure.params[i], p, ctx))
      && isAssignable(sourceClosure.ret, targetClosure.ret, ctx)) return true;

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
  if (expectedDecl?.localName === 'ir-proto') {
    const implementor = actualDecl?.localName === 'ir-variant' ? actualDecl.parentElement : actualDecl;
    const implementations = implementor?.querySelector(':scope > ir-impl-list');
    const names = new Set((implementations?.getAttribute('impls') ?? '').split(',').map(name => name.trim()).filter(Boolean));
    for (const ref of implementations?.querySelectorAll('ir-type-ref') ?? []) names.add(ref.getAttribute('name'));
    return names.has(expected);
  }
  return false;
}
