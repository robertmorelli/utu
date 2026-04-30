import {
  binaryen,
  refKindToBinaryenType,
  scalarKindToBinaryenType,
  scalarKindToBinaryenNamespace,
  utuToBinaryenType,
} from './types.js';
import { firstTypeChild, typeNodeToStr } from '../ir-helpers.js';

export function buildHeapTypes(root) {
  const directTypes = collectDirectTypes(root);
  const directRefKinds = new Map(
    [...directTypes]
      .filter(([, info]) => info.refKind != null)
      .map(([name, info]) => [name, info.refKind]),
  );
  const directScalarKinds = new Map(
    [...directTypes]
      .filter(([, info]) => info.scalarKind != null)
      .map(([name, info]) => [name, info.scalarKind]),
  );
  const entries = collectBuilderEntries(root);
  const registry = new Map(directTypes);
  if (entries.length === 0) return registry;

  const tb = new binaryen.TypeBuilder(entries.length);
  const slotByName = new Map(entries.map((entry, slot) => [entry.name, slot]));

  for (const entry of entries) {
    if (entry.kind === 'array') {
      tb.setArrayType(entry.slot, {
        type: builderValueType(entry.elem, tb, slotByName, directRefKinds, directScalarKinds),
        packedType: binaryen.notPacked,
        mutable: entry.mutable,
      });
      continue;
    }
    tb.setStructType(
      entry.slot,
        entry.fields.map((field) => ({
        type: builderValueType(field.type, tb, slotByName, directRefKinds, directScalarKinds),
        packedType: binaryen.notPacked,
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

  if (entries.some((entry) => referencesHeapType(entry, slotByName, directScalarKinds))) {
    tb.createRecGroup(0, entries.length);
  }

  const heapTypes = tb.buildAndDispose();

  for (const entry of entries) {
    const heapType = heapTypes[entry.slot];
    registry.set(entry.name, {
      kind: entry.kind,
      superName: entry.superName ?? null,
      tagValue: entry.tagValue ?? null,
      tagType: entry.tagType ?? null,
      elem: entry.elem ?? null,
      mutable: entry.mutable ?? null,
      heapType,
      refType: binaryen.getTypeFromHeapType(heapType, false),
      nullableRefType: binaryen.getTypeFromHeapType(heapType, true),
      fieldIndex: new Map(),
    });
  }

  for (const entry of entries) {
    if (!entry.fields) continue;
    registry.get(entry.name).fieldIndex = new Map(
      entry.fields.map((field, index) => [field.name, {
        index,
        type: field.type,
        binaryenType: finalValueType(field.type, registry),
      }]),
    );
  }

  return registry;
}

function collectDirectTypes(root) {
  const refs = new Map();
  for (const node of root.querySelectorAll(':scope > ir-type-def')) {
    const scalar = node.querySelector(':scope > ir-wasm-scalar');
    if (scalar) {
      const kind = scalar.getAttribute('kind');
      const type = scalarKindToBinaryenType(kind);
      const namespace = scalarKindToBinaryenNamespace(kind);
      refs.set(node.getAttribute('name'), {
        kind: `wasm-scalar:${kind}`,
        scalarKind: kind,
        binaryenType: type,
        binaryenNamespace: namespace,
        fieldIndex: new Map(),
      });
      continue;
    }
    const ref = node.querySelector(':scope > ir-wasm-ref');
    if (!ref) continue;
    const kind = ref.getAttribute('kind');
    const type = refKindToBinaryenType(kind);
    if (type == null) {
      throw new Error(`codegen: unknown ir-wasm-ref kind "${kind}" on type "${node.getAttribute('name')}"`);
    }
    refs.set(node.getAttribute('name'), {
      kind: `wasm-ref:${kind}`,
      refKind: kind,
      heapType: null,
      refType: type,
      nullableRefType: type,
      fieldIndex: new Map(),
    });
  }
  return refs;
}

function collectBuilderEntries(root) {
  const entries = [];
  let slot = 0;

  for (const node of root.children) {
    if (node.localName === 'ir-struct') {
      entries.push({
        kind: 'struct',
        name: node.getAttribute('name'),
        fields: collectFields(node),
        slot: slot++,
      });
      continue;
    }

    if (node.localName === 'ir-enum') {
      const enumName = node.getAttribute('name');
      const tagType = enumTagType(node);
      entries.push({
        kind: 'enum',
        name: enumName,
        tagType,
        fields: [{ name: '__tag', type: tagType }],
        slot: slot++,
      });
      for (const [tagValue, variant] of [...node.querySelectorAll(':scope > ir-variant')].entries()) {
        entries.push({
          kind: 'variant',
          name: variant.getAttribute('name'),
          superName: enumName,
          tagValue,
          tagType,
          fields: [{ name: '__tag', type: tagType }, ...collectFields(variant)],
          slot: slot++,
        });
      }
      continue;
    }

    if (node.localName !== 'ir-type-def') continue;
    const wasmArray = node.querySelector(':scope > ir-wasm-array');
    if (!wasmArray) continue;
    entries.push({
      kind: 'array',
      name: node.getAttribute('name'),
      elem: wasmArray.getAttribute('elem'),
      mutable: wasmArray.getAttribute('mut') !== 'false',
      slot: slot++,
    });
  }

  return entries;
}

function enumTagType(node) {
  return node.getAttribute('tag-type') ?? node.dataset.tagType ?? 'i32';
}

function collectFields(node) {
  return [...node.querySelectorAll(':scope > ir-field')].map((field) => ({
    name: field.getAttribute('name'),
    type: typeNodeToStr(firstTypeChild(field)),
  }));
}

function referencesHeapType(entry, slotByName, directScalarKinds) {
  if (entry.elem && isHeapTypeName(entry.elem, slotByName, directScalarKinds)) return true;
  return !!entry.fields?.some((field) => isHeapTypeName(field.type, slotByName, directScalarKinds));
}

function isHeapTypeName(typeStr, slotByName, directScalarKinds) {
  if (!typeStr) return false;
  const name = stripNullable(typeStr);
  if (directScalarKinds.has(name) || name === 'void') return false;
  return slotByName.has(name);
}

function builderValueType(typeStr, tb, slotByName, directRefKinds, directScalarKinds) {
  if (!typeStr) return binaryen.none;
  const nullable = typeStr.startsWith('?');
  const name = stripNullable(typeStr);
  const scalar = scalarKindToBinaryenType(directScalarKinds.get(name));
  if (scalar != null) return scalar;
  try {
    return utuToBinaryenType(typeStr);
  } catch {}
  const slot = slotByName.get(name);
  if (slot != null) {
    return tb.getTempRefType(tb.getTempHeapType(slot), nullable);
  }
  const direct = refKindToBinaryenType(directRefKinds.get(name));
  if (direct != null) return direct;
  throw new Error(`codegen: unsupported heap field type "${typeStr}"`);
}

function finalValueType(typeStr, registry) {
  if (!typeStr) return binaryen.none;
  try {
    return utuToBinaryenType(typeStr);
  } catch {}

  const name = stripNullable(typeStr);
  const info = registry.get(name);
  if (!info) throw new Error(`codegen: unsupported heap field type "${typeStr}"`);
  if (info.binaryenType != null) {
    if (typeStr.startsWith('?')) throw new Error(`codegen: scalar field type "${typeStr}" cannot be nullable`);
    return info.binaryenType;
  }
  return typeStr.startsWith('?') ? info.nullableRefType : info.refType;
}

function stripNullable(typeStr) {
  return typeStr.startsWith('?') ? typeStr.slice(1) : typeStr;
}
