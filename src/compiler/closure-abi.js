// Closure runtime ABI shared by lowering, backend planning, and codegen.

/** Import field name for calling a closure with the supplied callable parts. */
export function closureCallImport(parts) {
  const tag = [...parts.params, parts.ret]
    .map(type => type.replace(/[^A-Za-z0-9]/g, '_'))
    .join('_');
  return `closure_call_${tag || 'void'}`;
}
