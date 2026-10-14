// src/wat/assemble.js — `@wat` bodies: WebAssembly text, assembled.
//
// A function whose body is `@wat/\ … \/` is that WAT: instructions, flat or
// folded, over its parameters, which are named by their utu names
// (`local.get $x`), after any `(local $t i32)` declarations. This assembles
// the text into the function's code (its locals and instructions) and checks
// it as the engine would (operand types, labels, what the body leaves), so a
// mistake is reported at its place in the text rather than as an invalid
// module.
//
//   assembleFunction({ params: [{ name, type }], result, text })
//     → { code }   the function's code: locals, instructions, `end`
//     → { error: { message, start, end } }   offsets in `text`
//
// Types are wasm's (i32, i64, f32, f64, v128; `result` is one or null). The
// instructions are the numeric and vector ones, locals, constants, and
// control (block, loop, if, br, br_if, br_table, return, select, drop):
// a @wat function computes on its arguments, so there are no memories,
// globals, calls, or references. Both compilers use this; the compiler
// gives it the function's signature and puts the code in the module.

const VALTYPE = { i32: 0x7f, i64: 0x7e, f32: 0x7d, f64: 0x7c, v128: 0x7b };

// ── The instructions ─────────────────────────────────────────────────────────
//
// name → { bytes, ins, outs, imm }: its opcode (with any prefix), the types it
// takes and leaves, and what follows its name (an immediate kind, or null).

const OPS = new Map();

function define(name, bytes, ins, outs, imm = null) {
  OPS.set(name, { bytes, ins, outs, imm });
}

/** An opcode with a prefix byte: the prefix, then the opcode as LEB128. */
function prefixed(prefix, code) {
  return [prefix, ...leb128(code)];
}

