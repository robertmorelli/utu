import { wasm } from './types.js';
import { nextLabel } from './labels.js';
import { arrayInfoFromNode, elementWasmType } from './arrays.js';

export function emitStringLiteral(node, ctx) {
  const raw = decodeStringLiteral(node.getAttribute('value') ?? '');
  return stringConst(ctx.module, raw);
}

export function emitStringIntrinsic(opNode, argNodes, ctx, emitExpr) {
  if (!opNode.localName.startsWith('ir-string-')) return null;
  const [a, b, c] = argNodes;
  const strings = ctx.module.string;

  switch (opNode.localName) {
    case 'ir-string-concat':
      return strings.concat(emitExpr(a, ctx), emitExpr(b, ctx));
    case 'ir-string-eq':
      return strings.equals(emitExpr(a, ctx), emitExpr(b, ctx));
    case 'ir-string-ne':
      return ctx.module.i32.eqz(strings.equals(emitExpr(a, ctx), emitExpr(b, ctx)));
    case 'ir-string-measure-utf16':
      return strings.length(emitExpr(a, ctx));
    case 'ir-string-slice-wtf16':
      return strings.substring(emitExpr(a, ctx), emitExpr(b, ctx), emitExpr(c, ctx));
    case 'ir-string-get-wtf16':
      return strings.charCodeAt(emitExpr(a, ctx), emitExpr(b, ctx));
    case 'ir-string-from-code-point':
      return strings.fromCodePoint(emitExpr(a, ctx));
    case 'ir-string-from-codes':
      return emitStringFromCodes(a, b, ctx, emitExpr);
    default:
      return null;
  }
}

/**
 * The first `count` UTF-16 code units of an Array[I32] as a string: narrow
 * them into a 16-bit array, then one fromCharCodeArray. Builds strings of any
 * length in O(n) without creating a rope of one-character strings.
 */
function emitStringFromCodes(codesNode, countNode, ctx, emitExpr) {
  const m = ctx.module;
  const info = arrayInfoFromNode(codesNode, ctx);
  const units = codeUnitArray();
  const source = ctx.addLocal(info.refType), count = ctx.addLocal(wasm.i32);
  const narrow = ctx.addLocal(units.refType), i = ctx.addLocal(wasm.i32);
  const label = nextLabel(ctx);
  const done = `__codes_done_${label}`, next = `__codes_next_${label}`;
  const get = local => m.local.get(local, wasm.i32);
  return m.block(null, [
    m.local.set(source, m.ref.cast(emitExpr(codesNode, ctx), info.refType)),
    m.local.set(count, emitExpr(countNode, ctx)),
    m.local.set(narrow, m.array.new_default(units.heapType, get(count))),
    m.local.set(i, m.i32.const(0)),
    m.block(done, [m.loop(next, m.block(null, [
      m.br(done, m.i32.ge_u(get(i), get(count))),
      m.array.set(m.local.get(narrow, units.refType), get(i),
        m.array.get(m.local.get(source, info.refType), get(i), elementWasmType(info, ctx), false)),
      m.local.set(i, m.i32.add(get(i), m.i32.const(1))),
      m.br(next),
    ], wasm.none))], wasm.none),
    m.string.fromCharCodeArray(m.local.get(narrow, units.refType), m.i32.const(0), get(count)),
  ], wasm.stringref);
}

/** (array (mut i16)), the code-unit array the string builtins take. */
function codeUnitArray() {
  const builder = new wasm.TypeBuilder(1);
  builder.setArrayType(0, wasm.i32, wasm.i16, true);
  const [heapType] = builder.buildAndDispose();
  return { heapType, refType: wasm.getTypeFromHeapType(heapType, false) };
}

function stringConst(m, raw) {
  return m.string.const(raw);
}

function decodeStringLiteral(raw) {
  // Multiline literals: each line's text after `\\`, joined by newlines.
  if (/^\s*\\\\/.test(raw)) return raw.split('\n').map(line => line.replace(/^\s*\\\\/, '')).join('\n');
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
