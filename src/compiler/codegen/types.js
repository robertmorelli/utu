// codegen/types.js — utu type strings / scalar kinds → binaryen type ids
//
// The compiler stamps `data-type` strings like "i32", "f64", "bool", "void",
// "?Foo", or a struct/array name. This module maps those strings to the
// numeric type ids used by binaryen.js.
//
// This file is the ONE legitimate place in the compiler that hardcodes
// knowledge of wasm scalar kinds: binaryen.js exposes five scalar
// namespaces (`m.i32`, `m.i64`, `m.f32`, `m.f64`, `m.v128`) with
// corresponding type ids, and the `kind` attribute on
// `<ir-wasm-scalar kind="..."/>` in the stdlib is the handshake name.
// Every other codegen site resolves scalar facts by looking up a name
// in a registry — the registry is built from the stdlib declarations
// at compile time, and this module provides the only kind→wasm mapping.
//
// Entry points:
//   utuToBinaryenType(typeStr)
//     Minimal fallback for compiler-only type spellings like `void`.
//   scalarKindToBinaryenType(kind)
//     Maps an ir-wasm-scalar `kind="..."` attribute to a binaryen primitive.
//   scalarKindToBinaryenNamespace(kind)
//     Maps a kind to the binaryen JS namespace name (`'i32' | 'i64' |
//     'f32' | 'f64' | 'v128'`).  Use the returned string as `m[ns]` to
//     pick the right family of ops (e.g. `m.i32.add(...)`).
//   makeTypeMapper(structTypes)
//     Returns a `(typeStr) => binaryen type id` closure that resolves type
//     names through the registry built by `buildModule()` (see ./index.js).
//
// Reference types still throw when unknown — we want the gap to surface the
// moment a test exercises an un-implemented type rather than silently emit
// garbage.

import binaryen from 'binaryen';
import { firstTypeChild, typeNodeToStr, fnReturnType } from '../ir-helpers.js';

// Re-export so codegen modules can import everything type-related from one
// place without crossing a directory boundary on every line.
export { typeNodeToStr, fnReturnType, binaryen };

export function utuToBinaryenType(typeStr) {
  if (!typeStr) return binaryen.none;
  if (typeStr === 'void') return binaryen.none;
  throw new Error(`codegen: unsupported builtin type "${typeStr}"`);
}

export function scalarKindToBinaryenType(kind) {
  const ns = scalarKindToBinaryenNamespace(kind);
  return ns == null ? null : binaryen[ns];
}

/**
 * The wasm has exactly five scalar-op families: i32, i64, f32, f64, v128.
 * Every scalar kind declared by the stdlib maps to one of them.  Signed vs
 * unsigned integer types share a family (the sign lives on the op, not the
 * type); bool / m32 / m64 / m128 are just width-tagged aliases for the
 * corresponding integer family.
 *
 * @param {string} kind  value of `<ir-wasm-scalar kind="..."/>`
 * @returns {string|null}  the `m[ns]` namespace name, or null if unknown.
 */
export function scalarKindToBinaryenNamespace(kind) {
  switch (kind) {
    case 'i32':
    case 'u32':
    case 'bool':
    case 'm32':
      return 'i32';
    case 'i64':
    case 'u64':
    case 'm64':
      return 'i64';
    case 'f32':
      return 'f32';
    case 'f64':
      return 'f64';
    case 'v128':
    case 'm128':
      return 'v128';
    default:
      return null;
  }
}

/**
 * Map an `<ir-wasm-ref kind="..."/>` kind attribute to the binaryen ref-type
 * id.  Like `scalarKindToBinaryenNamespace`, this is the ONE legitimate place
 * the compiler hardcodes ref-kind knowledge: binaryen.js exposes a fixed set
 * of WasmGC reference types (externref, stringref, i31ref, …) and the `kind`
 * attribute on `<ir-wasm-ref>` in the stdlib is the handshake name.  All
 * other codegen sites resolve ref kinds via the registry built from stdlib
 * declarations at compile time.
 *
 * @param {string} kind  value of `<ir-wasm-ref kind="..."/>`
 * @returns {number|null}  binaryen type id, or null if unknown.
 */
export function refKindToBinaryenType(kind) {
  switch (kind) {
    case 'extern': return binaryen.externref;
    case 'string': return binaryen.stringref;
    case 'i31':    return binaryen.i31ref;
    default:       return null;
  }
}

/**
 * Build a closure that resolves any utu type string the codegen needs:
 * scalars, struct names, and nullable variants like "?Foo".
 *
 * @param {Map<string, StructTypeInfo>} structTypes  from buildHeapTypes()
 *   for the StructTypeInfo shape.
 * @returns {(typeStr: string) => number}  binaryen type id
 */
export function makeTypeMapper(structTypes) {
  return function toType(typeStr) {
    if (!typeStr) return binaryen.none;
    if (typeStr === 'void') return binaryen.none;

    // Nullable prefix: "?Foo" — strip and use the nullable ref form.
    let nullable = false;
    let name = typeStr;
    if (name.startsWith('?')) { nullable = true; name = name.slice(1); }

    const info = structTypes.get(name);
    if (info?.binaryenType != null) {
      if (nullable) throw new Error(`codegen: scalar type "${name}" cannot be nullable`);
      return info.binaryenType;
    }
    if (info) return nullable ? info.nullableRefType : info.refType;

    throw new Error(`codegen: unsupported type "${typeStr}" (no stdlib type-def or heap type match)`);
  };
}

/**
 * Build a `(typeName) => binaryenNamespace | null` lookup against the
 * stdlib-sourced type registry.  Consumed anywhere codegen needs to pick a
 * `m[ns]` namespace (literal constants, numeric comparisons, arithmetic)
 * from a utu type name.  Returns null for non-scalar names.
 *
 * The registry entries are populated by `buildHeapTypes` — which walks
 * every `:scope > ir-type-def > ir-wasm-scalar` in the document — so the
 * set of names this function recognises is exactly the set declared by
 * the stdlib.  No parallel table; no parallel opinion.
 *
 * @param {Map<string, StructTypeInfo>} structTypes
 * @returns {(typeStr: string) => (string|null)}
 */
export function makeScalarNamespaceLookup(structTypes) {
  return function scalarNamespaceOf(typeStr) {
    if (!typeStr) return null;
    const name = typeStr.startsWith('?') ? typeStr.slice(1) : typeStr;
    return structTypes.get(name)?.binaryenNamespace ?? null;
  };
}

/**
 * Build a `Set<kind>` of every wasm scalar kind the stdlib has declared.
 * Used by the intrinsic dispatcher to answer "is `<ir-i64-foo>` a known
 * scalar tag?" without hardcoding a kind list of its own.
 *
 * @param {Map<string, StructTypeInfo>} structTypes
 * @returns {Set<string>}
 */
export function collectScalarKinds(structTypes) {
  const kinds = new Set();
  for (const info of structTypes.values()) {
    if (info?.scalarKind) kinds.add(info.scalarKind);
  }
  return kinds;
}

/**
 * Read the declared type of a binding-bearing node (ir-param, ir-let,
 * ir-global) by finding its first ir-type-* child.  Returns the type string
 * or null when no annotation is present.
 */
export function declaredTypeStr(node) {
  return typeNodeToStr(firstTypeChild(node));
}
