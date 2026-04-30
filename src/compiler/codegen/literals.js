// codegen/literals.js — literal emission helpers

import { emitStringLiteral } from './strings.js';
import { emitNullLiteral } from './null-literals.js';

// ── Literals ──────────────────────────────────────────────────────────────────

export function emitLit(node, ctx) {
  const kind = node.getAttribute('kind');
  const raw  = node.getAttribute('value') ?? node.textContent ?? '';
  const type = node.dataset.type ?? '';
  const m = ctx.module;

  // String / null literals don't go through a numeric namespace.
  if (kind === 'string' || kind === 'string-multi' || type === 'str') {
    return emitStringLiteral(node, ctx);
  }
  if (kind === 'null' || type === 'null') {
    return emitNullLiteral(node, ctx, type);
  }

  // Pick the binaryen numeric namespace from the stdlib-built scalar registry,
  // not from a hardcoded type list.  scalarNamespaceOf returns one of:
  //   'i32'  for i32/u32/bool/m32
  //   'i64'  for i64/u64/m64
  //   'f32', 'f64', or 'v128'
  const ns = ctx.scalarNamespaceOf(type);
  if (!ns) throw new Error(`codegen: unsupported literal type "${type}" for kind "${kind}"`);

  switch (ns) {
    case 'i32':
      // bool's "true"/"false" forms are the only non-numeric integer literal
      // and they're a stdlib promise: bool maps to a width-1 i32.
      if (type === 'bool') return m.i32.const(raw === 'true' ? 1 : 0);
      return m.i32.const(parseInt32Literal(raw));
    case 'i64': {
      const big  = parseInt64Literal(raw);
      // binaryen's i64.const takes (lowBits, highBits) as 32-bit signed ints.
      const low  = Number(BigInt.asIntN(32, big));
      const high = Number(BigInt.asIntN(32, big >> 32n));
      return m.i64.const(low, high);
    }
    case 'f32': return m.f32.const(Number(raw));
    case 'f64': return m.f64.const(Number(raw));
    default:
      throw new Error(`codegen: literal namespace "${ns}" not implemented for type "${type}"`);
  }
}

function parseInt32Literal(s) {
  if (/^-?0x/i.test(s)) return parseInt(s.replace(/^(-?)0x/i, '$1'), 16) | 0;
  if (/^-?0b/i.test(s)) return parseInt(s.replace(/^(-?)0b/i, '$1'), 2)  | 0;
  if (/^-?0o/i.test(s)) return parseInt(s.replace(/^(-?)0o/i, '$1'), 8)  | 0;
  return parseInt(s, 10) | 0;
}

function parseInt64Literal(s) {
  // Use BigInt so we don't lose precision on values outside the int32 range.
  // BigInt() honors `0x`/`0b`/`0o` prefixes but rejects a leading `-` on those,
  // so peel the sign off first.
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const mag  = BigInt(body);
  return neg ? -mag : mag;
}


