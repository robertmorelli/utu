import { binaryen } from './types.js';

export function emitStringLiteral(node, ctx) {
  const raw = decodeStringLiteral(node.getAttribute('value') ?? '');
  return stringConst(ctx.module, raw);
}

export function emitStringIntrinsic(opNode, argNodes, ctx, emitExpr) {
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
    default:
      return null;
  }
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
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