{
  const compares = ['eqz', 'eq', 'ne', 'lt_s', 'lt_u', 'gt_s', 'gt_u', 'le_s', 'le_u', 'ge_s', 'ge_u'];
  for (const [t, base] of [['i32', 0x45], ['i64', 0x50]]) {
    compares.forEach((op, k) => define(`${t}.${op}`, [base + k], op === 'eqz' ? [t] : [t, t], ['i32']));
  }
  for (const [t, base] of [['f32', 0x5b], ['f64', 0x61]]) {
    ['eq', 'ne', 'lt', 'gt', 'le', 'ge'].forEach((op, k) => define(`${t}.${op}`, [base + k], [t, t], ['i32']));
  }
  const intOps = ['clz', 'ctz', 'popcnt', 'add', 'sub', 'mul', 'div_s', 'div_u', 'rem_s', 'rem_u', 'and', 'or', 'xor', 'shl', 'shr_s', 'shr_u', 'rotl', 'rotr'];
  for (const [t, base] of [['i32', 0x67], ['i64', 0x79]]) {
    intOps.forEach((op, k) => define(`${t}.${op}`, [base + k], k < 3 ? [t] : [t, t], [t]));
  }
  const floatOps = ['abs', 'neg', 'ceil', 'floor', 'trunc', 'nearest', 'sqrt', 'add', 'sub', 'mul', 'div', 'min', 'max', 'copysign'];
  for (const [t, base] of [['f32', 0x8b], ['f64', 0x99]]) {
    floatOps.forEach((op, k) => define(`${t}.${op}`, [base + k], k < 7 ? [t] : [t, t], [t]));
  }
  const conversions = [
    ['i32.wrap_i64', 'i64', 'i32'], ['i32.trunc_f32_s', 'f32', 'i32'], ['i32.trunc_f32_u', 'f32', 'i32'],
    ['i32.trunc_f64_s', 'f64', 'i32'], ['i32.trunc_f64_u', 'f64', 'i32'], ['i64.extend_i32_s', 'i32', 'i64'],
    ['i64.extend_i32_u', 'i32', 'i64'], ['i64.trunc_f32_s', 'f32', 'i64'], ['i64.trunc_f32_u', 'f32', 'i64'],
    ['i64.trunc_f64_s', 'f64', 'i64'], ['i64.trunc_f64_u', 'f64', 'i64'], ['f32.convert_i32_s', 'i32', 'f32'],
    ['f32.convert_i32_u', 'i32', 'f32'], ['f32.convert_i64_s', 'i64', 'f32'], ['f32.convert_i64_u', 'i64', 'f32'],
    ['f32.demote_f64', 'f64', 'f32'], ['f64.convert_i32_s', 'i32', 'f64'], ['f64.convert_i32_u', 'i32', 'f64'],
    ['f64.convert_i64_s', 'i64', 'f64'], ['f64.convert_i64_u', 'i64', 'f64'], ['f64.promote_f32', 'f32', 'f64'],
    ['i32.reinterpret_f32', 'f32', 'i32'], ['i64.reinterpret_f64', 'f64', 'i64'], ['f32.reinterpret_i32', 'i32', 'f32'],
    ['f64.reinterpret_i64', 'i64', 'f64'], ['i32.extend8_s', 'i32', 'i32'], ['i32.extend16_s', 'i32', 'i32'],
    ['i64.extend8_s', 'i64', 'i64'], ['i64.extend16_s', 'i64', 'i64'], ['i64.extend32_s', 'i64', 'i64'],
  ];
  conversions.forEach(([name, from, to], k) => define(name, [0xa7 + k], [from], [to]));
  [
    ['i32.trunc_sat_f32_s', 'f32', 'i32'], ['i32.trunc_sat_f32_u', 'f32', 'i32'], ['i32.trunc_sat_f64_s', 'f64', 'i32'],
    ['i32.trunc_sat_f64_u', 'f64', 'i32'], ['i64.trunc_sat_f32_s', 'f32', 'i64'], ['i64.trunc_sat_f32_u', 'f32', 'i64'],
    ['i64.trunc_sat_f64_s', 'f64', 'i64'], ['i64.trunc_sat_f64_u', 'f64', 'i64'],
  ].forEach(([name, from, to], k) => define(name, prefixed(0xfc, k), [from], [to]));

  // Vector instructions. A lane's scalar type, by shape.
  const LANE = { i8x16: 'i32', i16x8: 'i32', i32x4: 'i32', i64x2: 'i64', f32x4: 'f32', f64x2: 'f64' };
  const V = 'v128';
  const simd = (name, code, ins, outs, imm = null) => define(name, prefixed(0xfd, code), ins, outs, imm);
  const unary = (name, code) => simd(name, code, [V], [V]);
  const binary = (name, code) => simd(name, code, [V, V], [V]);
  const test = (name, code) => simd(name, code, [V], ['i32']);
  const shift = (name, code) => simd(name, code, [V, 'i32'], [V]);
  simd('v128.const', 0x0c, [], [V], 'v128');
  simd('i8x16.shuffle', 0x0d, [V, V], [V], 'shuffle');
  binary('i8x16.swizzle', 0x0e);
  Object.keys(LANE).forEach((shape, k) => simd(`${shape}.splat`, 0x0f + k, [LANE[shape]], [V]));
  [
    ['i8x16.extract_lane_s', 'i8x16'], ['i8x16.extract_lane_u', 'i8x16'], ['i8x16.replace_lane', 'i8x16'],
    ['i16x8.extract_lane_s', 'i16x8'], ['i16x8.extract_lane_u', 'i16x8'], ['i16x8.replace_lane', 'i16x8'],
    ['i32x4.extract_lane', 'i32x4'], ['i32x4.replace_lane', 'i32x4'], ['i64x2.extract_lane', 'i64x2'],
    ['i64x2.replace_lane', 'i64x2'], ['f32x4.extract_lane', 'f32x4'], ['f32x4.replace_lane', 'f32x4'],
    ['f64x2.extract_lane', 'f64x2'], ['f64x2.replace_lane', 'f64x2'],
  ].forEach(([name, shape], k) => {
    const replace = name.endsWith('replace_lane');
    simd(name, 0x15 + k, replace ? [V, LANE[shape]] : [V], replace ? [V] : [LANE[shape]], `lane${16 / ({ i8x16: 1, i16x8: 2, i32x4: 4, i64x2: 8, f32x4: 4, f64x2: 8 })[shape]}`);
  });
  for (const [shape, base] of [['i8x16', 0x23], ['i16x8', 0x2d], ['i32x4', 0x37]]) {
    compares.slice(1).forEach((op, k) => binary(`${shape}.${op}`, base + k));
  }
  for (const [shape, base] of [['f32x4', 0x41], ['f64x2', 0x47]]) {
    ['eq', 'ne', 'lt', 'gt', 'le', 'ge'].forEach((op, k) => binary(`${shape}.${op}`, base + k));
  }
  unary('v128.not', 0x4d);
  binary('v128.and', 0x4e);
  binary('v128.andnot', 0x4f);
  binary('v128.or', 0x50);
  binary('v128.xor', 0x51);
  simd('v128.bitselect', 0x52, [V, V, V], [V]);
  test('v128.any_true', 0x53);
  unary('f32x4.demote_f64x2_zero', 0x5e);
  unary('f64x2.promote_low_f32x4', 0x5f);
  const table = [
    // [opcode, name, kind]: u unary, b binary, t test (→ i32), s shift
    [0x60, 'i8x16.abs', 'u'], [0x61, 'i8x16.neg', 'u'], [0x62, 'i8x16.popcnt', 'u'], [0x63, 'i8x16.all_true', 't'],
    [0x64, 'i8x16.bitmask', 't'], [0x65, 'i8x16.narrow_i16x8_s', 'b'], [0x66, 'i8x16.narrow_i16x8_u', 'b'],
    [0x67, 'f32x4.ceil', 'u'], [0x68, 'f32x4.floor', 'u'], [0x69, 'f32x4.trunc', 'u'], [0x6a, 'f32x4.nearest', 'u'],
    [0x6b, 'i8x16.shl', 's'], [0x6c, 'i8x16.shr_s', 's'], [0x6d, 'i8x16.shr_u', 's'], [0x6e, 'i8x16.add', 'b'],
    [0x6f, 'i8x16.add_sat_s', 'b'], [0x70, 'i8x16.add_sat_u', 'b'], [0x71, 'i8x16.sub', 'b'], [0x72, 'i8x16.sub_sat_s', 'b'],
    [0x73, 'i8x16.sub_sat_u', 'b'], [0x74, 'f64x2.ceil', 'u'], [0x75, 'f64x2.floor', 'u'], [0x76, 'i8x16.min_s', 'b'],
    [0x77, 'i8x16.min_u', 'b'], [0x78, 'i8x16.max_s', 'b'], [0x79, 'i8x16.max_u', 'b'], [0x7a, 'f64x2.trunc', 'u'],
    [0x7b, 'i8x16.avgr_u', 'b'], [0x7c, 'i16x8.extadd_pairwise_i8x16_s', 'u'], [0x7d, 'i16x8.extadd_pairwise_i8x16_u', 'u'],
    [0x7e, 'i32x4.extadd_pairwise_i16x8_s', 'u'], [0x7f, 'i32x4.extadd_pairwise_i16x8_u', 'u'],
    [0x80, 'i16x8.abs', 'u'], [0x81, 'i16x8.neg', 'u'], [0x82, 'i16x8.q15mulr_sat_s', 'b'], [0x83, 'i16x8.all_true', 't'],
    [0x84, 'i16x8.bitmask', 't'], [0x85, 'i16x8.narrow_i32x4_s', 'b'], [0x86, 'i16x8.narrow_i32x4_u', 'b'],
    [0x87, 'i16x8.extend_low_i8x16_s', 'u'], [0x88, 'i16x8.extend_high_i8x16_s', 'u'], [0x89, 'i16x8.extend_low_i8x16_u', 'u'],
    [0x8a, 'i16x8.extend_high_i8x16_u', 'u'], [0x8b, 'i16x8.shl', 's'], [0x8c, 'i16x8.shr_s', 's'], [0x8d, 'i16x8.shr_u', 's'],
    [0x8e, 'i16x8.add', 'b'], [0x8f, 'i16x8.add_sat_s', 'b'], [0x90, 'i16x8.add_sat_u', 'b'], [0x91, 'i16x8.sub', 'b'],
    [0x92, 'i16x8.sub_sat_s', 'b'], [0x93, 'i16x8.sub_sat_u', 'b'], [0x94, 'f64x2.nearest', 'u'], [0x95, 'i16x8.mul', 'b'],
    [0x96, 'i16x8.min_s', 'b'], [0x97, 'i16x8.min_u', 'b'], [0x98, 'i16x8.max_s', 'b'], [0x99, 'i16x8.max_u', 'b'],
    [0x9b, 'i16x8.avgr_u', 'b'], [0x9c, 'i16x8.extmul_low_i8x16_s', 'b'], [0x9d, 'i16x8.extmul_high_i8x16_s', 'b'],
    [0x9e, 'i16x8.extmul_low_i8x16_u', 'b'], [0x9f, 'i16x8.extmul_high_i8x16_u', 'b'],
    [0xa0, 'i32x4.abs', 'u'], [0xa1, 'i32x4.neg', 'u'], [0xa3, 'i32x4.all_true', 't'], [0xa4, 'i32x4.bitmask', 't'],
    [0xa7, 'i32x4.extend_low_i16x8_s', 'u'], [0xa8, 'i32x4.extend_high_i16x8_s', 'u'], [0xa9, 'i32x4.extend_low_i16x8_u', 'u'],
    [0xaa, 'i32x4.extend_high_i16x8_u', 'u'], [0xab, 'i32x4.shl', 's'], [0xac, 'i32x4.shr_s', 's'], [0xad, 'i32x4.shr_u', 's'],
    [0xae, 'i32x4.add', 'b'], [0xb1, 'i32x4.sub', 'b'], [0xb5, 'i32x4.mul', 'b'], [0xb6, 'i32x4.min_s', 'b'],
    [0xb7, 'i32x4.min_u', 'b'], [0xb8, 'i32x4.max_s', 'b'], [0xb9, 'i32x4.max_u', 'b'], [0xba, 'i32x4.dot_i16x8_s', 'b'],
    [0xbc, 'i32x4.extmul_low_i16x8_s', 'b'], [0xbd, 'i32x4.extmul_high_i16x8_s', 'b'], [0xbe, 'i32x4.extmul_low_i16x8_u', 'b'],
    [0xbf, 'i32x4.extmul_high_i16x8_u', 'b'],
    [0xc0, 'i64x2.abs', 'u'], [0xc1, 'i64x2.neg', 'u'], [0xc3, 'i64x2.all_true', 't'], [0xc4, 'i64x2.bitmask', 't'],
    [0xc7, 'i64x2.extend_low_i32x4_s', 'u'], [0xc8, 'i64x2.extend_high_i32x4_s', 'u'], [0xc9, 'i64x2.extend_low_i32x4_u', 'u'],
    [0xca, 'i64x2.extend_high_i32x4_u', 'u'], [0xcb, 'i64x2.shl', 's'], [0xcc, 'i64x2.shr_s', 's'], [0xcd, 'i64x2.shr_u', 's'],
    [0xce, 'i64x2.add', 'b'], [0xd1, 'i64x2.sub', 'b'], [0xd5, 'i64x2.mul', 'b'], [0xd6, 'i64x2.eq', 'b'], [0xd7, 'i64x2.ne', 'b'],
    [0xd8, 'i64x2.lt_s', 'b'], [0xd9, 'i64x2.gt_s', 'b'], [0xda, 'i64x2.le_s', 'b'], [0xdb, 'i64x2.ge_s', 'b'],
    [0xdc, 'i64x2.extmul_low_i32x4_s', 'b'], [0xdd, 'i64x2.extmul_high_i32x4_s', 'b'], [0xde, 'i64x2.extmul_low_i32x4_u', 'b'],
    [0xdf, 'i64x2.extmul_high_i32x4_u', 'b'],
    [0xe0, 'f32x4.abs', 'u'], [0xe1, 'f32x4.neg', 'u'], [0xe3, 'f32x4.sqrt', 'u'], [0xe4, 'f32x4.add', 'b'], [0xe5, 'f32x4.sub', 'b'],
    [0xe6, 'f32x4.mul', 'b'], [0xe7, 'f32x4.div', 'b'], [0xe8, 'f32x4.min', 'b'], [0xe9, 'f32x4.max', 'b'], [0xea, 'f32x4.pmin', 'b'],
    [0xeb, 'f32x4.pmax', 'b'],
    [0xec, 'f64x2.abs', 'u'], [0xed, 'f64x2.neg', 'u'], [0xef, 'f64x2.sqrt', 'u'], [0xf0, 'f64x2.add', 'b'], [0xf1, 'f64x2.sub', 'b'],
    [0xf2, 'f64x2.mul', 'b'], [0xf3, 'f64x2.div', 'b'], [0xf4, 'f64x2.min', 'b'], [0xf5, 'f64x2.max', 'b'], [0xf6, 'f64x2.pmin', 'b'],
    [0xf7, 'f64x2.pmax', 'b'],
    [0xf8, 'i32x4.trunc_sat_f32x4_s', 'u'], [0xf9, 'i32x4.trunc_sat_f32x4_u', 'u'], [0xfa, 'f32x4.convert_i32x4_s', 'u'],
    [0xfb, 'f32x4.convert_i32x4_u', 'u'], [0xfc, 'i32x4.trunc_sat_f64x2_s_zero', 'u'], [0xfd, 'i32x4.trunc_sat_f64x2_u_zero', 'u'],
    [0xfe, 'f64x2.convert_low_i32x4_s', 'u'], [0xff, 'f64x2.convert_low_i32x4_u', 'u'],
  ];
  const kinds = { u: unary, b: binary, t: test, s: shift };
  for (const [code, name, kind] of table) kinds[kind](name, code);

  define('i32.const', [0x41], [], ['i32'], 'i32');
  define('i64.const', [0x42], [], ['i64'], 'i64');
  define('f32.const', [0x43], [], ['f32'], 'f32');
  define('f64.const', [0x44], [], ['f64'], 'f64');
}

