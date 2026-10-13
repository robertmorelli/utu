// codegen/types.js — utu type strings / registry reprs → wasm types
//
// The compiler stamps `data-type-name` strings like "I32", "F64", "Bool", "void",
// "?Foo", or a struct/array name. This module maps those strings to the wasm
// types of the backend (../wasm/types.js).
//
// Wasm has five scalar types and a small set of builtin reference types. The
// stdlib declares which family/builtin a type uses; this file validates those
// declared names and looks the wasm types up by them.
//
// Entry points:
//   builtinWasmType(typeStr)
//     Minimal fallback for compiler-only type spellings like `void`.
//   makeTypeMapper(structTypes)
//     Returns a `(typeStr) => wasm type` closure that resolves type
//     names through the registry built by `buildModule()` (see ./index.js).
//
// Reference types still throw when unknown — we want the gap to surface the
// moment a test exercises an un-implemented type rather than silently emit
// garbage.

import { wasm } from '../wasm/index.js';
import { tupleParts } from '../type-strings.js';
import { typeNodeToStr, fnReturnType, declaredTypeStr } from '../ir-helpers.js';
import { WASM_REF_TYPES, WASM_SCALAR_FAMILIES } from '../link-type-decls.js';

// The registry owns this; re-exported so codegen keeps one type-related import.
export { collectScalarKinds } from '../link-type-decls.js';
import { unwrapNullable } from '../type-strings.js';

// Re-export so codegen modules can import everything type-related from one
// place without crossing a directory boundary on every line.
export { typeNodeToStr, fnReturnType, declaredTypeStr, wasm };

export function builtinWasmType(typeStr) {
  if (!typeStr) return wasm.none;
  if (typeStr === 'void') return wasm.none;
  throw new Error(`codegen: unsupported builtin type "${typeStr}"`);
}

export function scalarFamilyToWasmType(family) {
  assertScalarFamily(family);
  return wasm[family];
}

export function refNameToWasmType(name) {
  assertRefName(name);
  return wasm[name];
}

export function assertScalarFamily(family) {
  if (!WASM_SCALAR_FAMILIES.has(family) || wasm[family] == null) {
    throw new Error(`codegen: unsupported wasm scalar family "${family}"`);
  }
}

export function assertRefName(name) {
  if (!WASM_REF_TYPES.has(name) || wasm[name] == null) {
    throw new Error(`codegen: unsupported wasm ref type "${name}"`);
  }
}

/**
 * Build a closure that resolves any utu type-name the codegen needs by
 * looking up its backend type-repr in the codegen registry.
 *
 * @param {Map<string, StructTypeInfo>} structTypes  from buildHeapTypes()
 *   for the StructTypeInfo shape.
 * @returns {(typeStr: string) => number}  wasm type id
 */
export function makeTypeMapper(structTypes) {
  return function toType(typeStr) {
    if (!typeStr) return wasm.none;
    if (typeStr === 'void' || typeStr === 'never') return wasm.none;
    // A tuple is a wasm multi-value type.
    const tuple = tupleParts(typeStr);
    if (tuple) return wasm.createType(tuple.map(toType));

    // Nullable prefix: "?Foo" — strip and use the nullable ref form.
    let nullable = false;
    let name = typeStr;
    if (name.startsWith('?')) { nullable = true; name = name.slice(1); }

    // Callable types have no declaration to register from, so they are added
    // to this same registry off the stamped type names — see
    // registerCallableTypes.  `fun(...)` resolves to a typed function
    // reference, `cl(...)` to externref.
    const info = structTypes.get(name);
    if (!info) {
      throw new Error(`codegen: unsupported type "${typeStr}" (no stdlib type-def or heap type match)`);
    }

    if (info.scalarFamily) {
      if (nullable) throw new Error(`codegen: scalar type "${name}" cannot be nullable`);
      return info.wasmType;
    }

    if (info.refType != null) return nullable ? info.nullableRefType : info.refType;

    throw new Error(`codegen: type "${typeStr}" has unsupported type-repr "${info.typeRepr}"`);
  };
}

/**
 * Build a `(typeName) => wasmNamespace | null` lookup against the
 * stdlib-sourced type registry.  Consumed anywhere codegen needs to pick a
 * `m[ns]` namespace (literal constants, numeric comparisons, arithmetic)
 * from a utu type name.  Returns null for non-scalar names.
 *
 * The registry entries are populated by the single type registry, so the
 * set of names this function recognises is exactly the set declared by the
 * stdlib. No parallel table; no parallel opinion.
 *
 * @param {Map<string, StructTypeInfo>} structTypes
 * @returns {(typeStr: string) => (string|null)}
 */
export function makeScalarNamespaceLookup(structTypes) {
  return function scalarNamespaceOf(typeStr) {
    if (!typeStr) return null;
    const name = unwrapNullable(typeStr);
    return structTypes.get(name)?.wasmNamespace ?? null;
  };
}

export function makeScalarKindLookup(structTypes) {
  return function scalarKindOf(typeStr) {
    if (!typeStr) return null;
    const name = unwrapNullable(typeStr);
    return structTypes.get(name)?.scalarKind ?? null;
  };
}


