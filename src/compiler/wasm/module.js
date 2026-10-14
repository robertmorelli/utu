// wasm/module.js — a wasm module under construction.
//
// Code generation builds expression trees with the interface Binaryen's JS
// API has (`m.i32.add(a, b)`, `m.block(name, children, type)`, …), and reads
// back expression types to decide what to drop, so each expression is typed
// as Binaryen types it: an expression with an operand that does not complete
// is itself `unreachable`; a block takes its last child's type or the
// values branched to it; an `if` meets its arms. Encoding (encode.js) and
// printing (text.js) read the trees.
//
// Strings are JS strings held as externref, operated on through the JS
// string builtins (`wasm:js-string`), and string constants are imported
// from the `'` module, so engines with the builtins run them natively.

import {
  codeUnitArrayType, createType, expandType, externref, f32, f64, heap, i32, i64,
  leastUpperBound, none, ref, signatureType, unpacked, unreachable, v128,
} from './types.js';
import { encodeModule } from './encode.js';
import { printModule } from './text.js';

// ── Expressions ─────────────────────────────────────────────────────────────

/**
 * One expression. `kids` are its operands in evaluation order; `br` maps the
 * labels branched to from inside it (and not caught by an inner block of the
 * same name) to the types of the values carried.
 */
export class Expr {
  constructor(op, type, kids, br) {
    this.op = op;
    this.type = type;
    this.kids = kids;
    this.br = br;
  }
}

const NO_KIDS = Object.freeze([]);

function branchesOf(kids) {
  let merged = null;
  for (const kid of kids) {
    if (!kid?.br) continue;
    if (!merged) { merged = kid.br; continue; }
    if (merged === kid.br) continue;
    const next = new Map(merged);
    for (const [label, types] of kid.br) next.set(label, [...(next.get(label) ?? []), ...types]);
    merged = next;
  }
  return merged;
}

function mergeBranches(a, b) {
  return a ? branchesOf([{ br: a }, { br: b }]) : b;
}

function without(branches, label) {
  if (!branches?.has(label)) return branches;
  const next = new Map(branches);
  next.delete(label);
  return next.size ? next : null;
}

/** `type`, unless an operand does not complete, as Binaryen types it. */
function operandsComplete(kids, type) {
  for (const kid of kids) if (kid.type === unreachable) return unreachable;
  return type;
}

function expr(op, type, kids = NO_KIDS, fields = null) {
  const e = new Expr(op, operandsComplete(kids, type), kids, kids.length ? branchesOf(kids) : null);
  if (fields) Object.assign(e, fields);
  return e;
}

// Numeric instructions: name → [opcode, result, operand types].
const T = { i32, i64, f32, f64, v128 };
const NUMERIC = new Map();
function numeric(ns, ops, result, operands) {
  for (const [name, code] of Object.entries(ops)) NUMERIC.set(`${ns}.${name}`, { code, result: T[result], operands: operands.map(o => T[o]) });
}
numeric('i32', { eqz: 0x45, clz: 0x67, ctz: 0x68, popcnt: 0x69, extend8_s: 0xc0, extend16_s: 0xc1 }, 'i32', ['i32']);
numeric('i32', { eq: 0x46, ne: 0x47, lt_s: 0x48, lt_u: 0x49, gt_s: 0x4a, gt_u: 0x4b, le_s: 0x4c, le_u: 0x4d, ge_s: 0x4e, ge_u: 0x4f,
  add: 0x6a, sub: 0x6b, mul: 0x6c, div_s: 0x6d, div_u: 0x6e, rem_s: 0x6f, rem_u: 0x70, and: 0x71, or: 0x72, xor: 0x73,
  shl: 0x74, shr_s: 0x75, shr_u: 0x76, rotl: 0x77, rotr: 0x78 }, 'i32', ['i32', 'i32']);
numeric('i64', { eqz: 0x50 }, 'i32', ['i64']);
numeric('i64', { clz: 0x79, ctz: 0x7a, popcnt: 0x7b, extend8_s: 0xc2, extend16_s: 0xc3, extend32_s: 0xc4 }, 'i64', ['i64']);
numeric('i64', { eq: 0x51, ne: 0x52, lt_s: 0x53, lt_u: 0x54, gt_s: 0x55, gt_u: 0x56, le_s: 0x57, le_u: 0x58, ge_s: 0x59, ge_u: 0x5a }, 'i32', ['i64', 'i64']);
numeric('i64', { add: 0x7c, sub: 0x7d, mul: 0x7e, div_s: 0x7f, div_u: 0x80, rem_s: 0x81, rem_u: 0x82, and: 0x83, or: 0x84, xor: 0x85,
  shl: 0x86, shr_s: 0x87, shr_u: 0x88, rotl: 0x89, rotr: 0x8a }, 'i64', ['i64', 'i64']);
