// link-type-decls.js — Pass 5
//
// linkTypeDecls(doc) → Map<string, TypeEntry>
//
// There is exactly one type registry. It is built here. Every other pass —
// typechecker, validator, codegen — consumes it. No other file walks
// `ir-wasm-scalar` / `ir-wasm-ref` / `ir-wasm-array` nodes to derive type
// facts. If you need a type fact that is not on a registry entry, add it to
// the entry shape here.
//
// Typechecking is nominal over type-name. Codegen is representational over
// type-repr.
//
// Registry entry shape:
//   { typeName, typeRepr, decl, kind, ...codegenFacts }
//
// codegenFacts are derived once here so codegen never re-walks declarations.
// For struct/variant: { fields: [{name,type}] }
// For enum: { tagType, fields, variantNames }
// For variant under enum: { tagType, tagValue, superName, fields }
// For wasm-array: { arrayElem, arrayMutable }
//
// Returns the index map so later passes can reuse it without re-querying.
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';
import { firstTypeChild, typeNodeToStr } from './ir-helpers.js';
import { callableParts, isCallableType, SOURCE_PRIMITIVES } from './type-rules.js';



/**
 * @param {Document} doc
 * @returns {Map<string, TypeEntry>}  type-name → registry entry
 */
export function linkTypeDecls(doc) {
  const root = doc.body.firstChild;
  if (!root) return new Map();

  // ── 1. Build declaration index ─────────────────────────────────────────────
  /** @type {Map<string, TypeEntry>} */
  const index = new Map();
  for (const decl of root.querySelectorAll(
    ':scope > ir-struct, :scope > ir-enum, :scope > ir-proto, :scope > ir-type-def'
  )) {
    const name = decl.getAttribute('name');
    index.set(name, makeTypeEntry(name, decl));
    if (decl.localName === 'ir-enum') {
      const enumEntry = index.get(name);
      const tagType = enumEntry.tagType;
      const variantNames = [];
      for (const [tagValue, variant] of [...decl.querySelectorAll(':scope > ir-variant')].entries()) {
        const variantName = variant.getAttribute('name');
        variantNames.push(variantName);
        const variantEntry = makeVariantEntry(variantName, variant, name, tagType, tagValue);
        index.set(variantName, variantEntry);
      }
      enumEntry.variantNames = variantNames;
    }
  }

  // ── 2. Resolve ir-type-ref nodes ──────────────────────────────────────────
  for (const ref of root.querySelectorAll('ir-type-ref')) {
    const name = ref.getAttribute('name');
    if (SOURCE_PRIMITIVES.has(name)) continue;
    // Callable types are structural — `cl(I32) Bool` names no declaration, so
    // it has no registry entry to resolve against.  Passes that synthesise
    // type refs from a type string (the @es import signature reader, closure
    // lifting) can produce one here.  Carry the identity and move on.
    if (isCallableType(name)) {
      ref.dataset['typeName'] = name;
      ref.dataset['typeRepr'] = callableParts(name).kind === 'fun' ? 'wasm-i32' : 'wasm-externref';
      continue;
    }
    const entry = index.get(name);
    if (entry) {
      const decl = entry.decl;
      // Resolution ids are for explainability: they point a type reference at
      // the declaration node that satisfied it. Type identity remains
      // `data-type-name`.
      ref.dataset.resolvesToId = decl.id;
      ref.dataset.resolvesToOriginId = decl.dataset.originId ?? decl.id;
      ref.dataset.resolvesToKind = decl.localName;
      ref.dataset['typeName'] = entry.typeName;
      ref.dataset['typeRepr'] = entry.typeRepr;
    } else {
      stampDiagnostic(ref, DIAGNOSTIC_KINDS.UNKNOWN_TYPE, `Unknown type '${name}'`, { name });
    }
  }

  // ── 3. ir-type-qualified should be gone after hoisting ────────────────────
  // If any remain they indicate a bug in the hoisting pass — flag them.
  for (const q of root.querySelectorAll('ir-type-qualified')) {
    stampDiagnostic(q, DIAGNOSTIC_KINDS.REWRITE_INVARIANT, 'Unresolved qualified type after hoisting');
  }

  return index;
}

/**
 * Every wasm scalar kind the stdlib declared, as `kind → family`.
 *
 * Answers "is `<ir-i64-foo>` a known scalar tag?" without any pass hardcoding a
 * kind list. Two collectors used to exist — one returning a Set, one a Map —
 * which is why `matchScalarIntrinsic` had to accept either shape.
 *
 * Works on registry entries or on the codegen infos derived from them, since
 * the latter carry the same two fields.
 */
export function collectScalarKinds(entries) {
  const kinds = new Map();
  for (const entry of entries.values()) {
    if (entry?.scalarFamily) kinds.set(entry.scalarFamily, entry.scalarFamily);
    if (entry?.scalarKind) kinds.set(entry.scalarKind.toLowerCase(), entry.scalarFamily);
  }
  return kinds;
}

export function typeEntryDecl(entry) {
  return entry?.decl ?? null;
}

