// codegen/null-literals.js — context-typed `null` literal emission

export function isNullLiteral(node) {
  return node?.localName === 'ir-lit' && (node.getAttribute('kind') === 'null' || node.dataset.type === 'null');
}

export function emitNullLiteral(node, ctx, expectedType = '') {
  const type = expectedType && expectedType !== 'null'
    ? expectedType
    : node.dataset.expectedType ?? '';
  if (!type.startsWith('?')) {
    throw new Error('codegen: untyped null literal reached backend; use T.null or a nullable context');
  }
  const typeName = type.slice(1);
  const info = ctx.structTypes.get(typeName);
  if (!info) throw new Error(`codegen: null literal type "${type}" is not a registered nullable ref`);
  return ctx.module.ref.null(info.nullableRefType);
}