numeric('f32', { eq: 0x5b, ne: 0x5c, lt: 0x5d, gt: 0x5e, le: 0x5f, ge: 0x60 }, 'i32', ['f32', 'f32']);
numeric('f64', { eq: 0x61, ne: 0x62, lt: 0x63, gt: 0x64, le: 0x65, ge: 0x66 }, 'i32', ['f64', 'f64']);
numeric('f32', { abs: 0x8b, neg: 0x8c, ceil: 0x8d, floor: 0x8e, trunc: 0x8f, nearest: 0x90, sqrt: 0x91 }, 'f32', ['f32']);
numeric('f32', { add: 0x92, sub: 0x93, mul: 0x94, div: 0x95, min: 0x96, max: 0x97, copysign: 0x98 }, 'f32', ['f32', 'f32']);
numeric('f64', { abs: 0x99, neg: 0x9a, ceil: 0x9b, floor: 0x9c, trunc: 0x9d, nearest: 0x9e, sqrt: 0x9f }, 'f64', ['f64']);
numeric('f64', { add: 0xa0, sub: 0xa1, mul: 0xa2, div: 0xa3, min: 0xa4, max: 0xa5, copysign: 0xa6 }, 'f64', ['f64', 'f64']);
// Conversions, named as Binaryen names them: `i32.wrap`, `f64.convert_s.i32`, `i32.trunc_s_sat.f64`.
numeric('i32', { wrap: 0xa7 }, 'i32', ['i64']);
numeric('i32', { 'trunc_s.f32': 0xa8, 'trunc_u.f32': 0xa9, reinterpret: 0xbc }, 'i32', ['f32']);
numeric('i32', { 'trunc_s.f64': 0xaa, 'trunc_u.f64': 0xab }, 'i32', ['f64']);
numeric('i64', { extend_s: 0xac, extend_u: 0xad }, 'i64', ['i32']);
numeric('i64', { 'trunc_s.f32': 0xae, 'trunc_u.f32': 0xaf }, 'i64', ['f32']);
numeric('i64', { 'trunc_s.f64': 0xb0, 'trunc_u.f64': 0xb1, reinterpret: 0xbd }, 'i64', ['f64']);
numeric('f32', { 'convert_s.i32': 0xb2, 'convert_u.i32': 0xb3, reinterpret: 0xbe }, 'f32', ['i32']);
numeric('f32', { 'convert_s.i64': 0xb4, 'convert_u.i64': 0xb5 }, 'f32', ['i64']);
numeric('f32', { demote: 0xb6 }, 'f32', ['f64']);
numeric('f64', { 'convert_s.i32': 0xb7, 'convert_u.i32': 0xb8 }, 'f64', ['i32']);
numeric('f64', { 'convert_s.i64': 0xb9, 'convert_u.i64': 0xba, reinterpret: 0xbf }, 'f64', ['i64']);
numeric('f64', { promote: 0xbb }, 'f64', ['f32']);
numeric('i32', { 'trunc_s_sat.f32': [0xfc, 0], 'trunc_u_sat.f32': [0xfc, 1] }, 'i32', ['f32']);
numeric('i32', { 'trunc_s_sat.f64': [0xfc, 2], 'trunc_u_sat.f64': [0xfc, 3] }, 'i32', ['f64']);
numeric('i64', { 'trunc_s_sat.f32': [0xfc, 4], 'trunc_u_sat.f32': [0xfc, 5] }, 'i64', ['f32']);
numeric('i64', { 'trunc_s_sat.f64': [0xfc, 6], 'trunc_u_sat.f64': [0xfc, 7] }, 'i64', ['f64']);
numeric('v128', { not: [0xfd, 77] }, 'v128', ['v128']);
numeric('v128', { and: [0xfd, 78], andnot: [0xfd, 79], or: [0xfd, 80], xor: [0xfd, 81] }, 'v128', ['v128', 'v128']);
numeric('v128', { bitselect: [0xfd, 82] }, 'v128', ['v128', 'v128', 'v128']);
numeric('v128', { any_true: [0xfd, 83] }, 'i32', ['v128']);

