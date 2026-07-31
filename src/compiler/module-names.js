// module-names.js — the one place that knows how module names are mangled
//
// Modules are utu's unit of parameterization, so instantiating one and hoisting
// its members both produce derived names. Two conventions, one separator:
//
//   Array[I32]        → Array__I32          an instantiated module
//   Map[Str, I32]     → Map__Str__I32
//   mod M { fn foo }  → M__foo              a hoisted member
//
// The separator was spelled out at three sites before this module existed, and
// a fourth place recovered a type argument by slicing the prefix back off the
// name. That kind of string surgery is ambiguous the moment an argument is
// itself instantiated — `Promise[Array[I32]]` mangles to
// `Promise__Array__I32`, which cannot be split back apart by looking at it.
//
// So instantiation *records* what it built (`data-module-base`,
// `data-module-args`) and callers read that instead of re-parsing the name.

export const MODULE_SEP = '__';

/** `Array` + [`I32`] → `Array__I32`. */
export function instantiatedModuleName(moduleName, typeArgNames) {
  return `${moduleName}${MODULE_SEP}${typeArgNames.join(MODULE_SEP)}`;
}

/** `M` + `foo` → `M__foo`; the promoted type `&` keeps the module's own name. */
export function moduleMemberName(moduleName, member) {
  return member === '&' ? moduleName : `${moduleName}${MODULE_SEP}${member}`;
}

/**
 * Record what an instantiation produced, so the arguments can be recovered
 * without parsing the mangled name.
 */
export function recordInstantiation(node, moduleName, typeArgNames, displayArgNames = typeArgNames) {
  node.dataset.moduleBase = moduleName;
  node.dataset.moduleArgs = JSON.stringify(typeArgNames);
  // Preserve the source-level generic spelling. Tooling must never have to
  // reverse the deliberately ambiguous `__` backend name.
  node.dataset.displayName = `${moduleName}[${displayArgNames.join(', ')}]`;
}

/**
 * The type arguments an instantiated type was built from.
 *
 * @param {object|null} entry  a type registry entry
 * @returns {string[]} argument type names, empty if not an instantiation
 */
export function moduleArgsOf(entry) {
  if (!entry?.moduleArgs) return [];
  try {
    const args = JSON.parse(entry.moduleArgs);
    return Array.isArray(args) ? args : [];
  } catch {
    return [];
  }
}

/** Whether `entry` is an instantiation of the named module. */
export function isInstanceOf(entry, moduleName) {
  return entry?.moduleBase === moduleName;
}
