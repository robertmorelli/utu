// wasm/types.js — wasm value types and heap types, interned.
//
// Every type is one object, so types compare with ===. Numeric types are
// constants; a reference type is interned by (heap type, nullability); a
// tuple (a multi-value result) by its parts. `none` is the empty type and
// `unreachable` the type of code that does not complete.
//
// Defined heap types (structs, arrays, function signatures) are built with a
// TypeBuilder and canonicalized by structure, rec group by rec group, as
// wasm's iso-recursive type system does: building the same group twice gives
// the same types. See docs/wasm-backend.md.

let serial = 0;

class ValueType {
  constructor(kind, name, code) {
    this.kind = kind;
    this.name = name;
    this.code = code;
    this.key = name;
  }
}

export const none = new ValueType('none', 'none', 0x40);
export const unreachable = new ValueType('unreachable', 'unreachable', 0x40);
export const i32 = new ValueType('num', 'i32', 0x7f);
export const i64 = new ValueType('num', 'i64', 0x7e);
export const f32 = new ValueType('num', 'f32', 0x7d);
export const f64 = new ValueType('num', 'f64', 0x7c);
export const v128 = new ValueType('num', 'v128', 0x7b);
// Packed storage types, for struct fields and array elements only.
export const i8 = new ValueType('packed', 'i8', 0x78);
export const i16 = new ValueType('packed', 'i16', 0x77);

// ── Heap types ───────────────────────────────────────────────────────────────

class AbstractHeapType {
  constructor(name, code, parent, bottom) {
    this.abstract = true;
    this.name = name;
    this.code = code;
    this.parent = parent;
    this.bottom = bottom ?? this;
    this.key = name;
  }
}

export const heap = {};
heap.noexn = new AbstractHeapType('noexn', 0x74, null);
heap.nofunc = new AbstractHeapType('nofunc', 0x73, null);
heap.noextern = new AbstractHeapType('noextern', 0x72, null);
heap.none = new AbstractHeapType('none', 0x71, null);
heap.exn = new AbstractHeapType('exn', 0x69, null, heap.noexn);
heap.func = new AbstractHeapType('func', 0x70, null, heap.nofunc);
heap.extern = new AbstractHeapType('extern', 0x6f, null, heap.noextern);
heap.any = new AbstractHeapType('any', 0x6e, null, heap.none);
heap.eq = new AbstractHeapType('eq', 0x6d, heap.any, heap.none);
heap.i31 = new AbstractHeapType('i31', 0x6c, heap.eq, heap.none);
heap.struct = new AbstractHeapType('struct', 0x6b, heap.eq, heap.none);
heap.array = new AbstractHeapType('array', 0x6a, heap.eq, heap.none);

/** A struct, array, or function type: one member of a rec group. */
export class DefinedType {
  constructor() {
    this.abstract = false;
    this.kind = null;
    this.fields = null;     // struct: [{ type, mutable }]
    this.element = null;    // array: { type, mutable }
    this.params = null;     // func: value type (none, one type, or a tuple)
    this.results = null;
    this.supertype = null;
    this.final = true;
    this.group = null;
    this.id = ++serial;
    this.key = `#${this.id}`;
  }

  get parent() {
    return this.supertype ?? heap[this.kind];
  }

  get bottom() {
    return this.kind === 'func' ? heap.nofunc : heap.none;
  }
}

class RecGroup {
  constructor(types) {
    this.types = types;
    this.id = ++serial;
  }
}

// ── Reference and tuple types ────────────────────────────────────────────────

const refs = new Map();

class RefType {
  constructor(heapType, nullable) {
    this.kind = 'ref';
    this.heap = heapType;
    this.nullable = nullable;
    this.key = `${nullable ? 'null ' : ''}${heapType.key}`;
    this.name = heapType.abstract
      ? (nullable ? `${heapType.name}ref` : `(ref ${heapType.name})`)
      : `(ref ${nullable ? 'null ' : ''}${heapType.key})`;
  }
}

export function ref(heapType, nullable) {
  const key = `${nullable ? 'null ' : ''}${heapType.key}`;
  let type = refs.get(key);
  if (!type) refs.set(key, type = new RefType(heapType, nullable));
  return type;
}

const tuples = new Map();

class TupleType {
  constructor(types) {
    this.kind = 'tuple';
    this.types = types;
    this.key = `(${types.map(type => type.key).join(' ')})`;
    this.name = this.key;
  }
}

/** The type of a sequence of values: none, the one type, or a tuple. */
export function createType(types) {
  const list = [...types];
  if (list.length === 0) return none;
  if (list.length === 1) return list[0];
  const key = list.map(type => type.key).join(' ');
  let type = tuples.get(key);
  if (!type) tuples.set(key, type = new TupleType(Object.freeze(list)));
  return type;
}