// Loads and stores: name → [opcode, value type, natural alignment in bytes].
const LOADS = {
  'i32.load': [0x28, i32, 4], 'i64.load': [0x29, i64, 8], 'f32.load': [0x2a, f32, 4], 'f64.load': [0x2b, f64, 8],
  'i32.load8_s': [0x2c, i32, 1], 'i32.load8_u': [0x2d, i32, 1], 'i32.load16_s': [0x2e, i32, 2], 'i32.load16_u': [0x2f, i32, 2],
  'i64.load8_s': [0x30, i64, 1], 'i64.load8_u': [0x31, i64, 1], 'i64.load16_s': [0x32, i64, 2], 'i64.load16_u': [0x33, i64, 2],
  'i64.load32_s': [0x34, i64, 4], 'i64.load32_u': [0x35, i64, 4],
};
const STORES = {
  'i32.store': [0x36, 4], 'i64.store': [0x37, 8], 'f32.store': [0x38, 4], 'f64.store': [0x39, 8],
  'i32.store8': [0x3a, 1], 'i32.store16': [0x3b, 2], 'i64.store8': [0x3c, 1], 'i64.store16': [0x3d, 2], 'i64.store32': [0x3e, 4],
};

// The JS string builtins: name → [param types, result type], with (array (mut i16)) for char codes.
const CODE_UNITS = ref(codeUnitArrayType(), true);
const STRING_REF = ref(heap.extern, false);
const STRING_BUILTINS = {
  fromCharCodeArray: [[CODE_UNITS, i32, i32], STRING_REF],
  intoCharCodeArray: [[externref, CODE_UNITS, i32], i32],
  fromCharCode: [[i32], STRING_REF],
  fromCodePoint: [[i32], STRING_REF],
  charCodeAt: [[externref, i32], i32],
  codePointAt: [[externref, i32], i32],
  length: [[externref], i32],
  concat: [[externref, externref], STRING_REF],
  substring: [[externref, i32, i32], STRING_REF],
  equals: [[externref, externref], i32],
  compare: [[externref, externref], i32],
};

// ── Module ──────────────────────────────────────────────────────────────────

export class Module {
  constructor() {
    this.functions = [];
    this.functionsByName = new Map();
    this.globals = [];
    this.globalsByName = new Map();
    this.tags = [];
    this.tagsByName = new Map();
    this.memories = [];
    this.memoriesByName = new Map();
    this.dataSegments = [];
    this.arrayInits = [];
    this.exports = [];
    this.debugFiles = [];
    this.stringConstants = new Map();
    this.installNamespaces();
  }

  // ── Declarations ──

  addFunction(name, params, results, vars, body) {
    const fn = { name, params, results, vars: [...vars], body, import: null, debug: null };
    this.declareFunction(fn);
    return fn;
  }

  addFunctionImport(name, module, base, params, results) {
    this.declareFunction({ name, params, results, vars: [], body: null, import: { module, base }, debug: null });
  }

  declareFunction(fn) {
    if (this.functionsByName.has(fn.name)) throw new Error(`wasm: function "${fn.name}" is defined twice`);
    fn.type = signatureType(fn.params, fn.results);
    this.functions.push(fn);
    this.functionsByName.set(fn.name, fn);
  }

  getFunction(name) {
    return this.functionsByName.get(name) ?? null;
  }

  addGlobal(name, type, mutable, init) {
    this.declareGlobal({ name, type, mutable: Boolean(mutable), init, import: null });
  }

  addGlobalImport(name, module, base, type, mutable = false) {
    this.declareGlobal({ name, type, mutable: Boolean(mutable), init: null, import: { module, base } });
  }

  declareGlobal(global) {
    if (this.globalsByName.has(global.name)) throw new Error(`wasm: global "${global.name}" is defined twice`);
    this.globals.push(global);
    this.globalsByName.set(global.name, global);
  }

  addTagImport(name, module, base, params, results) {
    const tag = { name, params, results, type: signatureType(params, results), import: { module, base } };
    this.tags.push(tag);
    this.tagsByName.set(name, tag);
  }

  /** A linear memory: `initial` and `maximum` in pages, optionally exported or imported. */
  addMemory({ name, initial, maximum, exported = false, import: imported = null }) {
    const memory = { name, initial, maximum, exported, import: imported };
    this.memories.push(memory);
    this.memoriesByName.set(name, memory);
  }

