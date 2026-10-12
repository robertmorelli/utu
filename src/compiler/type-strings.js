// type-strings.js — pure operations on utu type strings
//
// Types travel through the compiler as strings (`I32`, `?Point`, `Array[I32]`,
// `cl(I32) Bool`), so the handful of operations on that spelling live here.
//
// Deliberately dependency-free (the type table they read is too). Every
// layer needs these — the registry, the type rules, the IR helpers, the DSL signature reader, every analysis pass,
// and all of codegen — and several of those already import each other, so
// anything with imports of its own would cycle. That is exactly why the
// nullable helpers ended up re-implemented inline in 30-odd places: the one
// definition lived somewhere codegen could not reach.
//
// Splitting is bracket-aware in both directions. A parameter may itself be
// callable (`cl(fun(I32) I32) void`) or instantiated (`cl(Array[I32, F64]) I32`),
// and naive comma splitting silently truncates both.

import { splitTypeList, typeTable } from './type-table.js';

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
  if (typeof typeStr !== 'string' || !typeStr.startsWith('?')) return typeStr;
  const table = typeTable();
  return table.names[table.inner[table.id(typeStr)]];
}

export function isNullable(typeStr) {
  return typeStr?.startsWith('?') ?? false;
}

/** `fun(I32) Bool` → `{ kind: 'fun', params: ['I32'], ret: 'Bool' }` (frozen), else null. */
export function callableParts(typeStr) {
  if (typeof typeStr !== 'string') return null;
  const table = typeTable();
  return table.callables[table.id(typeStr)];
}

export function isCallableType(typeStr) {
  return callableParts(typeStr) !== null;
}

export function callableTypeStr(kind, params, ret) {
  return `${kind}(${params.join(', ')}) ${ret || 'void'}`;
}

/** `.{I32, F64}` → `['I32', 'F64']` (frozen), else null. */
export function tupleParts(typeStr) {
  if (typeof typeStr !== 'string') return null;
  const table = typeTable();
  return table.tuples[table.id(typeStr)];
}

export function tupleTypeStr(parts) {
  return `.{${parts.join(', ')}}`;
}

export { splitTypeList };