// Instructions the validator handles itself: control, locals, the stack.
const CONTROL = new Set(['unreachable', 'nop', 'block', 'loop', 'if', 'else', 'end', 'br', 'br_if', 'br_table',
  'return', 'drop', 'select', 'local.get', 'local.set', 'local.tee']);

// ── Text ─────────────────────────────────────────────────────────────────────

class WatError extends Error {
  constructor(message, start, end) {
    super(message);
    this.start = start;
    this.end = end;
  }
}

/** Tokens: `(`, `)`, and atoms (anything else up to space or a paren), with their offsets. */
function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (text.startsWith(';;', i)) {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (text.startsWith('(;', i)) {
      let depth = 0;
      const start = i;
      do {
        if (text.startsWith('(;', i)) { depth++; i += 2; }
        else if (text.startsWith(';)', i)) { depth--; i += 2; }
        else if (i >= text.length) throw new WatError('this block comment does not end', start, start + 2);
        else i++;
      } while (depth > 0);
      continue;
    }
    if (c === '(' || c === ')') {
      tokens.push({ text: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '"') throw new WatError('a @wat function has no strings', i, i + 1);
    const start = i;
    while (i < text.length && !/[ \t\n\r()";]/.test(text[i])) i++;
    if (i === start) throw new WatError(`unexpected '${c}'`, i, i + 1);
    tokens.push({ text: text.slice(start, i), start, end: i });
  }
  return tokens;
}

/** S-expressions: { list: [...], start, end } or { atom, start, end }. */
function parse(tokens) {
  let k = 0;
  const item = () => {
    const token = tokens[k++];
    if (token.text === ')') throw new WatError("this ')' closes nothing", token.start, token.end);
    if (token.text !== '(') return { atom: token.text, start: token.start, end: token.end };
    const list = [];
    for (;;) {
      if (k >= tokens.length) throw new WatError("this '(' is not closed", token.start, token.end);
      if (tokens[k].text === ')') return { list, start: token.start, end: tokens[k++].end };
      list.push(item());
    }
  };
  const items = [];
  while (k < tokens.length) items.push(item());
  return items;
}

const head = node => node.list?.[0]?.atom;

// ── Instructions, flat ───────────────────────────────────────────────────────
//
// Folded instructions are flattened: `(op imm… child…)` is its children,
// then op; `(block … )`, `(loop … )` and `(if … (then …) (else …))` become
// their plain forms, ending with `end`. Each instruction is
// { name, imms: [atoms or lists], start, end }.

/** How many atoms an instruction's immediates are (lists — `(result t)` — are counted apart). */
function immediateAtoms(name, atoms, at) {
  if (name === 'br_table') {
    let n = 0;
    while (n < atoms.length && isLabel(atoms[n].atom)) n++;
    if (n === 0) throw new WatError('br_table needs at least one label', at.start, at.end);
    return n;
  }
  if (name === 'block' || name === 'loop' || name === 'if' || name === 'else' || name === 'end') {
    return atoms.length && atoms[0].atom.startsWith('$') ? 1 : 0;
  }
  if (['br', 'br_if', 'local.get', 'local.set', 'local.tee'].includes(name)) return 1;
  const op = OPS.get(name);
  if (!op?.imm) return 0;
  if (op.imm === 'shuffle') return 16;
  if (op.imm === 'v128') {
    const lanes = { i8x16: 16, i16x8: 8, i32x4: 4, i64x2: 2, f32x4: 4, f64x2: 2 }[atoms[0]?.atom];
    if (!lanes) throw new WatError('v128.const needs a shape (i8x16, i16x8, i32x4, i64x2, f32x4, f64x2) and its lanes', at.start, at.end);
    return 1 + lanes;
  }
  return 1;
}

const isLabel = text => text !== undefined && (text.startsWith('$') || U32.test(text));

const needs = (name, n) => `${name} needs ${n} immediate${n === 1 ? '' : 's'}`;

function flatten(items) {
  const out = [];
  const locals = [];
  let k = 0;
  // `(local …)` declarations come first.
  while (k < items.length && head(items[k]) === 'local') locals.push(items[k++]);
  const plain = (nodes, from) => {
    let i = from;
    while (i < nodes.length) {
      const node = nodes[i];
      if (node.list) {
        if (head(node) === 'local') throw new WatError('locals are declared before the instructions', node.start, node.end);
        folded(node);
        i++;
        continue;
      }
      const name = node.atom;
      if (!OPS.has(name) && !CONTROL.has(name)) throw new WatError(unknown(name), node.start, node.end);
      const rest = [];
      let j = i + 1;
      while (j < nodes.length && nodes[j].atom !== undefined) rest.push(nodes[j++]);
      const n = immediateAtoms(name, rest, node);
      if (rest.length < n) throw new WatError(needs(name, n), node.start, (rest.at(-1) ?? node).end);
      const imms = nodes.slice(i + 1, i + 1 + n);
      i += 1 + n;
      // A block's `(result t)`, a select's.
      while (i < nodes.length && (head(nodes[i]) === 'result' || head(nodes[i]) === 'param' || head(nodes[i]) === 'type') && ['block', 'loop', 'if', 'select'].includes(name)) {
        imms.push(nodes[i++]);
      }
      out.push({ name, imms, start: node.start, end: (imms.at(-1) ?? node).end });
    }
  };
  const folded = node => {
    const name = head(node);
    if (name === undefined) throw new WatError('a folded instruction begins with its name', node.start, node.end);
    const parts = node.list.slice(1);
    if (name === 'block' || name === 'loop') {
      const { imms, body } = blockParts(parts);
      out.push({ name, imms, start: node.start, end: node.list[0].end });
      plain(body, 0);
      out.push({ name: 'end', imms: [], start: node.end - 1, end: node.end });
      return;
    }
    if (name === 'if') {
      const { imms, body } = blockParts(parts);
      const thenAt = body.findIndex(part => head(part) === 'then');
      if (thenAt < 0) throw new WatError('a folded if has (then …)', node.start, node.end);
      for (const condition of body.slice(0, thenAt)) {
        if (!condition.list) throw new WatError('the condition of a folded if is folded too', condition.start, condition.end);
        folded(condition);
      }
      out.push({ name, imms, start: node.start, end: node.list[0].end });
      plain(body[thenAt].list, 1);
      const otherwise = body[thenAt + 1];
      if (otherwise) {
        if (head(otherwise) !== 'else' || body.length > thenAt + 2) throw new WatError('a folded if ends with (then …) and (else …)', otherwise.start, otherwise.end);
        out.push({ name: 'else', imms: [], start: otherwise.start, end: otherwise.list[0].end });
        plain(otherwise.list, 1);
      }
      out.push({ name: 'end', imms: [], start: node.end - 1, end: node.end });
      return;
    }
    if (!OPS.has(name) && !CONTROL.has(name)) throw new WatError(unknown(name), node.list[0].start, node.list[0].end);
    const atoms = [];
    while (atoms.length < parts.length && parts[atoms.length].atom !== undefined) atoms.push(parts[atoms.length]);
    const n = immediateAtoms(name, atoms, node.list[0]);
    if (atoms.length < n) throw new WatError(needs(name, n), node.list[0].start, (atoms.at(-1) ?? node.list[0]).end);
    const imms = atoms.slice(0, n);
    let j = n;
    while (j < parts.length && (head(parts[j]) === 'result') && name === 'select') imms.push(parts[j++]);
    // Its operands, folded or flat, come before it.
    plain(parts, j);
    out.push({ name, imms, start: node.start, end: node.end });
  };
  plain(items, k);
  return { locals, instrs: out };
}

/** A folded block's label and `(result t)`, and its body. */
function blockParts(parts) {
  const imms = [];
  let i = 0;
  if (parts[i]?.atom?.startsWith('$')) imms.push(parts[i++]);
  while (i < parts.length && ['result', 'param', 'type'].includes(head(parts[i]))) imms.push(parts[i++]);
  return { imms, body: parts.slice(i) };
}

function unknown(name) {
  if (/^(i32|i64|f32|f64|v128)\.(load|store)|^memory\.|^global\.|^call|^table\.|^ref\.|^struct\.|^array\./.test(name)) {
    return `${name}: a @wat function computes on its arguments; it has no memories, globals, calls, or references`;
  }
  return `unknown instruction '${name}'`;
}

// ── A utu function's signature ───────────────────────────────────────────────

// The utu types a @wat function takes and returns, as wasm's.
const UTU_TYPES = { I32: 'i32', U32: 'i32', Bool: 'i32', M32: 'i32', I64: 'i64', U64: 'i64', M64: 'i64', F32: 'f32', F64: 'f64', V128: 'v128', M128: 'v128' };

/**
 * A @wat function, from its utu signature: `params` ({ name, type } with
 * utu type names), `result` (a utu type name, or 'void'), and its text. A
 * mistake in the signature has no place in the text (start and end null):
 * it is the function's.
 */
export function assembleWat({ params, result, text, method = false }) {
  const shape = 'fn f(x: I32) I32 { @wat/\\ … \\/; }';
  if (method) return { error: { message: `a @wat function is a plain function: ${shape}`, start: null, end: null } };
  const wasmType = type => UTU_TYPES[type];
  const wrong = [...params.map(param => param.type), result].find(type => type !== 'void' && !wasmType(type));
  if (wrong !== undefined) {
    return { error: { message: `a @wat function takes and returns I32, U32, I64, U64, F32, F64, Bool, V128, M32, M64, or M128, not ${wrong}`, start: null, end: null } };
  }
  return assembleFunction({
    params: params.map(param => ({ name: param.name, type: wasmType(param.type) })),
    result: result === 'void' ? null : wasmType(result),
    text,
  });
}

// ── Checking and encoding ────────────────────────────────────────────────────

export function assembleFunction({ params, result, text }) {
  try {
    return { code: assemble(params, result, text) };
  } catch (error) {
    // Folded instructions are read recursively: thousands deep exhaust the stack.
    if (error instanceof RangeError) return { error: { message: 'this @wat body nests too deeply', start: 0, end: Math.min(text.length, 1) } };
    if (!(error instanceof WatError)) throw error;
    return { error: { message: error.message, start: error.start, end: error.end } };
  }
}

function assemble(params, result, text) {
  const { locals: decls, instrs } = flatten(parse(tokenize(text)));
  const types = params.map(param => param.type);
  const names = new Map(params.map((param, i) => [`$${param.name}`, i]));
  for (const decl of decls) {
    const parts = decl.list.slice(1);
    if (parts[0]?.atom?.startsWith('$')) {
      if (parts.length !== 2) throw new WatError('a named local has one type: (local $t i32)', decl.start, decl.end);
      if (names.has(parts[0].atom)) throw new WatError(`${parts[0].atom} is declared twice`, parts[0].start, parts[0].end);
      names.set(parts[0].atom, types.length);
      types.push(valtype(parts[1]));
    } else {
      for (const part of parts) types.push(valtype(part));
    }
  }
  const code = [];
  // The locals after the parameters, in runs of one type.
  const runs = [];
  for (const t of types.slice(params.length)) {
    if (runs.length && runs.at(-1)[1] === t) runs.at(-1)[0]++;
    else runs.push([1, t]);
  }
  code.push(...leb128(runs.length));
  for (const [n, t] of runs) code.push(...leb128(n), VALTYPE[t]);

  const stack = [];
  const frames = [{ kind: 'function', label: null, out: result ? [result] : [], height: 0, unreachable: false }];
  const frame = () => frames.at(-1);
  const pop = (want, at, what) => {
    const f = frame();
    if (stack.length === f.height) {
      if (f.unreachable) return want ?? 'any';
      throw new WatError(`${what} needs ${want ? article(want) : 'a value'}, and there is none here`, at.start, at.end);
    }
    const got = stack.pop();
    if (want && got !== 'any' && got !== want) throw new WatError(`${what} needs ${article(want)}, not ${article(got)}`, at.start, at.end);
    return got;
  };
  const popAll = (wanted, at, what) => { for (const t of [...wanted].reverse()) pop(t, at, what); };
  const unreachable = () => { stack.length = frame().height; frame().unreachable = true; };
  const labelTypes = f => (f.kind === 'loop' ? [] : f.out);
  const depthOf = (atom, at) => {
    if (!atom) throw new WatError(`${at.name} names a block: ${at.name} $label (or a depth)`, at.start, at.end);
    if (U32.test(atom.atom)) {
      const depth = u32(atom);
      if (depth >= frames.length) throw new WatError(`there is no block ${depth} deep here`, atom.start, atom.end);
      return depth;
    }
    for (let d = 0; d < frames.length; d++) if (frames[frames.length - 1 - d].label === atom.atom) return d;
    throw new WatError(`no enclosing block is labeled ${atom.atom}`, atom.start, atom.end);
  };
  const local = (atom, at) => {
    if (!atom) throw new WatError(`${at.name} names a local: ${at.name} $x`, at.start, at.end);
    const index = U32.test(atom.atom) ? u32(atom) : names.get(atom.atom);
    if (index === undefined || index >= types.length) throw new WatError(`there is no local ${atom.atom}`, atom.start, atom.end);
    return index;
  };
  const endFrame = at => {
    const f = frame();
    popAll(f.out, at, f.kind === 'function' ? 'the function\'s result' : `the end of this ${f.kind}`);
    if (stack.length !== f.height) {
      throw new WatError(f.kind === 'function'
        ? `the function returns ${f.out[0] ?? 'nothing'}, but its body leaves ${stack.length - f.height} more value${stack.length - f.height === 1 ? '' : 's'}`
        : `this ${f.kind} leaves more values than its result`, at.start, at.end);
    }
  };

  for (const ins of instrs) {
    const { name, imms } = ins;
    switch (name) {
      case 'unreachable': code.push(0x00); unreachable(); break;
      case 'nop': code.push(0x01); break;
      case 'block': case 'loop': case 'if': {
        const label = imms[0]?.atom?.startsWith('$') ? imms[0].atom : null;
        const out = blockResult(imms);
        if (name === 'if') pop('i32', ins, 'if');
        code.push({ block: 0x02, loop: 0x03, if: 0x04 }[name], out.length ? VALTYPE[out[0]] : 0x40);
        frames.push({ kind: name, label, out, height: stack.length, unreachable: false, sawElse: false });
        break;
      }
      case 'else': {
        const f = frame();
        if (f.kind !== 'if' || f.sawElse) throw new WatError('else belongs to an if', ins.start, ins.end);
        closingLabel(imms[0], f);
        endFrame(ins);
        f.sawElse = true;
        f.unreachable = false;
        stack.length = f.height;
        code.push(0x05);
        break;
      }
      case 'end': {
        const f = frame();
        if (f.kind === 'function') throw new WatError('this end closes no block', ins.start, ins.end);
        closingLabel(imms[0], f);
        if (f.kind === 'if' && !f.sawElse && f.out.length) throw new WatError(`an if with a result has an else`, ins.start, ins.end);
        endFrame(ins);
        frames.pop();
        stack.push(...f.out);
        code.push(0x0b);
        break;
      }
      case 'br': case 'br_if': {
        const depth = depthOf(imms[0], ins);
        if (name === 'br_if') pop('i32', ins, 'br_if');
        const wanted = labelTypes(frames[frames.length - 1 - depth]);
        popAll(wanted, ins, name);
        code.push(name === 'br' ? 0x0c : 0x0d, ...leb128(depth));
        if (name === 'br') unreachable(); else stack.push(...wanted);
        break;
      }
      case 'br_table': {
        const depths = imms.map(atom => depthOf(atom, ins));
        pop('i32', ins, 'br_table');
        const wanted = labelTypes(frames[frames.length - 1 - depths.at(-1)]);
        for (const d of depths) {
          const other = labelTypes(frames[frames.length - 1 - d]);
          if (other.join() !== wanted.join()) throw new WatError('br_table\'s labels take the same values', ins.start, ins.end);
        }
        popAll(wanted, ins, 'br_table');
        code.push(0x0e, ...leb128(depths.length - 1));
        for (const d of depths) code.push(...leb128(d));
        unreachable();
        break;
      }
      case 'return': popAll(frames[0].out, ins, 'return'); code.push(0x0f); unreachable(); break;
      case 'drop': pop(null, ins, 'drop'); code.push(0x1a); break;
      case 'select': {
        const results = imms.filter(imm => head(imm) === 'result');
        if (results.length > 1 || results[0]?.list.length > 2) throw new WatError('select has one result type: (result t)', results[0].start, results.at(-1).end);
        const typed = results[0];
        pop('i32', ins, 'select');
        const want = typed ? valtype(typed.list[1]) : null;
        const b = pop(want, ins, 'select');
        const a = pop(want ?? (b === 'any' ? null : b), ins, 'select');
        const t = want ?? (a === 'any' ? b : a);
        if (typed) code.push(0x1c, 1, VALTYPE[t]); else code.push(0x1b);
        stack.push(t);
        break;
      }
      case 'local.get': case 'local.set': case 'local.tee': {
        const index = local(imms[0], ins);
        const t = types[index];
        if (name !== 'local.get') pop(t, ins, name);
        if (name !== 'local.set') stack.push(t);
        code.push({ 'local.get': 0x20, 'local.set': 0x21, 'local.tee': 0x22 }[name], ...leb128(index));
        break;
      }
      default: {
        const op = OPS.get(name);
        popAll(op.ins, ins, name);
        code.push(...op.bytes, ...immediate(op.imm, imms, ins));
        stack.push(...op.outs);
      }
    }
  }
  const last = instrs.at(-1) ?? { start: 0, end: text.length };
  if (frames.length > 1) throw new WatError(`this ${frame().kind} has no end`, last.start, last.end);
  endFrame({ start: last.start, end: last.end });
  code.push(0x0b);
  return Uint8Array.from(code);
}

const article = t => `${t === 'v128' ? 'a' : 'an'} ${t}`;

/** An `end` or `else` may repeat its block's label, and only that. */
function closingLabel(atom, f) {
  if (atom && atom.atom !== f.label) {
    throw new WatError(f.label ? `this closes ${f.label}, not ${atom.atom}` : `this ${f.kind} has no label to repeat`, atom.start, atom.end);
  }
}

function valtype(node) {
  if (node?.atom && node.atom in VALTYPE) return node.atom;
  throw new WatError(`'${node?.atom ?? '(…)'}' is not a type: i32, i64, f32, f64, or v128`, node?.start ?? 0, node?.end ?? 0);
}

function blockResult(imms) {
  const out = [];
  for (const imm of imms) {
    if (imm.atom !== undefined) continue;
    if (head(imm) !== 'result') throw new WatError(`a @wat block takes no ${head(imm)}`, imm.start, imm.end);
    for (const t of imm.list.slice(1)) out.push(valtype(t));
  }
  if (out.length > 1) throw new WatError('a block has at most one result', imms[0].start, imms.at(-1).end);
  return out;
}

// ── Immediates ───────────────────────────────────────────────────────────────

function immediate(kind, imms, at) {
  if (!kind) return [];
  const atom = imms[0];
  if (kind === 'i32') return sleb128(BigInt.asIntN(32, integer(atom, 32)));
  if (kind === 'i64') return sleb128(BigInt.asIntN(64, integer(atom, 64)));
  if (kind === 'f32') return floatBytes(atom, 32);
  if (kind === 'f64') return floatBytes(atom, 64);
  if (kind.startsWith('lane')) {
    const lanes = Number(kind.slice(4));
    if (!U32.test(atom.atom) || u32(atom) >= lanes) throw new WatError(`a lane is 0 to ${lanes - 1}`, atom.start, atom.end);
    return [u32(atom)];
  }
  if (kind === 'shuffle') {
    return imms.map(lane => {
      if (!U32.test(lane.atom) || u32(lane) > 31) throw new WatError('a shuffle lane is 0 to 31', lane.start, lane.end);
      return u32(lane);
    });
  }
  if (kind === 'v128') {
    const shape = atom.atom;
    const lanes = imms.slice(1);
    const bytes = [];
    for (const lane of lanes) {
      if (shape === 'f32x4' || shape === 'f64x2') bytes.push(...floatBytes(lane, shape === 'f32x4' ? 32 : 64));
      else {
        const bits = { i8x16: 8, i16x8: 16, i32x4: 32, i64x2: 64 }[shape];
        let v = BigInt.asUintN(bits, integer(lane, bits));
        for (let b = 0; b < bits / 8; b++) { bytes.push(Number(v & 0xffn)); v >>= 8n; }
      }
    }
    return bytes;
  }
  throw new WatError(`what follows ${at.name}`, at.start, at.end);
}

// WAT's digits: an underscore only between two of them.
const DIGITS = '[0-9](?:_?[0-9])*';
const HEX_DIGITS = '[0-9a-fA-F](?:_?[0-9a-fA-F])*';
const U32 = new RegExp(`^(?:${DIGITS}|0x${HEX_DIGITS})$`);
const INTEGER = new RegExp(`^([+-]?)(${DIGITS}|0x${HEX_DIGITS})$`);
const DECIMAL_FLOAT = new RegExp(`^(${DIGITS})(?:\\.(${DIGITS})?)?(?:[eE]([+-]?${DIGITS}))?$`);
const HEX_FLOAT = new RegExp(`^0x(${HEX_DIGITS})(?:\\.(${HEX_DIGITS})?)?(?:[pP]([+-]?${DIGITS}))?$`);
const NAN_PAYLOAD = new RegExp(`^nan:0x(${HEX_DIGITS})$`);

const digits = text => text.replaceAll('_', '');

/** An index (a local, a lane, a depth): decimal or `0x…`. */
function u32(atom) {
  return Number(BigInt(digits(atom.atom)));
}

/** An integer of `bits` bits, signed or unsigned, as WAT writes them (`-1`, `0xff`, `1_000`). */
function integer(atom, bits) {
  const text = atom.atom;
  const match = INTEGER.exec(text);
  if (!match) throw new WatError(`'${text}' is not an integer`, atom.start, atom.end);
  let v = BigInt(digits(match[2]));
  if (match[1] === '-') v = -v;
  const min = -(1n << BigInt(bits - 1));
  const max = (1n << BigInt(bits)) - 1n;
  if (v < min || v > max) throw new WatError(`${text} does not fit in ${bits} bits`, atom.start, atom.end);
  return v;
}

/**
 * A float's little-endian bytes: decimal (`1.5e3`), hex (`0x1.8p3`), `inf`,
 * `nan`, `nan:0x…`; rounded once, to the nearest (ties to even), and an
 * error when that is beyond the type's range, as wasm-tools has it.
 */
function floatBytes(atom, bits) {
  const text = atom.atom;
  const mant = bits === 32 ? 23 : 52;
  const sign = text.startsWith('-') ? 1n << BigInt(bits - 1) : 0n;
  const body = text.replace(/^[+-]/, '');
  const exponentAll = bits === 32 ? 0xffn << 23n : 0x7ffn << 52n;
  let word;
  if (body === 'inf') word = exponentAll;
  else if (body === 'nan') word = exponentAll | 1n << BigInt(mant - 1);
  else if (NAN_PAYLOAD.test(body)) {
    const payload = BigInt(`0x${digits(NAN_PAYLOAD.exec(body)[1])}`);
    if (payload === 0n || payload >= 1n << BigInt(mant)) throw new WatError(`a NaN's payload is 1 to 0x${((1n << BigInt(mant)) - 1n).toString(16)}`, atom.start, atom.end);
    word = exponentAll | payload;
  } else {
    // The value as num / den, both exact.
    let num, den = 1n, exp;
    const hex = HEX_FLOAT.exec(body);
    const dec = hex ? null : DECIMAL_FLOAT.exec(body);
    if (hex) {
      const fraction = digits(hex[2] ?? '');
      num = BigInt(`0x${digits(hex[1])}${fraction}`);
      exp = Number(digits(hex[3] ?? '0')) - 4 * fraction.length;
      // Far past the range either way: no need to build the number.
      if (num !== 0n && exp + num.toString(2).length > 2000) throw outOfRange(atom, bits);
      if (exp + num.toString(2).length < -2000) num = 0n;
      else if (exp >= 0) num <<= BigInt(exp); else den = 1n << BigInt(-exp);
    } else if (dec) {
      const fraction = digits(dec[2] ?? '');
      num = BigInt(`${digits(dec[1])}${fraction}`);
      exp = Number(digits(dec[3] ?? '0')) - fraction.length;
      if (num !== 0n && exp + num.toString().length > 400) throw outOfRange(atom, bits);
      if (exp + num.toString().length < -400) num = 0n;
      else if (exp >= 0) num *= 10n ** BigInt(exp); else den = 10n ** BigInt(-exp);
    } else {
      throw new WatError(`'${text}' is not a number`, atom.start, atom.end);
    }
    word = roundFloat(num, den, bits);
    if (word === null) throw outOfRange(atom, bits);
  }
  word |= sign;
  const bytes = [];
  for (let b = 0; b < bits / 8; b++) { bytes.push(Number(word & 0xffn)); word >>= 8n; }
  return bytes;
}

const outOfRange = (atom, bits) => new WatError(`${atom.atom} is beyond the range of an f${bits}`, atom.start, atom.end);

/** num / den (> 0, or 0) as the bits of the nearest f32 or f64, or null when it rounds to infinity. */
function roundFloat(num, den, bits) {
  if (num === 0n) return 0n;
  const mant = bits === 32 ? 23 : 52;
  const bias = bits === 32 ? 127 : 1023;
  const length = x => x.toString(2).length;
  // 2^e <= num / den < 2^(e+1); below the normals, the subnormals' scale.
  let e = length(num) - length(den);
  if ((e >= 0 ? num : num << BigInt(-e)) < (e >= 0 ? den << BigInt(e) : den)) e--;
  e = Math.max(e, 1 - bias);
  const shift = mant - e;
  const n = shift >= 0 ? num << BigInt(shift) : num;
  const d = shift >= 0 ? den : den << BigInt(-shift);
  let q = n / d;
  const twice = 2n * (n - q * d);
  if (twice > d || (twice === d && (q & 1n))) q++;
  if (q === 1n << BigInt(mant + 1)) { q >>= 1n; e++; }
  // A subnormal (or zero, rounded down): no exponent.
  if (q < 1n << BigInt(mant)) return q;
  if (e > bias) return null;
  return (BigInt(e + bias) << BigInt(mant)) | (q - (1n << BigInt(mant)));
}

function leb128(n) {
  const out = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return out;
}

function sleb128(v) {
  const out = [];
  for (;;) {
    const b = Number(v & 0x7fn);
    v >>= 7n;
    if ((v === 0n && !(b & 0x40)) || (v === -1n && (b & 0x40))) { out.push(b); return out; }
    out.push(b | 0x80);
  }
}

/** Every instruction this assembles, for tests. */
export function watInstructions() {
  return [...OPS.keys()];
}