export function expandType(type) {
  if (type === none) return [];
  if (type.kind === 'tuple') return type.types;
  return [type];
}

export const funcref = ref(heap.func, true);
export const externref = ref(heap.extern, true);
export const anyref = ref(heap.any, true);
export const eqref = ref(heap.eq, true);
export const i31ref = ref(heap.i31, true);
export const structref = ref(heap.struct, true);
export const arrayref = ref(heap.array, true);

export function isNumeric(type) {
  return type.kind === 'num';
}

export function isConcrete(type) {
  return type !== none && type !== unreachable;
}

// ── Subtyping ────────────────────────────────────────────────────────────────

/** The top of a heap type's hierarchy: func, extern, any, or exn. */
export function topOf(heapType) {
  if (heapType === heap.nofunc) return heap.func;
  if (heapType === heap.noextern) return heap.extern;
  if (heapType === heap.none) return heap.any;
  if (heapType === heap.noexn) return heap.exn;
  let at = heapType;
  while (at.parent) at = at.parent;
  return at;
}

export function isHeapSubtype(a, b) {
  if (a === b) return true;
  if (topOf(a) !== topOf(b)) return false;
  if (a === a.bottom && a.abstract) return true;
  for (let at = a.parent; at; at = at.parent) if (at === b) return true;
  return false;
}

export function isSubtype(a, b) {
  if (a === b || a === unreachable) return true;
  if (a.kind === 'ref' && b.kind === 'ref') return (!a.nullable || b.nullable) && isHeapSubtype(a.heap, b.heap);
  if (a.kind === 'tuple' && b.kind === 'tuple') {
    return a.types.length === b.types.length && a.types.every((type, i) => isSubtype(type, b.types[i]));
  }
  return false;
}

/** The least type both are subtypes of, or none when there is none (as Binaryen). */
export function leastUpperBound(a, b) {
  if (a === unreachable) return b;
  if (b === unreachable) return a;
  if (a === b) return a;
  if (a.kind === 'ref' && b.kind === 'ref') {
    const heapType = heapUpperBound(a.heap, b.heap);
    return heapType ? ref(heapType, a.nullable || b.nullable) : none;
  }
  if (a.kind === 'tuple' && b.kind === 'tuple' && a.types.length === b.types.length) {
    const parts = a.types.map((type, i) => leastUpperBound(type, b.types[i]));
    return parts.includes(none) ? none : createType(parts);
  }
  return none;
}

function heapUpperBound(a, b) {
  if (topOf(a) !== topOf(b)) return null;
  if (isHeapSubtype(a, b)) return b;
  if (isHeapSubtype(b, a)) return a;
  for (let at = a.parent; at; at = at.parent) if (isHeapSubtype(b, at)) return at;
  return topOf(a);
}

// ── Building defined types ──────────────────────────────────────────────────

// Every rec group built so far, by structure, so equal groups are one group.
const canonical = new Map();

class TempRef {
  constructor(heapType, nullable) {
    this.kind = 'temp-ref';
    this.heap = heapType;
    this.nullable = nullable;
  }
}

/**
 * Builds struct, array, and signature types that may refer to each other,
 * with Binaryen's TypeBuilder interface. Slots are singleton rec groups unless
 * createRecGroup joins a range of them.
 */
export class TypeBuilder {
  constructor(size) {
    this.slots = Array.from({ length: size }, () => new DefinedType());
    this.groupOf = new Array(size).fill(-1);
    this.groups = [];
  }

  setStructType(index, fields) {
    const slot = this.slots[index];
    slot.kind = 'struct';
    slot.fields = fields.map(({ type, packedType, mutable }) => ({ type: packedType ?? type, mutable: Boolean(mutable) }));
  }

  setArrayType(index, elementType, elementPackedType, mutable) {
    const slot = this.slots[index];
    slot.kind = 'array';
    slot.element = { type: elementPackedType ?? elementType, mutable: Boolean(mutable) };
  }

  setSignatureType(index, params, results) {
    const slot = this.slots[index];
    slot.kind = 'func';
    slot.params = params;
    slot.results = results;
  }

  getTempHeapType(index) {
    return this.slots[index];
  }

  getTempRefType(heapType, nullable) {
    return new TempRef(heapType, Boolean(nullable));
  }

  setSubType(index, supertype) {
    this.slots[index].supertype = supertype;
  }

  setOpen(index) {
    this.slots[index].final = false;
  }

  createRecGroup(start, length) {
    const group = this.groups.length;
    this.groups.push(Array.from({ length }, (_, i) => start + i));
    for (let i = start; i < start + length; i++) this.groupOf[i] = group;
  }

