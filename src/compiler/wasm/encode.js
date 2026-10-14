// wasm/encode.js — a Module (module.js) as wasm bytes.
//
// Only what the exports reach is emitted: functions, imports, globals, and
// tags no exported function uses are left out, as are types nothing uses.
// Unnamed blocks are emitted as their contents (nothing can branch to
// them); code after an expression that does not complete is left out; a
// structured instruction that does not complete is followed by
// `unreachable`, so what follows it validates. Tuple-typed locals are one
// wasm local per part. See docs/wasm-backend.md.

import { expandType, isNumeric, none, signatureType, unreachable } from './types.js';

export function encodeModule(module, { sourceMapUrl = null, names = Boolean(sourceMapUrl) } = {}) {
  addStartFunction(module);
  const live = liveElements(module);
  const index = assignIndices(module, live);
  const types = collectTypes(module, live);
  const typeIndex = new Map(types.flatMap(group => group.types).map((type, i) => [type, i]));
  const out = new Writer();
  out.bytes([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  const enc = { module, index, typeIndex, typeOf: type => tupleBlockType(type, typeIndex) };

  section(out, 1, w => writeTypes(w, types, typeIndex));
  const imports = [
    ...index.functions.filter(fn => fn.import).map(fn => ({ ...fn.import, kind: 0, write: w => w.u32(typeIndex.get(fn.type)) })),
    ...index.globals.filter(global => global.import).map(global => ({ ...global.import, kind: 3, write: w => { valueType(w, global.type, typeIndex); w.byte(global.mutable ? 1 : 0); } })),
    ...index.memories.filter(memory => memory.import).map(memory => ({ ...memory.import, kind: 2, write: w => limits(w, memory) })),
    ...index.tags.map(tag => ({ ...tag.import, kind: 4, write: w => { w.byte(0); w.u32(typeIndex.get(tag.type)); } })),
  ];
  if (imports.length) {
    section(out, 2, w => w.vec(imports, entry => { w.name(entry.module); w.name(entry.base); w.byte(entry.kind); entry.write(w); }));
  }
  const defined = index.functions.filter(fn => !fn.import);
  if (defined.length) section(out, 3, w => w.vec(defined, fn => w.u32(typeIndex.get(fn.type))));
  const memories = index.memories.filter(memory => !memory.import);
  if (memories.length) section(out, 5, w => w.vec(memories, memory => limits(w, memory)));
  const globals = index.globals.filter(global => !global.import);
  if (globals.length) {
    section(out, 6, w => w.vec(globals, global => {
      valueType(w, global.type, typeIndex);
      w.byte(global.mutable ? 1 : 0);
      new CodeWriter(w, enc, null).constant(global.init);
    }));
  }
  const exports = [
    ...module.exports.map(entry => ({ name: entry.name, kind: 0, index: index.function.get(entry.internal) })),
    ...index.memories.filter(memory => memory.exported).map(memory => ({ name: memory.name, kind: 2, index: index.memory.get(memory.name) })),
  ];
  if (exports.length) section(out, 7, w => w.vec(exports, entry => { w.name(entry.name); w.byte(entry.kind); w.u32(entry.index); }));
  if (module.start) section(out, 8, w => w.u32(index.function.get(module.start)));
  // Functions used as values must be declared.
  if (live.referenced.size) {
    section(out, 9, w => {
      w.u32(1);
      w.byte(3);
      w.byte(0);
      w.vec([...live.referenced].map(fn => index.function.get(fn.name)).sort((a, b) => a - b), i => w.u32(i));
    });
  }
  // Instructions that name a data segment need the count first.
  const passive = module.dataSegments.some(segment => segment.memory == null);
  if (passive) section(out, 12, w => w.u32(module.dataSegments.length));
  const debug = [];
  if (defined.length) {
    const w = new Writer(1 << 16);
    w.u32(defined.length);
    for (const fn of defined) {
      // A @wat function's code is assembled already: its locals, instructions, and end.
      if (fn.code) {
        w.u32(fn.code.length);
        w.bytes(fn.code);
        continue;
      }
      const body = new Writer();
      const code = new CodeWriter(body, enc, fn);
      code.function();
      const head = new Writer();
      code.writeLocals(head);
      w.u32(head.length + body.length);
      w.bytes(head.view());
      const start = w.length;
      w.bytes(body.view());
      for (const { offset, location } of code.locations) debug.push({ offset: start + offset, location });
    }
    out.byte(10);
    out.u32(w.length);
    // Source maps count bytes from the start of the module.
    for (const entry of debug) entry.offset += out.length;
    out.bytes(w.view());
  }
  if (module.dataSegments.length) {
    section(out, 11, w => w.vec(module.dataSegments, segment => {
      if (segment.memory == null) {
        // Passive; empty when what it fills is unused.
        const bytes = segment.used === false ? [] : segment.bytes;
        w.byte(1);
        w.u32(bytes.length);
        w.bytes(bytes);
        return;
      }
      const memory = index.memory.get(segment.memory);
      if (memory === 0) w.byte(0);
      else { w.byte(2); w.u32(memory); }
      w.byte(0x41); w.s32(segment.offset); w.byte(0x0b);
      w.u32(segment.bytes.length);
      w.bytes(segment.bytes);
    }));
  }
  if (names) {
    custom(out, 'name', w => {
      const named = index.functions.map((fn, i) => [i, fn.name]);
      w.byte(1);
      const sub = new Writer();
      sub.vec(named, ([i, name]) => { sub.u32(i); sub.name(name); });
      w.u32(sub.length);
      w.bytes(sub.view());
    });
  }
  if (sourceMapUrl) custom(out, 'sourceMappingURL', w => w.name(sourceMapUrl));
  const bytes = out.view().slice();
  return { bytes, sourceMap: sourceMapUrl ? sourceMap(module, debug) : null };
}

// ── What the exports reach ───────────────────────────────────────────────────

// The arrays with initial contents (Module.addArrayInit) that the exports
// reach are filled by a start function; the others' segments are left empty.
export function addStartFunction(module) {
  if (!module.arrayInits.length || module.start) return;
  const live = liveElements(module);
  const inits = module.arrayInits.filter(init => live.globals.has(module.globalsByName.get(init.global)));
  for (const init of module.arrayInits) module.dataSegments[init.segment].used = inits.includes(init);
  if (!inits.length) return;
  const m = module;
  m.addFunction('__start', none, none, [], m.block(null, inits.map(({ global, heapType, segment, count }) =>
    m.array.init_data(heapType, segment, m.global.get(global), m.i32.const(0), m.i32.const(0), m.i32.const(count)))));
  m.start = '__start';
}

export function liveElements(module) {
  const functions = new Set();
  const globals = new Set();
  const tags = new Set();
  const referenced = new Set();
  const pending = [];
  const useFunction = name => {
    const fn = module.functionsByName.get(name);
    if (!fn) throw new Error(`wasm: no function "${name}"`);
    if (functions.has(fn)) return fn;
    functions.add(fn);
    if (fn.body) pending.push(fn.body);
    return fn;
  };
  const useGlobal = name => {
    const global = module.globalsByName.get(name);
    if (!global) throw new Error(`wasm: no global "${name}"`);
    if (globals.has(global)) return;
    globals.add(global);
    if (global.init) pending.push(global.init);
  };
  for (const entry of module.exports) useFunction(entry.internal);
  if (module.start) useFunction(module.start);
  while (pending.length) {
    const stack = [pending.pop()];
    while (stack.length) {
      const e = stack.pop();
      switch (e.op) {
        case 'call': useFunction(e.target); break;
        case 'ref.func': referenced.add(useFunction(e.target)); break;
        case 'global.get': case 'global.set': useGlobal(e.target); break;
        case 'try':
          for (const name of e.tags) {
            const tag = module.tagsByName.get(name);
            if (!tag) throw new Error(`wasm: no tag "${name}"`);
            tags.add(tag);
          }
          break;
        default: break;
      }
      for (const kid of e.kids) stack.push(kid);
    }
  }
  return { functions, globals, tags, referenced };
}

export function assignIndices(module, live) {
  const functions = [...module.functions.filter(fn => fn.import && live.functions.has(fn)),
    ...module.functions.filter(fn => !fn.import && live.functions.has(fn))];
  const globals = [...module.globals.filter(global => global.import && live.globals.has(global)),
    ...module.globals.filter(global => !global.import && live.globals.has(global))];
  const memories = [...module.memories.filter(memory => memory.import), ...module.memories.filter(memory => !memory.import)];
  const tags = module.tags.filter(tag => live.tags.has(tag));
  return {
    functions, globals, memories, tags,
    function: new Map(functions.map((fn, i) => [fn.name, i])),
    global: new Map(globals.map((global, i) => [global.name, i])),
    memory: new Map(memories.map((memory, i) => [memory.name, i])),
    tag: new Map(tags.map((tag, i) => [tag.name, i])),
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Every rec group the module uses, in order of first use, each after the
 * groups it refers to. (Not in order of creation: types are shared by every
 * module built in the process, so that order would depend on what was built
 * before.)
 */
export function collectTypes(module, live) {
  const groups = [];
  const placed = new Set();
  const visiting = new Set();
  const useHeap = heapType => {
    if (heapType.abstract) return;
    const group = heapType.group;
    if (placed.has(group) || visiting.has(group)) return;
    visiting.add(group);
    for (const member of group.types) {
      if (member.fields) for (const field of member.fields) useType(field.type);
      if (member.element) useType(member.element.type);
      if (member.params) { useType(member.params); useType(member.results); }
      if (member.supertype) useHeap(member.supertype);
    }
    visiting.delete(group);
    placed.add(group);
    groups.push(group);
  };
  const useType = type => {
    if (!type) return;
    if (type.kind === 'ref') useHeap(type.heap);
    else if (type.kind === 'tuple') type.types.forEach(useType);
  };
  const useBlockType = type => {
    if (type?.kind === 'tuple') useHeap(signatureType(none, type));
  };
  const walk = root => {
    const stack = [root];
    while (stack.length) {
      const e = stack.pop();
      useType(e.type);
      if (e.op === 'block' || e.op === 'if' || e.op === 'loop' || e.op === 'try') useBlockType(e.type);
      if (e.castType) useType(e.castType);
      if (e.heapType) useHeap(e.heapType);
      for (const kid of e.kids) stack.push(kid);
    }
  };
  for (const fn of module.functions) {
    if (!live.functions.has(fn)) continue;
    useHeap(fn.type);
    for (const type of fn.vars) useType(type);
    if (fn.body) walk(fn.body);
  }
  for (const global of module.globals) {
    if (!live.globals.has(global)) continue;
    useType(global.type);
    if (global.init) walk(global.init);
  }
  for (const tag of module.tags) if (live.tags.has(tag)) useHeap(tag.type);
  return groups;
}

function tupleBlockType(type, typeIndex) {
  return typeIndex.get(signatureType(none, type));
}

function writeTypes(w, groups, typeIndex) {
  w.u32(groups.length);
  for (const group of groups) {
    if (group.types.length > 1) {
      w.byte(0x4e);
      w.u32(group.types.length);
    }
    for (const type of group.types) {
      if (type.supertype || !type.final) {
        w.byte(type.final ? 0x4f : 0x50);
        if (type.supertype) { w.u32(1); w.u32(typeIndex.get(type.supertype)); } else w.u32(0);
      }
      if (type.kind === 'func') {
        w.byte(0x60);
        w.vec(expandType(type.params), param => valueType(w, param, typeIndex));
        w.vec(expandType(type.results), result => valueType(w, result, typeIndex));
      } else if (type.kind === 'struct') {
        w.byte(0x5f);
        w.vec(type.fields, field => { valueType(w, field.type, typeIndex); w.byte(field.mutable ? 1 : 0); });
      } else {
        w.byte(0x5e);
        valueType(w, type.element.type, typeIndex);
        w.byte(type.element.mutable ? 1 : 0);
      }
    }
  }
}

function valueType(w, type, typeIndex) {
  if (type.kind === 'num' || type.kind === 'packed') {
    w.byte(type.code);
  } else if (type.kind === 'ref') {
    if (type.heap.abstract && type.nullable) {
      w.byte(type.heap.code);
    } else {
      w.byte(type.nullable ? 0x63 : 0x64);
      heapTypeCode(w, type.heap, typeIndex);
    }
  } else {
    throw new Error(`wasm: ${type.name} is not a value type`);
  }
}

function heapTypeCode(w, heapType, typeIndex) {
  if (heapType.abstract) w.byte(heapType.code);
  else w.s32(typeIndex.get(heapType));
}

function limits(w, memory) {
  if (memory.maximum != null) { w.byte(1); w.u32(memory.initial); w.u32(memory.maximum); }
  else { w.byte(0); w.u32(memory.initial); }
}

// ── Code ─────────────────────────────────────────────────────────────────────

const GC = 0xfb;

class CodeWriter {
  constructor(w, enc, fn) {
    this.w = w;
    this.enc = enc;
    this.fn = fn;
    this.labels = [];
    this.locations = [];
    if (fn) this.layoutLocals(fn);
  }

  /** IR local i is wasm locals slots[i].start … start + parts - 1 (a tuple is several). */
  layoutLocals(fn) {
    const params = expandType(fn.params);
    this.slots = params.map((type, i) => ({ start: i, types: [type] }));
    this.declared = [];
    let next = params.length;
    for (const type of fn.vars) {
      const types = expandType(type);
      this.slots.push({ start: next, types });
      this.declared.push(...types);
      next += types.length;
    }
    this.nextLocal = next;
    this.scratch = new Map();
  }

  scratchLocal(type) {
    let local = this.scratch.get(type);
    if (local == null) {
      local = this.nextLocal++;
      this.declared.push(type);
      this.scratch.set(type, local);
    }
    return local;
  }

  writeLocals(w) {
    const runs = [];
    for (const type of this.declared) {
      const last = runs[runs.length - 1];
      if (last && last.type === type) last.count++;
      else runs.push({ type, count: 1 });
    }
    w.vec(runs, run => { w.u32(run.count); valueType(w, run.type, this.enc.typeIndex); });
  }

  function() {
    this.inline(this.fn.body);
    this.w.byte(0x0b);
  }

  constant(e) {
    this.emit(e);
    this.w.byte(0x0b);
  }

  blockType(type) {
    if (type === none || type === unreachable) this.w.byte(0x40);
    else if (type.kind === 'tuple') this.w.s32(this.enc.typeOf(type));
    else valueType(this.w, type, this.enc.typeIndex);
  }

  depth(name) {
    for (let i = this.labels.length - 1; i >= 0; i--) if (this.labels[i] === name) return this.labels.length - 1 - i;
    throw new Error(`wasm: branch to unknown label "${name}"`);
  }

  /** Emit operands in order; false once one does not complete (and the rest is dead). */
  operands(kids) {
    for (const kid of kids) {
      this.emit(kid);
      if (kid.type === unreachable) return false;
    }
    return true;
  }

  /** A block's contents, or any other expression, as a sequence. */
  inline(e) {
    if (e.op === 'block' && (!e.name || !e.targeted)) this.sequence(e);
    else this.emit(e);
  }

  sequence(block) {
    let completed = true;
    for (const kid of block.kids) {
      this.emit(kid);
      if (kid.type === unreachable) { completed = false; break; }
    }
    if (completed && block.type === unreachable) this.w.byte(0x00);
  }

  /** After a structured instruction that does not complete. */
  endUnreachable(e) {
    if (e.type === unreachable) this.w.byte(0x00);
  }

  index(map, name, what) {
    const i = map.get(name);
    if (i === undefined) throw new Error(`wasm: no ${what} "${name}"`);
    return i;
  }

  typeIndexOf(heapType) {
    const i = this.enc.typeIndex.get(heapType);
    if (i === undefined) throw new Error('wasm: type not collected');
    return i;
  }

  emit(e) {
    const { w } = this;
    if (this.fn?.debug) {
      const location = this.fn.debug.get(e);
      if (location) this.locations.push({ offset: w.length, location });
    }
    switch (e.op) {
      case 'block':
        if (!e.name || !e.targeted) { this.sequence(e); return; }
        w.byte(0x02); this.blockType(e.type);
        this.labels.push(e.name);
        this.sequence(e);
        this.labels.pop();
        w.byte(0x0b);
        this.endUnreachable(e);
        return;
      case 'loop':
        w.byte(0x03); this.blockType(e.type);
        this.labels.push(e.name);
        this.inline(e.kids[0]);
        this.labels.pop();
        w.byte(0x0b);
        this.endUnreachable(e);
        return;
      case 'if': {
        const [condition, ifTrue, ifFalse] = e.kids;
        this.emit(condition);
        if (condition.type === unreachable) return;
        w.byte(0x04); this.blockType(e.type);
        this.labels.push(null);
        this.inline(ifTrue);
        if (ifFalse) { w.byte(0x05); this.inline(ifFalse); }
        this.labels.pop();
        w.byte(0x0b);
        this.endUnreachable(e);
        return;
      }
      case 'try': {
        w.byte(0x06); this.blockType(e.type);
        this.labels.push(e.name ?? null);
        this.inline(e.kids[0]);
        e.tags.forEach((tag, i) => {
          w.byte(0x07); w.u32(this.index(this.enc.index.tag, tag, 'tag'));
          this.inline(e.kids[i + 1]);
        });
        this.labels.pop();
        w.byte(0x0b);
        this.endUnreachable(e);
        return;
      }
      case 'br':
        if (!this.operands(e.kids)) return;
        w.byte(e.conditional ? 0x0d : 0x0c);
        w.u32(this.depth(e.name));
        return;
      case 'br_table':
        if (!this.operands(e.kids)) return;
        w.byte(0x0e);
        w.vec(e.names, name => w.u32(this.depth(name)));
        w.u32(this.depth(e.defaultName));
        return;
      case 'return':
        if (!this.operands(e.kids)) return;
        w.byte(0x0f);
        return;
      case 'unreachable': w.byte(0x00); return;
      case 'nop': return;
      case 'drop':
        if (!this.operands(e.kids)) return;
        for (let i = expandType(e.kids[0].type).length; i > 0; i--) w.byte(0x1a);
        return;
      case 'select':
        if (!this.operands(e.kids)) return;
        if (isNumeric(e.type)) w.byte(0x1b);
        else { w.byte(0x1c); w.u32(1); valueType(w, e.type, this.enc.typeIndex); }
        return;
      case 'call':
        if (!this.operands(e.kids)) return;
        w.byte(0x10); w.u32(this.index(this.enc.index.function, e.target, 'function'));
        return;
      case 'call_ref':
        if (!this.operands(e.kids)) return;
        w.byte(0x14); w.u32(this.typeIndexOf(e.kids[e.kids.length - 1].type.heap));
        return;
      case 'local.get': {
        const slot = this.slots[e.index];
        for (let i = 0; i < slot.types.length; i++) { w.byte(0x20); w.u32(slot.start + i); }
        return;
      }
      case 'local.set': case 'local.tee': {
        if (!this.operands(e.kids)) return;
        const slot = this.slots[e.index];
        if (slot.types.length === 1) { w.byte(e.op === 'local.set' ? 0x21 : 0x22); w.u32(slot.start); return; }
        for (let i = slot.types.length - 1; i >= 0; i--) { w.byte(0x21); w.u32(slot.start + i); }
        if (e.op === 'local.tee') for (let i = 0; i < slot.types.length; i++) { w.byte(0x20); w.u32(slot.start + i); }
        return;
      }
      case 'global.get': w.byte(0x23); w.u32(this.index(this.enc.index.global, e.target, 'global')); return;
      case 'global.set':
        if (!this.operands(e.kids)) return;
        w.byte(0x24); w.u32(this.index(this.enc.index.global, e.target, 'global'));
        return;
      case 'const': this.constValue(e); return;
      case 'numeric':
        if (!this.operands(e.kids)) return;
        if (typeof e.code === 'number') w.byte(e.code);
        else { w.byte(e.code[0]); w.u32(e.code[1]); }
        return;
      case 'load': case 'store':
        if (!this.operands(e.kids)) return;
        w.byte(e.code);
        this.memarg(e);
        return;
      case 'memory.size': w.byte(0x3f); w.u32(this.memoryIndex(e.memory)); return;
      case 'memory.grow':
        if (!this.operands(e.kids)) return;
        w.byte(0x40); w.u32(this.memoryIndex(e.memory));
        return;
      case 'ref.null': w.byte(0xd0); heapTypeCode(w, e.type.heap, this.enc.typeIndex); return;
      case 'ref.is_null': if (this.operands(e.kids)) w.byte(0xd1); return;
      case 'ref.as_non_null': if (this.operands(e.kids)) w.byte(0xd4); return;
      case 'ref.eq': if (this.operands(e.kids)) w.byte(0xd3); return;
      case 'ref.func': w.byte(0xd2); w.u32(this.index(this.enc.index.function, e.target, 'function')); return;
      case 'ref.test': case 'ref.cast':
        if (!this.operands(e.kids)) return;
        w.byte(GC);
        w.u32((e.op === 'ref.test' ? 20 : 22) + (e.castType.nullable ? 1 : 0));
        heapTypeCode(w, e.castType.heap, this.enc.typeIndex);
        return;
      case 'ref.i31': if (this.operands(e.kids)) { w.byte(GC); w.u32(28); } return;
      case 'i31.get': if (this.operands(e.kids)) { w.byte(GC); w.u32(e.signed ? 29 : 30); } return;
      case 'any.convert_extern': if (this.operands(e.kids)) { w.byte(GC); w.u32(26); } return;
      case 'extern.convert_any': if (this.operands(e.kids)) { w.byte(GC); w.u32(27); } return;
      case 'struct.new':
        if (!this.operands(e.kids)) return;
        w.byte(GC); w.u32(0); w.u32(this.typeIndexOf(e.heapType));
        return;
      case 'struct.get': {
        if (!this.operands(e.kids)) return;
        const heapType = e.kids[0].type.heap;
        const packed = heapType.fields[e.index].type.kind === 'packed';
        w.byte(GC); w.u32(packed ? (e.signed ? 3 : 4) : 2); w.u32(this.typeIndexOf(heapType)); w.u32(e.index);
        return;
      }
      case 'struct.set':
        if (!this.operands(e.kids)) return;
        w.byte(GC); w.u32(5); w.u32(this.typeIndexOf(e.kids[0].type.heap)); w.u32(e.index);
        return;
      case 'array.new': case 'array.new_default':
        if (!this.operands(e.kids)) return;
        w.byte(GC); w.u32(e.op === 'array.new' ? 6 : 7); w.u32(this.typeIndexOf(e.heapType));
        return;
      case 'array.new_fixed':
        if (!this.operands(e.kids)) return;
        w.byte(GC); w.u32(8); w.u32(this.typeIndexOf(e.heapType)); w.u32(e.kids.length);
        return;
      case 'array.get': {
        if (!this.operands(e.kids)) return;
        const heapType = e.kids[0].type.heap;
        const packed = heapType.element.type.kind === 'packed';
        w.byte(GC); w.u32(packed ? (e.signed ? 12 : 13) : 11); w.u32(this.typeIndexOf(heapType));
        return;
      }
      case 'array.set':
        if (!this.operands(e.kids)) return;
        w.byte(GC); w.u32(14); w.u32(this.typeIndexOf(e.kids[0].type.heap));
        return;
      case 'array.len': if (this.operands(e.kids)) { w.byte(GC); w.u32(15); } return;
      case 'array.init_data':
        if (!this.operands(e.kids)) return;
        w.byte(GC); w.u32(18); w.u32(this.typeIndexOf(e.heapType)); w.u32(e.segment);
        return;
      case 'array.copy':
        if (!this.operands(e.kids)) return;
        w.byte(GC); w.u32(17); w.u32(this.typeIndexOf(e.kids[0].type.heap)); w.u32(this.typeIndexOf(e.kids[2].type.heap));
        return;
      case 'tuple.make': this.operands(e.kids); return;
      case 'tuple.extract': {
        const [tuple] = e.kids;
        this.emit(tuple);
        if (tuple.type === unreachable) return;
        const parts = expandType(tuple.type);
        for (let i = parts.length - 1; i > e.index; i--) w.byte(0x1a);
        const local = this.scratchLocal(parts[e.index]);
        w.byte(0x21); w.u32(local);
        for (let i = e.index - 1; i >= 0; i--) w.byte(0x1a);
        w.byte(0x20); w.u32(local);
        return;
      }
      case 'pop': return;
      default:
        throw new Error(`wasm: cannot encode ${e.op}`);
    }
  }

  constValue(e) {
    const { w } = this;
    switch (e.type.name) {
      case 'i32': w.byte(0x41); w.s32(e.value); return;
      case 'i64': w.byte(0x42); w.s64(e.value); return;
      case 'f32': w.byte(0x43); w.f32(e.value); return;
      case 'f64': w.byte(0x44); w.f64(e.value); return;
      case 'v128': w.byte(0xfd); w.u32(12); w.bytes(e.value); return;
      default: throw new Error(`wasm: no constant of ${e.type.name}`);
    }
  }

  memoryIndex(name) {
    if (name == null) {
      if (!this.enc.index.memories.length) throw new Error('wasm: memory instruction without a memory');
      return 0;
    }
    return this.index(this.enc.index.memory, name, 'memory');
  }

  memarg(e) {
    const memory = this.memoryIndex(e.memory);
    const align = Math.log2(e.align);
    if (memory === 0) this.w.u32(align);
    else { this.w.u32(align | 0x40); this.w.u32(memory); }
    this.w.u32(e.offset);
  }
}

// ── Source maps ──────────────────────────────────────────────────────────────

function sourceMap(module, debug) {
  debug.sort((a, b) => a.offset - b.offset);
  const segments = [];
  let last = { offset: 0, file: 0, line: 0, column: 0 };
  for (const { offset, location } of debug) {
    const line = Math.max(0, location.line - 1);
    const column = Math.max(0, location.column);
    segments.push(vlq(offset - last.offset) + vlq(location.file - last.file) + vlq(line - last.line) + vlq(column - last.column));
    last = { offset, file: location.file, line, column };
  }
  return JSON.stringify({ version: 3, sources: module.debugFiles, names: [], mappings: segments.join(',') });
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(value) {
  let n = value < 0 ? ((-value) << 1) | 1 : value << 1;
  let out = '';
  do {
    let digit = n & 31;
    n >>>= 5;
    if (n > 0) digit |= 32;
    out += BASE64[digit];
  } while (n > 0);
  return out;
}

// ── Bytes ────────────────────────────────────────────────────────────────────

function section(out, id, fill) {
  const body = new Writer();
  fill(body);
  out.byte(id);
  out.u32(body.length);
  out.bytes(body.view());
}

function custom(out, name, fill) {
  // A custom section's contents start with its name.
  section(out, 0, w => { w.name(name); fill(w); });
}

const ENCODER = new TextEncoder();
const SCRATCH = new DataView(new ArrayBuffer(8));

export class Writer {
  constructor(capacity = 256) {
    this.buffer = new Uint8Array(capacity);
    this.length = 0;
  }

  reserve(n) {
    if (this.length + n <= this.buffer.length) return;
    let size = this.buffer.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
  }

  byte(b) {
    if (this.length === this.buffer.length) this.reserve(1);
    this.buffer[this.length++] = b;
  }

  bytes(list) {
    this.reserve(list.length);
    this.buffer.set(list, this.length);
    this.length += list.length;
  }

  u32(n) {
    let value = n >>> 0;
    do {
      let b = value & 0x7f;
      value >>>= 7;
      if (value !== 0) b |= 0x80;
      this.byte(b);
    } while (value !== 0);
  }

  s32(n) {
    let value = n | 0;
    for (;;) {
      const b = value & 0x7f;
      value >>= 7;
      if ((value === 0 && (b & 0x40) === 0) || (value === -1 && (b & 0x40) !== 0)) { this.byte(b); return; }
      this.byte(b | 0x80);
    }
  }

  s64(n) {
    let value = BigInt.asIntN(64, BigInt(n));
    for (;;) {
      const b = Number(value & 0x7fn);
      value >>= 7n;
      if ((value === 0n && (b & 0x40) === 0) || (value === -1n && (b & 0x40) !== 0)) { this.byte(b); return; }
      this.byte(b | 0x80);
    }
  }

  f32(x) {
    SCRATCH.setFloat32(0, x, true);
    for (let i = 0; i < 4; i++) this.byte(SCRATCH.getUint8(i));
  }

  f64(x) {
    SCRATCH.setFloat64(0, x, true);
    for (let i = 0; i < 8; i++) this.byte(SCRATCH.getUint8(i));
  }

  name(text) {
    const bytes = ENCODER.encode(text);
    this.u32(bytes.length);
    this.bytes(bytes);
  }

  vec(items, write) {
    this.u32(items.length);
    for (const item of items) write(item);
  }

  view() {
    return this.buffer.subarray(0, this.length);
  }
}
