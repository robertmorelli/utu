// codegen/heap-types.js — build the codegen heap-type registry.
//
// Consumes the type registry produced by `link-type-decls.js`. This file does
// NOT re-walk declaration AST and does NOT inspect raw `ir-wasm-*` nodes —
// every fact (fields, variants, tag type, array elem/mut, scalar family,
// ref wasm name) is read directly off registry entries.
//
// Output: a `Map<typeName, info>` where each `info` extends the registry
// entry with the wasm handles codegen needs (heapType, refType,
// nullableRefType, wasmType, fieldIndex).

import {
  wasm,
  refNameToWasmType,
  scalarFamilyToWasmType,
  builtinWasmType,
} from './types.js';
import { callableParts } from '../type-strings.js';
import { unwrapNullable } from '../type-strings.js';
import { buildLayoutGraph } from '../semantic-graphs.js';
import { retainedGraphs } from '../graph-store.js';

export function buildHeapTypes(root, typeIndex) {
  const directTypes = collectDirectTypes(typeIndex);
  const directRefKinds = new Map(
    [...directTypes]
      .filter(([, info]) => info.refWasm != null)
      .map(([name, info]) => [name, info.refWasm]),
  );
  const directScalarKinds = new Map(
    [...directTypes]
      .filter(([, info]) => info.scalarFamily != null)
      .map(([name, info]) => [name, info.scalarFamily]),
  );
  const retained = retainedGraphs(root.ownerDocument).layout;
  const layout = retained?.typeIndex === typeIndex ? retained : buildLayoutGraph(typeIndex);
  const entries = [...layout.nodes.values()].map(({ entry }, slot) => ({ ...entry, slot }));
  const registry = new Map(directTypes);
  if (entries.length === 0) return registry;

  const tb = new wasm.TypeBuilder(entries.length);
  const slotByName = new Map(entries.map((entry, slot) => [entry.typeName, slot]));

  for (const entry of entries) {
    if (entry.kind === 'wasm-array') {
      tb.setArrayType(
        entry.slot,
        builderValueType(entry.arrayElem, tb, slotByName, directRefKinds, directScalarKinds),
        wasm.notPacked,
        entry.arrayMutable,
      );
      continue;
    }
    tb.setStructType(
      entry.slot,
      entry.fields.map((field) => ({
        type: builderValueType(field.type, tb, slotByName, directRefKinds, directScalarKinds),
        packedType: wasm.notPacked,
        mutable: true,
      })),
    );
  }

  for (const entry of entries) {
    if (!entry.superName) continue;
    const superSlot = slotByName.get(entry.superName);
    tb.setOpen(superSlot);
    tb.setSubType(entry.slot, tb.getTempHeapType(superSlot));
  }

  if (layout.recursive) tb.createRecGroup(0, entries.length);

  const heapTypes = tb.buildAndDispose();

  for (const entry of entries) {
    const heapType = heapTypes[entry.slot];
    registry.set(entry.typeName, {
      ...entry,
      heapType,
      refType: wasm.getTypeFromHeapType(heapType, false),
      nullableRefType: wasm.getTypeFromHeapType(heapType, true),
      fieldIndex: new Map(),
    });
  }

  for (const entry of entries) {
    if (!entry.fields) continue;
    registry.get(entry.typeName).fieldIndex = new Map(
      entry.fields.map((field, index) => [field.name, {
        index,
        type: field.type,
        wasmType: finalValueType(field.type, registry),
      }]),
    );
  }

  return registry;
}

function collectDirectTypes(typeIndex) {
  const refs = new Map();
  for (const [name, entry] of typeIndex) {
    if (entry.decl?.localName === 'ir-proto') {
      refs.set(name, {
        ...entry,
        heapType: null,
        refWasm: 'anyref',
        refType: wasm.anyref,
        nullableRefType: wasm.anyref,
        fieldIndex: new Map(),
      });
      continue;
    }
    if (entry.kind === 'wasm-scalar') {
      refs.set(name, {
        ...entry,
        wasmType: scalarFamilyToWasmType(entry.scalarFamily),
        wasmNamespace: entry.scalarFamily,
        fieldIndex: new Map(),
      });
      continue;
    }
    if (entry.kind === 'wasm-ref') {
      const type = refNameToWasmType(entry.refWasm);
      refs.set(name, {
        ...entry,
        heapType: null,
        refType: type,
        nullableRefType: type,
        fieldIndex: new Map(),
      });
    }
  }
  return refs;
}

function builderValueType(typeStr, tb, slotByName, directRefKinds, directScalarKinds) {
  if (!typeStr) return wasm.none;
  const nullable = typeStr.startsWith('?');
  const name = unwrapNullable(typeStr);
  const callable = callableFieldType(name);
  if (callable != null) return callable;
  const scalarFamily = directScalarKinds.get(name);
  const scalar = scalarFamily ? scalarFamilyToWasmType(scalarFamily) : null;
  if (scalar != null) return scalar;
  try {
    return builtinWasmType(typeStr);
  } catch {}
  const slot = slotByName.get(name);
  if (slot != null) {
    return tb.getTempRefType(tb.getTempHeapType(slot), nullable);
  }
  const refWasm = directRefKinds.get(name);
  const direct = refWasm ? refNameToWasmType(refWasm) : null;
  if (direct != null) return direct;
  throw new Error(`codegen: unsupported heap field type "${typeStr}"`);
}

/**
 * Callable field types.
 *
 * `cl(...)` is an externref, which is a fixed builtin and so needs nothing from
 * the type builder. `fun(...)` would need its own signature heap type, and a
 * signature whose parameters mention the very structs being built is circular —
 * so it is refused with a message pointing at the type that does work. A `fun`
 * decays to a `cl` implicitly, so storing one costs only the wrapper.
 */
function callableFieldType(name) {
  const parts = callableParts(name);
  if (!parts) return null;
  if (parts.kind === 'cl') return wasm.externref;
  throw new Error(
    `codegen: "${name}" cannot be a field type — a function reference has no ` +
    `representation inside a heap type yet; declare the field as ` +
    `cl(${parts.params.join(', ')}) ${parts.ret} instead (a fun decays to it)`,
  );
}

function finalValueType(typeStr, registry) {
  if (!typeStr) return wasm.none;
  try {
    return builtinWasmType(typeStr);
  } catch {}

  const name = unwrapNullable(typeStr);
  const callable = callableFieldType(name);
  if (callable != null) return callable;
  const info = registry.get(name);
  if (!info) throw new Error(`codegen: unsupported heap field type "${typeStr}"`);
  if (info.scalarFamily) {
    if (typeStr.startsWith('?')) throw new Error(`codegen: scalar field type "${typeStr}" cannot be nullable`);
    return info.wasmType;
  }
  return typeStr.startsWith('?') ? info.nullableRefType : info.refType;
}

