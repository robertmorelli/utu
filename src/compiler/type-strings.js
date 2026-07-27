// type-strings.js — pure operations on utu type strings
//
// Types travel through the compiler as strings (`I32`, `?Point`, `Array[I32]`,
// `cl(I32) Bool`), so the handful of operations on that spelling live here.
//
// Deliberately dependency-free. Every layer needs these — the registry, the
// type rules, the IR helpers, the DSL signature reader, every analysis pass,
// and all of codegen — and several of those already import each other, so
// anything with imports of its own would cycle. That is exactly why the
// nullable helpers ended up re-implemented inline in 30-odd places: the one
// definition lived somewhere codegen could not reach.
//
// Splitting is bracket-aware in both directions. A parameter may itself be
// callable (`cl(fun(I32) I32) void`) or instantiated (`cl(Array[I32, F64]) I32`),
// and naive comma splitting silently truncates both.

/**
 * Type names that need no declaration when *written in source*.
 *
 * Only `void`: every named source type, stdlib scalars included, resolves
 * through the registry as an ordinary type reference.
 */
export const SOURCE_PRIMITIVES = Object.freeze(new Set(['void']));

/**
 * Type names that are valid as an *inferred* type without a registry entry.
 *
 * Wider than SOURCE_PRIMITIVES by exactly `null`, which is the type of the
 * `null` literal and of `T.null` before a context narrows it. It is inferrable
 * but not writable — `let x: null = …` is not a type anyone can spell — so the
 * two sets legitimately differ. They previously sat in two files as unrelated
 * constants that looked like they had drifted apart.
 */
export const INFERRED_PRIMITIVES = Object.freeze(new Set(['void', 'null']));

/** Whether a type carries no operators, so operator lowering must skip it. */
export function isOperandless(typeName) {
  return !typeName || INFERRED_PRIMITIVES.has(typeName);
}

/** `?Point` → `Point`; anything else unchanged. */
export function unwrapNullable(typeStr) {
  return typeStr?.startsWith('?') ? typeStr.slice(1) : typeStr;
}

export function isNullable(typeStr) {
  return typeStr?.startsWith('?') ?? false;
}

const CALLABLE_PREFIX = /^(fun|cl)\(/;

/** `fun(I32) Bool` → `{ kind: 'fun', params: ['I32'], ret: 'Bool' }`, else null. */
export function callableParts(typeStr) {
  if (typeof typeStr !== 'string') return null;
  const match = CALLABLE_PREFIX.exec(typeStr);
  if (!match) return null;

  const open = match[0].length - 1;
  let depth = 0;
  let close = -1;
  for (let i = open; i < typeStr.length; i++) {
    if (typeStr[i] === '(') depth++;
    else if (typeStr[i] === ')' && --depth === 0) { close = i; break; }
  }
  if (close === -1) return null;

  return {
    kind: match[1],
    params: splitTypeList(typeStr.slice(open + 1, close)),
    ret: typeStr.slice(close + 1).trim() || 'void',
  };
}

export function isCallableType(typeStr) {
  return callableParts(typeStr) !== null;
}

export function callableTypeStr(kind, params, ret) {
  return `${kind}(${params.join(', ')}) ${ret || 'void'}`;
}

/** Split a comma-separated type list, ignoring commas nested in `()` or `[]`. */
export function splitTypeList(text) {
  if (!text) return [];
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}
