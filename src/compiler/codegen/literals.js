// codegen/literals.js — literal emission helpers

import { emitStringLiteral } from './strings.js';
import { emitNullLiteral } from './null-literals.js';

// ── Literals ──────────────────────────────────────────────────────────────────

export function emitLit(node, ctx) {
  const kind = node.getAttribute('kind');
  const raw  = node.getAttribute('value') ?? node.textContent ?? '';
  const type = ctx.typeOf(node) ?? '';
  const m = ctx.module;

  // String / null literals don't go through a numeric namespace.
  if (kind === 'string' || kind === 'string-multi' || type === 'Str') {
    return emitStringLiteral(node, ctx);
  }
  if (kind === 'null' || type === 'null') {
    return emitNullLiteral(node, ctx);
  }

  // Pick the binaryen numeric namespace from the stdlib-built scalar registry.
  const ns = ctx.scalarNamespaceOf(type);
  if (!ns) throw new Error(`codegen: unsupported literal type "${type}" for kind "${kind}"`);

  const handlers = {
    i32() {
      if (raw === 'true' || raw === 'false') return m.i32.const(raw === 'true' ? 1 : 0);
      return m.i32.const(parseInt32Literal(raw));
    },
    // binaryen >= 131 takes a single BigInt; the old (lowBits, highBits) pair
    // is rejected outright rather than silently mis-encoded.
    i64: () => m.i64.const(parseInt64Literal(raw)),
    f32: () => m.f32.const(Number(raw)),
    f64: () => m.f64.const(Number(raw)),
  };
  const handler = handlers[ns];
  if (!handler) throw new Error(`codegen: literal namespace "${ns}" not implemented for type "${type}"`);
  return handler();
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