  /**
   * Bytes copied into `memory` at `offset` when the module is instantiated;
   * with no memory, a passive segment an instruction copies from. Returns
   * the segment's index.
   */
  addDataSegment(memory, offset, bytes) {
    this.dataSegments.push({ memory, offset, bytes });
    return this.dataSegments.length - 1;
  }

  /**
   * When the module starts, `count` elements of the array in `global` (of
   * `heapType`) are copied from passive data segment `segment`. A start
   * function does it, for the globals the exports reach (see encode.js).
   */
  addArrayInit(global, heapType, segment, count) {
    this.arrayInits.push({ global, heapType, segment, count });
  }

  addFunctionExport(internalName, externalName) {
    this.exports.push({ kind: 'func', internal: internalName, name: externalName });
  }

  // ── Debug information ──

  addDebugInfoFileName(file) {
    this.debugFiles.push(file);
    return this.debugFiles.length - 1;
  }

  setDebugLocation(fn, expression, file, line, column) {
    (fn.debug ??= new Map()).set(expression, { file, line, column });
  }

  // ── Output ──

  validate() {
    try {
      this.emitBinary();
      return true;
    } catch {
      return false;
    }
  }

  /** The binary, or `{ binary, sourceMap }` given the URL the binary should name its source map by. */
  emitBinary(sourceMapUrl) {
    const { bytes, sourceMap } = encodeModule(this, { sourceMapUrl });
    assertValid(bytes);
    return sourceMapUrl ? { binary: bytes, sourceMap } : bytes;
  }

  emitText() {
    return printModule(this);
  }

  dispose() {}

  // ── Imports this module adds for itself ──

  stringBuiltin(name) {
    const internal = `__js_string_${name}`;
    if (!this.functionsByName.has(internal)) {
      const [params, result] = STRING_BUILTINS[name];
      this.addFunctionImport(internal, 'wasm:js-string', name, createType(params), result);
    }
    return internal;
  }

  /** The global holding string constant `text`, imported from the `'` module. */
  stringConstant(text) {
    let name = this.stringConstants.get(text);
    if (!name) {
      name = `__string_const_${this.stringConstants.size}`;
      this.stringConstants.set(text, name);
      this.addGlobalImport(name, "'", text, STRING_REF, false);
    }
    return name;
  }

  // ── Expression builders ──

  nop() { return expr('nop', none); }
  unreachable() { return expr('unreachable', unreachable); }
  drop(value) { return expr('drop', none, [value]); }

  return(value) {
    return expr('return', unreachable, value ? [value] : NO_KIDS);
  }

  select(condition, ifTrue, ifFalse) {
    return expr('select', leastUpperBound(ifTrue.type, ifFalse.type), [ifTrue, ifFalse, condition]);
  }

  block(name, children, type) {
    const kids = [...children];
    const branches = branchesOf(kids);
    const targeted = name ? branches?.get(name) : null;
    let resultType;
    if (type !== undefined) {
      resultType = type;
      if (type === none && kids.length && !targeted && kids.some(kid => kid.type === unreachable)) resultType = unreachable;
    } else if (!kids.length) {
      resultType = none;
    } else {
      const last = kids[kids.length - 1].type;
      if (targeted) {
        resultType = last === unreachable ? null : last;
        for (const carried of targeted) resultType = resultType == null ? carried : leastUpperBound(resultType, carried);
      } else {
        resultType = last === none && kids.some(kid => kid.type === unreachable) ? unreachable : last;
      }
    }
    // A block nothing branches to needs no label (encoding emits its contents).
    return Object.assign(new Expr('block', resultType, kids, name ? without(branches, name) : branches),
      { name: name ?? null, targeted: Boolean(targeted) });
  }

  loop(name, body) {
    return Object.assign(new Expr('loop', body.type, [body], without(body.br, name)), { name });
  }

  if(condition, ifTrue, ifFalse) {
    let type = ifFalse ? leastUpperBound(ifTrue.type, ifFalse.type) : none;
    if (type === none && condition.type === unreachable) type = unreachable;
    const kids = ifFalse ? [condition, ifTrue, ifFalse] : [condition, ifTrue];
    return new Expr('if', type, kids, branchesOf(kids));
  }

  br(name, condition, value) {
    const kids = [...(value ? [value] : []), ...(condition ? [condition] : [])];
    const type = condition ? operandsComplete(kids, value ? value.type : none) : unreachable;
    const own = new Map([[name, [value ? value.type : none]]]);
    const e = new Expr('br', type, kids, mergeBranches(branchesOf(kids), own));
    return Object.assign(e, { name, conditional: Boolean(condition) });
  }

