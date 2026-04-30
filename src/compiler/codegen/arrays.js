import { binaryen } from './types.js';

export function emitArrayIntrinsic(opNode, argNodes, ctx, emitExpr) {
  switch (opNode.localName) {
    case 'ir-array-new':   return emitArrayNew(argNodes, ctx, emitExpr);
    case 'ir-array-get':   return emitArrayGet(argNodes, ctx, emitExpr);
    case 'ir-array-set':   return emitArraySet(argNodes, ctx, emitExpr);
    case 'ir-array-len':   return emitArrayLen(argNodes, ctx, emitExpr);
    case 'ir-array-slice': return emitArraySlice(argNodes, ctx, emitExpr);
    default:               return null;
  }
}

function emitArrayNew([lenNode], ctx, emitExpr) {
  if (!lenNode) throw new Error('codegen: ir-array-new missing length');
  const info = arrayInfoFromCall(ctx);
  return ctx.module.array.new_default(info.heapType, emitExpr(lenNode, ctx));
}

function emitArrayGet([selfNode, indexNode], ctx, emitExpr) {
  if (!selfNode || !indexNode) throw new Error('codegen: ir-array-get missing self/index');
  const info = arrayInfoFromNode(selfNode, ctx);
  return ctx.module.array.get(
    castArrayRef(selfNode, ctx, emitExpr),
    emitExpr(indexNode, ctx),
    elementBinaryenType(info, ctx),
    false,
  );
}

function emitArraySet([selfNode, indexNode, valueNode], ctx, emitExpr) {
  if (!selfNode || !indexNode || !valueNode) throw new Error('codegen: ir-array-set missing self/index/value');
  return ctx.module.array.set(
    castArrayRef(selfNode, ctx, emitExpr),
    emitExpr(indexNode, ctx),
    emitExpr(valueNode, ctx),
  );
}

function emitArrayLen([selfNode], ctx, emitExpr) {
  if (!selfNode) throw new Error('codegen: ir-array-len missing self');
  return ctx.module.array.len(castArrayRef(selfNode, ctx, emitExpr));
}

function emitArraySlice([selfNode, startNode, endNode], ctx, emitExpr) {
  if (!selfNode || !startNode || !endNode) throw new Error('codegen: ir-array-slice missing self/start/end');
  const m = ctx.module;
  const info = arrayInfoFromNode(selfNode, ctx);
  const selfSlot = ctx.addLocal(selfNode.dataset.type ?? '');
  const startTypeName = startNode.dataset.type ?? 'i32';
  const endTypeName = endNode.dataset.type ?? 'i32';
  const lenTypeName = startTypeName;
  const startType = ctx.toType(startTypeName);
  const endType = ctx.toType(endTypeName);
  const lenType = ctx.toType(lenTypeName);
  const indexNs = ctx.scalarNamespaceOf(startTypeName);
  if (!indexNs || indexNs !== ctx.scalarNamespaceOf(endTypeName)) {
    throw new Error(`codegen: array slice indices must have the same scalar type, got ${startTypeName} and ${endTypeName}`);
  }
  const indexOps = m[indexNs];
  const startSlot = ctx.addLocal(startTypeName);
  const endSlot = ctx.addLocal(endTypeName);
  const lenSlot = ctx.addLocal(lenTypeName);
  const outSlot = ctx.addLocal(selfNode.dataset.type ?? '');

  return m.block(
    null,
    [
      m.local.set(selfSlot, castArrayRef(selfNode, ctx, emitExpr)),
      m.local.set(startSlot, emitExpr(startNode, ctx)),
      m.local.set(endSlot, emitExpr(endNode, ctx)),
      m.local.set(lenSlot, indexOps.sub(m.local.get(endSlot, endType), m.local.get(startSlot, startType))),
      m.local.set(outSlot, m.array.new_default(info.heapType, m.local.get(lenSlot, lenType))),
      m.array.copy(
        m.local.get(outSlot, info.refType),
        zeroConst(m, indexNs),
        m.local.get(selfSlot, info.refType),
        m.local.get(startSlot, startType),
        m.local.get(lenSlot, lenType),
      ),
      m.local.get(outSlot, info.refType),
    ],
    info.refType,
  );
}

function zeroConst(m, namespace) {
  return namespace === 'i64' ? m.i64.const(0, 0) : m[namespace].const(0);
}

function castArrayRef(node, ctx, emitExpr) {
  const info = arrayInfoFromNode(node, ctx);
  return ctx.module.ref.cast(emitExpr(node, ctx), info.refType);
}

function arrayInfoFromCall(ctx) {
  const call = ctx.currentCall;
  const callee = call?.firstElementChild;
  const t = call?.dataset.type ?? callee?.dataset.type ?? '';
  return arrayInfoFromType(t, ctx);
}

function arrayInfoFromNode(node, ctx) {
  return arrayInfoFromType(node.dataset.type ?? '', ctx);
}

function arrayInfoFromType(typeName, ctx) {
  const name = typeName.startsWith('?') ? typeName.slice(1) : typeName;
  const info = ctx.structTypes.get(name);
  if (!info || info.kind !== 'array') {
    throw new Error(`codegen: expected array type, got "${typeName}"`);
  }
  return info;
}

function elementBinaryenType(info, ctx) {
  return ctx.toType(info.elem ?? '');
}
