// Contextual struct sugar is one consumer of the type graph, not a lowering
// rule with its own notion of surrounding syntax.

import { settleTypeGraph } from './type-graph.js';
import { DIAGNOSTIC_KINDS, compilerError } from './diagnostics.js';

export function lowerImplicitStructInit(doc, typeIndex = new Map()) {
  if (!(typeIndex instanceof Map)) typeIndex = new Map(); // legacy options arg
  settleTypeGraph(doc, typeIndex);

  const unresolved = doc?.body?.firstChild?.querySelector('ir-struct-init[implicit="true"]');
  if (unresolved) throw compilerError(
    DIAGNOSTIC_KINDS.IMPLICIT_STRUCT_INIT,
    'implicit struct initializer has no expected type',
    unresolved,
  );
}
