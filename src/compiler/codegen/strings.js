import { binaryen } from './types.js';
import { nextLabel } from './labels.js';
import { arrayInfoFromNode, elementBinaryenType } from './arrays.js';

export function emitStringLiteral(node, ctx) {
  if (ctx.requirements) ctx.requirements.strings = true;
  const raw = decodeStringLiteral(node.getAttribute('value') ?? '');
  return stringConst(ctx.module, raw);
}

export function emitStringIntrinsic(opNode, argNodes, ctx, emitExpr) {
  if (!opNode.localName.startsWith('ir-string-')) return null;
  if (ctx.requirements) ctx.requirements.strings = true;
  const [a, b, c] = argNodes;
  const m = ctx.module;

  switch (opNode.localName) {
    case 'ir-string-concat': {
      const strings = stringOps(m);
      return strings.concat(emitExpr(a, ctx), emitExpr(b, ctx));
    }
    case 'ir-string-eq': {
      const strings = stringOps(m);
      return strings.eq(binaryen.StringEqEqual, emitExpr(a, ctx), emitExpr(b, ctx));
    }
    case 'ir-string-ne': {
      const strings = stringOps(m);
      return m.i32.eqz(strings.eq(binaryen.StringEqEqual, emitExpr(a, ctx), emitExpr(b, ctx)));
    }
    case 'ir-string-measure-utf16': {
      const strings = stringOps(m);
      return strings.measure(binaryen.StringMeasureWTF16, emitExpr(a, ctx));
    }
    case 'ir-string-slice-wtf16': {
      const strings = stringOps(m);
      return strings.slice_wtf16(emitExpr(a, ctx), emitExpr(b, ctx), emitExpr(c, ctx));
    }
    case 'ir-string-get-wtf16': {
      const strings = stringOps(m);
      return strings.get_wtf16(emitExpr(a, ctx), emitExpr(b, ctx));
    }
    case 'ir-string-from-code-point':
      return binaryen._BinaryenStringNew(m.ptr, binaryen.StringNewFromCodePoint, emitExpr(a, ctx), 0, 0);
    case 'ir-string-from-codes':
      return emitStringFromCodes(a, b, ctx, emitExpr);
    default:
      return null;
  }
}

/**
 * The first `count` UTF-16 code units of an Array[I32] as a string: narrow
 * them into a 16-bit array, then one string.new_wtf16_array (the
 * fromCharCodeArray builtin). Builds strings of any length in O(n) without
 * creating a rope of one-character strings.
 */
function emitStringFromCodes(codesNode, countNode, ctx, emitExpr) {
  const m = ctx.module;
  const info = arrayInfoFromNode(codesNode, ctx);
  const units = codeUnitArray(ctx);
  const source = ctx.addLocal(info.refType), count = ctx.addLocal(binaryen.i32);
  const narrow = ctx.addLocal(units.refType), i = ctx.addLocal(binaryen.i32);
  const label = nextLabel(ctx);
  const done = `__codes_done_${label}`, next = `__codes_next_${label}`;
  const get = local => m.local.get(local, binaryen.i32);
  return m.block(null, [
    m.local.set(source, m.ref.cast(emitExpr(codesNode, ctx), info.refType)),
    m.local.set(count, emitExpr(countNode, ctx)),
    m.local.set(narrow, m.array.new_default(units.heapType, get(count))),
    m.local.set(i, m.i32.const(0)),
    m.block(done, [m.loop(next, m.block(null, [
      m.br(done, m.i32.ge_u(get(i), get(count))),
      m.array.set(m.local.get(narrow, units.refType), get(i),
        m.array.get(m.local.get(source, info.refType), get(i), elementBinaryenType(info, ctx), false)),
      m.local.set(i, m.i32.add(get(i), m.i32.const(1))),
      m.br(next),
    ], binaryen.none))], binaryen.none),
    binaryen._BinaryenStringNew(m.ptr, binaryen.StringNewWTF16Array, m.local.get(narrow, units.refType), m.i32.const(0), get(count)),
  ], binaryen.stringref);
}

const CODE_UNIT_ARRAYS = new WeakMap();

/** (array (mut i16)), created once per module for string construction. */
function codeUnitArray(ctx) {
  let units = CODE_UNIT_ARRAYS.get(ctx.module);
  if (!units) {
    const builder = new binaryen.TypeBuilder(1);
    builder.setArrayType(0, binaryen.i32, binaryen.i16, true);
    const [heapType] = builder.buildAndDispose();
    units = { heapType, refType: binaryen.getTypeFromHeapType(heapType, false) };
    CODE_UNIT_ARRAYS.set(ctx.module, units);
  }
  return units;
}

function stringConst(m, raw) {
  return stringOps(m).const(raw);
}

function stringOps(m) {
  const ops = m.string;
  const required = ['const', 'concat', 'eq', 'measure', 'slice_wtf16', 'get_wtf16'];
  if (ops && required.every((name) => typeof ops[name] === 'function')) return ops;
  return privateBinaryenStringOps(m);
}

// binaryen@125 exposes stringref builders in its generated private C-API
// exports, but not yet as public module methods. Keep this shim local,
// module-local, and easy to delete when m.string.* lands upstream.
function privateBinaryenStringOps(m) {
  assertPrivateStringApi();
  return {
    const(raw) {
      return binaryen._BinaryenStringConst(m.ptr, binaryen.stringToUTF8OnStack(raw), utf8ByteLength(raw));
    },
    concat(left, right) {
      return binaryen._BinaryenStringConcat(m.ptr, left, right);
    },
    eq(op, left, right) {
      return binaryen._BinaryenStringEq(m.ptr, op, left, right);
    },
    measure(op, ref) {
      return binaryen._BinaryenStringMeasure(m.ptr, op, ref);
    },
    slice_wtf16(ref, start, end) {
      return binaryen._BinaryenStringSliceWTF(m.ptr, ref, start, end);
    },
    get_wtf16(ref, pos) {
      return binaryen._BinaryenStringWTF16Get(m.ptr, ref, pos);
    },
  };
}

function assertPrivateStringApi() {
  const required = [
    '_BinaryenStringConst',
    '_BinaryenStringConcat',
    '_BinaryenStringEq',
    '_BinaryenStringMeasure',
    '_BinaryenStringSliceWTF',
    '_BinaryenStringWTF16Get',
    'stringToUTF8OnStack',
  ];
  const missing = required.filter((name) => typeof binaryen[name] !== 'function');
  if (missing.length) {
    throw new Error(`codegen: binaryen JS exposes neither public m.string.* nor private stringref shim(s): ${missing.join(', ')}`);
  }
}

function utf8ByteLength(raw) {
  return new TextEncoder().encode(raw).length;
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
