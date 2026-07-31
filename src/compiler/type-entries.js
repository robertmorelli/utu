// Small, dependency-neutral queries over canonical type-registry entries.

/** Return the declaration represented by a type-registry entry. */
export function typeEntryDecl(entry) {
  return entry?.decl ?? null;
}