  /** The canonical types, one per slot. */
  buildAndDispose() {
    for (let i = 0; i < this.slots.length; i++) {
      if (this.groupOf[i] < 0) {
        this.groupOf[i] = this.groups.length;
        this.groups.push([i]);
      }
    }
    const resolved = new Array(this.slots.length);
    const state = new Array(this.groups.length).fill(0);
    const visit = group => {
      if (state[group] === 2) return;
      if (state[group] === 1) throw new Error('wasm types: types in different rec groups refer to each other in a cycle');
      state[group] = 1;
      for (const index of this.groups[group]) {
        for (const other of this.references(this.slots[index])) {
          const slot = this.slots.indexOf(other);
          if (slot >= 0 && this.groupOf[slot] !== group) visit(this.groupOf[slot]);
        }
      }
      this.canonicalize(this.groups[group], resolved);
      state[group] = 2;
    };
    for (let group = 0; group < this.groups.length; group++) visit(group);
    return resolved;
  }

  /** The defined types a slot's description mentions. */
  references(slot) {
    const out = [];
    const add = type => {
      if (type?.kind === 'temp-ref' || type?.kind === 'ref') {
        if (!type.heap.abstract) out.push(type.heap);
      } else if (type?.kind === 'tuple') {
        type.types.forEach(add);
      }
    };
    if (slot.fields) slot.fields.forEach(field => add(field.type));
    if (slot.element) add(slot.element.type);
    if (slot.params) add(slot.params);
    if (slot.results) add(slot.results);
    if (slot.supertype && !slot.supertype.abstract) out.push(slot.supertype);
    return out;
  }

  canonicalize(indices, resolved) {
    const members = indices.map(index => this.slots[index]);
    // Within the group, a member is named by its position; outside, by its canonical type.
    const name = heapType => {
      const position = members.indexOf(heapType);
      if (position >= 0) return `@${position}`;
      const slot = this.slots.indexOf(heapType);
      return (slot >= 0 ? resolved[slot] : heapType).key;
    };
    const typeKey = type => {
      if (type?.kind === 'temp-ref' || type?.kind === 'ref') return `${type.nullable ? 'null ' : ''}${name(type.heap)}`;
      if (type?.kind === 'tuple') return `(${type.types.map(typeKey).join(' ')})`;
      return type.key;
    };
    const describe = slot => {
      const head = `${slot.final ? 'final' : 'open'} ${slot.supertype ? name(slot.supertype) : '-'} ${slot.kind}`;
      if (slot.kind === 'struct') return `${head} ${slot.fields.map(field => `${field.mutable ? 'mut ' : ''}${typeKey(field.type)}`).join(',')}`;
      if (slot.kind === 'array') return `${head} ${slot.element.mutable ? 'mut ' : ''}${typeKey(slot.element.type)}`;
      return `${head} ${typeKey(slot.params)} -> ${typeKey(slot.results)}`;
    };
    const key = members.map(describe).join(' ; ');
    const existing = canonical.get(key);
    if (existing) {
      indices.forEach((index, i) => { resolved[index] = existing.types[i]; });
      return;
    }
    const real = heapType => {
      const position = members.indexOf(heapType);
      if (position >= 0) return heapType;
      const slot = this.slots.indexOf(heapType);
      return slot >= 0 ? resolved[slot] : heapType;
    };
    const realType = type => {
      if (type?.kind === 'temp-ref' || type?.kind === 'ref') return ref(real(type.heap), type.nullable);
      if (type?.kind === 'tuple') return createType(type.types.map(realType));
      return type;
    };
    const group = new RecGroup(members);
    for (const member of members) {
      member.group = group;
      if (member.fields) member.fields = Object.freeze(member.fields.map(field => Object.freeze({ type: realType(field.type), mutable: field.mutable })));
      if (member.element) member.element = Object.freeze({ type: realType(member.element.type), mutable: member.element.mutable });
      if (member.kind === 'func') {
        member.params = realType(member.params ?? none);
        member.results = realType(member.results ?? none);
      }
      if (member.supertype) member.supertype = real(member.supertype);
    }
    canonical.set(key, group);
    indices.forEach((index, i) => { resolved[index] = members[i]; });
  }
}

/** The (final, singleton) function type with these params and results. */
export function signatureType(params, results) {
  const builder = new TypeBuilder(1);
  builder.setSignatureType(0, params, results);
  return builder.buildAndDispose()[0];
}

/** `(array (mut i16))`, which the JS string builtins read and write. */
export function codeUnitArrayType() {
  const builder = new TypeBuilder(1);
  builder.setArrayType(0, i32, i16, true);
  return builder.buildAndDispose()[0];
}

/** The value a packed field or element reads as. */
export function unpacked(type) {
  return type.kind === 'packed' ? i32 : type;
}
