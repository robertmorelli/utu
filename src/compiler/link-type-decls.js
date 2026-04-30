// link-type-decls.js — Pass 5
//
// linkTypeDecls(doc) → Map<string, Element>
//
// Indexes all top-level type declarations (struct, enum, proto) by name and
// stamps data-decl-id on every type reference node that resolves to one.
// Scalar and primitive types are left without data-decl-id — they need no
// further resolution.  Unknown names get data-error="unknown-type:Name".
//
// Returns the index map so later passes can reuse it without re-querying.
import { DIAGNOSTIC_KINDS, stampDiagnostic } from './diagnostics.js';

// Only 'void' bypasses declaration lookup.
// Every named source type, including stdlib scalars and refs, should arrive
// here as a normal ir-type-ref that resolves through the shared index.
const PRIMITIVES = new Set(['void']);

/**
 * @param {Document} doc
 * @returns {Map<string, Element>}  name → declaration element
 */
export function linkTypeDecls(doc) {
  const root = doc.body.firstChild;
  if (!root) return new Map();

  // ── 1. Build declaration index ─────────────────────────────────────────────
  /** @type {Map<string, Element>} */
  const index = new Map();
  for (const decl of root.querySelectorAll(
    ':scope > ir-struct, :scope > ir-enum, :scope > ir-proto, :scope > ir-type-def'
  )) {
    index.set(decl.getAttribute('name'), decl);
    if (decl.localName === 'ir-enum') {
      for (const variant of decl.querySelectorAll(':scope > ir-variant')) {
        index.set(variant.getAttribute('name'), variant);
      }
    }
  }

  // ── 2. Resolve ir-type-ref nodes ──────────────────────────────────────────
  for (const ref of root.querySelectorAll('ir-type-ref')) {
    const name = ref.getAttribute('name');
    if (PRIMITIVES.has(name)) continue;
    const decl = index.get(name);
    if (decl) {
      ref.dataset.declId = decl.id;
      ref.dataset.declOriginId = decl.dataset.originId ?? decl.id;
      ref.dataset.declKind = decl.localName;
      ref.dataset.declName = name;
    } else {
      stampDiagnostic(ref, DIAGNOSTIC_KINDS.UNKNOWN_TYPE, `Unknown type '${name}'`, { name });
    }
  }

  // ── 3. ir-type-qualified should be gone after hoisting ────────────────────
  // If any remain they indicate a bug in the hoisting pass — flag them.
  for (const q of root.querySelectorAll('ir-type-qualified')) {
    stampDiagnostic(q, DIAGNOSTIC_KINDS.REWRITE_INVARIANT, 'Unresolved qualified type after hoisting');
  }

  return index;
}