  switch(names, defaultName, condition, value) {
    const kids = [...(value ? [value] : []), condition];
    const carried = value ? value.type : none;
    const own = new Map([...names, defaultName].map(name => [name, [carried]]));
    const e = new Expr('br_table', unreachable, kids, mergeBranches(branchesOf(kids), own));
    return Object.assign(e, { names: [...names], defaultName });
  }

  try(name, body, catchTags, catchBodies) {
    let type = body.type;
    for (const handler of catchBodies) type = leastUpperBound(type, handler.type);
    const kids = [body, ...catchBodies];
    const e = new Expr('try', type, kids, name ? without(branchesOf(kids), name) : branchesOf(kids));
    return Object.assign(e, { name: name ?? null, tags: [...catchTags] });
  }

  call(name, operands, type) {
    return expr('call', type, [...operands], { target: name });
  }

  call_ref(target, operands, type) {
    return expr('call_ref', type, [...operands, target]);
  }

  /** The value a `catch` receives, which its body pops first. */
  pop(type) {
    return expr('pop', type);
  }

  installNamespaces() {
    const m = this;
    for (const ns of ['i32', 'i64', 'f32', 'f64', 'v128']) {
      const space = (m[ns] = {});
      for (const [qualified, info] of NUMERIC) {
        if (!qualified.startsWith(`${ns}.`)) continue;
        const path = qualified.slice(ns.length + 1).split('.');
        const build = (...operands) => expr('numeric', info.result, operands, { code: info.code, name: qualified });
        if (path.length === 1) space[path[0]] = build;
        else (space[path[0]] ??= {})[path[1]] = build;
      }
      for (const [qualified, [code, type, natural]] of Object.entries(LOADS)) {
        if (!qualified.startsWith(`${ns}.`)) continue;
        space[qualified.slice(ns.length + 1)] = (offset, align, ptr, memory) =>
          expr('load', type, [ptr], { code, name: qualified, offset, align: align || natural, memory: memory ?? null });
      }
      for (const [qualified, [code, natural]] of Object.entries(STORES)) {
        if (!qualified.startsWith(`${ns}.`)) continue;
        space[qualified.slice(ns.length + 1)] = (offset, align, ptr, value, memory) =>
          expr('store', none, [ptr, value], { code, name: qualified, offset, align: align || natural, memory: memory ?? null });
      }
    }
    m.i32.const = value => expr('const', i32, NO_KIDS, { value: value | 0 });
    m.i64.const = value => expr('const', i64, NO_KIDS, { value: BigInt.asIntN(64, BigInt(value)) });
    m.f32.const = value => expr('const', f32, NO_KIDS, { value: Math.fround(value) });
    m.f64.const = value => expr('const', f64, NO_KIDS, { value: Number(value) });
    m.v128.const = bytes => expr('const', v128, NO_KIDS, { value: Uint8Array.from(bytes) });

    m.local = {
      get: (index, type) => expr('local.get', type, NO_KIDS, { index }),
      set: (index, value) => expr('local.set', none, [value], { index }),
      tee: (index, value, type) => expr('local.tee', type, [value], { index }),
    };
    m.global = {
      get: (name, type) => expr('global.get', type ?? m.globalsByName.get(name)?.type, NO_KIDS, { target: name }),
      set: (name, value) => expr('global.set', none, [value], { target: name }),
    };
    m.memory = {
      size: memory => expr('memory.size', i32, NO_KIDS, { memory: memory ?? null }),
      grow: (delta, memory) => expr('memory.grow', i32, [delta], { memory: memory ?? null }),
    };
    m.ref = {
      // Binaryen types a null by the bottom of its hierarchy.
      null: type => expr('ref.null', ref(type.heap.bottom, true)),
      is_null: value => expr('ref.is_null', i32, [value]),
      as_non_null: value => expr('ref.as_non_null', value.type.kind === 'ref' ? ref(value.type.heap, false) : value.type, [value]),
      func: (name, type) => expr('ref.func', type, NO_KIDS, { target: name }),
      eq: (left, right) => expr('ref.eq', i32, [left, right]),
      test: (value, type) => expr('ref.test', i32, [value], { castType: type }),
      cast: (value, type) => expr('ref.cast', castResult(value.type, type), [value], { castType: type }),
      i31: value => expr('ref.i31', ref(heap.i31, false), [value]),
    };
    m.i31 = {
      get_s: value => expr('i31.get', i32, [value], { signed: true }),
      get_u: value => expr('i31.get', i32, [value], { signed: false }),
    };
    m.any = {
      convert_extern: value => expr('any.convert_extern', ref(heap.any, value.type.nullable ?? true), [value]),
    };
    m.extern = {
      convert_any: value => expr('extern.convert_any', ref(heap.extern, value.type.nullable ?? true), [value]),
    };
    m.struct = {
      new: (operands, heapType) => expr('struct.new', ref(heapType, false), [...operands], { heapType }),
      get: (index, value, type, signed) => expr('struct.get', unpacked(fieldOf(value, index)?.type ?? type), [value], { index, signed: Boolean(signed) }),
      set: (index, value, operand) => expr('struct.set', none, [value, operand], { index }),
    };
    m.array = {
      new: (heapType, size, init) => expr('array.new', ref(heapType, false), [init, size], { heapType }),
      new_default: (heapType, size) => expr('array.new_default', ref(heapType, false), [size], { heapType }),
      new_fixed: (heapType, values) => expr('array.new_fixed', ref(heapType, false), [...values], { heapType }),
      get: (value, index, type, signed) => expr('array.get', unpacked(elementOf(value)?.type ?? type), [value, index], { signed: Boolean(signed) }),
      set: (value, index, operand) => expr('array.set', none, [value, index, operand]),
      len: value => expr('array.len', i32, [value]),
      copy: (destination, destinationIndex, source, sourceIndex, length) =>
        expr('array.copy', none, [destination, destinationIndex, source, sourceIndex, length]),
      init_data: (heapType, segment, array, index, offset, length) =>
        expr('array.init_data', none, [array, index, offset, length], { heapType, segment }),
    };
    m.tuple = {
      make: operands => expr('tuple.make', createType(operands.map(operand => operand.type)), [...operands]),
      extract: (tuple, index) => expr('tuple.extract', tuple.type === unreachable ? unreachable : expandType(tuple.type)[index], [tuple], { index }),
    };
    m.string = {
      // A string that is not valid UTF-16 cannot be an import name; it is built from its code units.
      const: text => (isWellFormed(text)
        ? expr('global.get', STRING_REF, NO_KIDS, { target: m.stringConstant(text) })
        : m.string.fromCharCodeArray(
          m.array.new_fixed(CODE_UNITS.heap, Array.from({ length: text.length }, (_, i) => m.i32.const(text.charCodeAt(i)))),
          m.i32.const(0), m.i32.const(text.length))),
      concat: (left, right) => m.call(m.stringBuiltin('concat'), [left, right], STRING_REF),
      equals: (left, right) => m.call(m.stringBuiltin('equals'), [left, right], i32),
      length: value => m.call(m.stringBuiltin('length'), [value], i32),
      substring: (value, start, end) => m.call(m.stringBuiltin('substring'), [value, start, end], STRING_REF),
      charCodeAt: (value, index) => m.call(m.stringBuiltin('charCodeAt'), [value, index], i32),
      fromCodePoint: code => m.call(m.stringBuiltin('fromCodePoint'), [code], STRING_REF),
      fromCharCodeArray: (array, start, end) => m.call(m.stringBuiltin('fromCharCodeArray'), [array, start, end], STRING_REF),
    };
  }
}

/** A cast keeps its operand's non-nullness (Binaryen refines to the greatest lower bound). */
function castResult(valueType, castType) {
  if (valueType === unreachable) return unreachable;
  if (valueType.kind === 'ref' && !valueType.nullable && castType.nullable) return ref(castType.heap, false);
  return castType;
}

function fieldOf(value, index) {
  const heapType = value.type?.heap;
  return heapType && !heapType.abstract ? heapType.fields?.[index] : null;
}

function elementOf(value) {
  const heapType = value.type?.heap;
  return heapType && !heapType.abstract ? heapType.element : null;
}

/** Whether a string can be an import name (valid UTF-16, so valid UTF-8). */
function isWellFormed(text) {
  return !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);
}

/** Throw with the engine's message if `bytes` is not a valid module. */
function assertValid(bytes) {
  if (typeof WebAssembly === 'undefined' || WebAssembly.validate(bytes)) return;
  let message = 'invalid module';
  try {
    new WebAssembly.Module(bytes);
  } catch (error) {
    message = error.message;
  }
  throw new Error(`codegen: wasm validation failed: ${message}`);
}