function makeTypeEntry(typeName, decl) {
  const entry = computeTypeEntry(typeName, decl);
  decl.dataset['typeName'] = entry.typeName;
  decl.dataset['typeRepr'] = entry.typeRepr;
  // Carry what the instantiation recorded (module-names.js) onto the registry
  // entry, so consumers ask the registry what `Promise__I32` was built from
  // rather than splitting the name apart.
  if (decl.dataset.moduleBase) {
    entry.moduleBase = decl.dataset.moduleBase;
    entry.moduleArgs = decl.dataset.moduleArgs;
  }
  return entry;
}

function makeVariantEntry(typeName, decl, superName, tagType, tagValue) {
  const entry = {
    typeName,
    typeRepr: `wasm-gc-struct:${typeName}`,
    decl,
    kind: 'wasm-gc-variant',
    superName,
    tagType,
    tagValue,
    fields: [{ name: '__tag', type: tagType }, ...collectDeclaredFields(decl)],
  };
  decl.dataset['typeName'] = entry.typeName;
  decl.dataset['typeRepr'] = entry.typeRepr;
  return entry;
}

function computeTypeEntry(typeName, decl) {
  const base = { typeName, decl, kind: decl.localName };
  if (decl.localName === 'ir-struct') {
    return {
      ...base,
      kind: 'wasm-gc-struct',
      typeRepr: `wasm-gc-struct:${typeName}`,
      fields: collectDeclaredFields(decl),
    };
  }
  if (decl.localName === 'ir-enum') {
    const tagType = readTagType(decl);
    return {
      ...base,
      kind: 'wasm-gc-enum',
      typeRepr: `wasm-gc-enum:${typeName}`,
      tagType,
      fields: [{ name: '__tag', type: tagType }],
      variantNames: [],
    };
  }
  if (decl.localName === 'ir-proto') return { ...base, typeRepr: `utu-proto:${typeName}` };
  if (decl.localName !== 'ir-type-def') return { ...base, typeRepr: `utu:${typeName}` };

  const scalar = decl.querySelector(':scope > ir-wasm-scalar');
  if (scalar) {
    const typeRepr = requiredAttr(scalar, 'type-repr', typeName);
    const scalarFamily = parseScalarRepr(typeRepr, typeName);
    return {
      ...base,
      kind: 'wasm-scalar',
      typeRepr,
      scalarKind: typeName,
      scalarFamily,
    };
  }

  const ref = decl.querySelector(':scope > ir-wasm-ref');
  if (ref) {
    const typeRepr = requiredAttr(ref, 'type-repr', typeName);
    const refBinaryen = parseRefRepr(typeRepr, typeName);
    return {
      ...base,
      kind: 'wasm-ref',
      typeRepr,
      refBinaryen,
    };
  }

  const array = decl.querySelector(':scope > ir-wasm-array');
  if (array) {
    const typeRepr = requiredAttr(array, 'type-repr', typeName);
    const { arrayElem, arrayMutable } = parseArrayRepr(typeRepr, typeName);
    return {
      ...base,
      kind: 'wasm-array',
      typeRepr,
      arrayElem,
      arrayMutable,
    };
  }

  return { ...base, typeRepr: `utu-type-def:${typeName}` };
}

function parseScalarRepr(typeRepr, typeName) {
  const m = /^wasm-(i32|i64|f32|f64|v128)$/.exec(typeRepr);
  if (!m) throw new Error(`type registry: type "${typeName}" has invalid scalar type-repr "${typeRepr}"`);
  return m[1];
}

function parseRefRepr(typeRepr, typeName) {
  if (typeRepr === 'wasm-externref') return 'externref';
  if (typeRepr === 'wasm-stringref') return 'stringref';
  if (typeRepr === 'wasm-i31') return 'i31ref';
  throw new Error(`type registry: type "${typeName}" has invalid ref type-repr "${typeRepr}"`);
}

function parseArrayRepr(typeRepr, typeName) {
  const m = /^wasm-array:elem=([^:]*):mut=(true|false)$/.exec(typeRepr);
  if (!m) throw new Error(`type registry: type "${typeName}" has invalid array type-repr "${typeRepr}"`);
  return { arrayElem: m[1], arrayMutable: m[2] === 'true' };
}

function collectDeclaredFields(decl) {
  return [...decl.querySelectorAll(':scope > ir-field')].map((field) => ({
    name: field.getAttribute('name'),
    type: typeNodeToStr(firstTypeChild(field)),
  }));
}

function readTagType(decl) {
  return decl.getAttribute('tag-type') ?? decl.dataset.tagType ?? 'I32';
}

export const WASM_SCALAR_FAMILIES = new Set(['i32', 'i64', 'f32', 'f64', 'v128']);
export const WASM_REF_BINARYEN_TYPES = new Set(['externref', 'stringref', 'i31ref']);

function requiredAttr(node, attr, typeName) {
  const value = node.getAttribute(attr);
  if (!value) throw new Error(`type registry: type "${typeName}" is missing ${attr} on <${node.localName}>`);
  return value;
}
