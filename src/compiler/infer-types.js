// infer-types.js — Pass 7
//
// inferTypes(doc, typeIndex) → void
//
// Bottom-up type inference. Stamps data-type on every expression node.
//
// Type string format:
//   Scalars/primitives : "i32", "f64", "bool", "str", "void", "externref" …
//   Named type         : "DeclName"   (PascalCase, no prefix needed)
//   Nullable           : "?i32", "?Foo"
//   Unknown/error      : left unset; data-error stamped instead
//
// This pass requires passes 5 and 6 to have run (type decl linking and
// binding resolution). Method calls are typed in pass 8 — this pass leaves
// ir-call nodes whose callee is ir-field-access without a data-type.

/**
 * @param {Document}          doc
 * @param {Map<string, Element>} typeIndex  from linkTypeDecls (pass 5)
 */
export function inferTypes(doc, typeIndex) {
  const root = doc.body.firstChild;
  if (!root) return;

  // Build fn index: qualified name → ir-fn element.
  // Use querySelectorAll without :scope > to also find fns inside ir-export-lib
  // (before hoistModules runs, fns are nested inside export declarations).
  const fnIndex = new Map();
  for (const fn of root.querySelectorAll('ir-fn')) {
    fnIndex.set(fn.getAttribute('name'), fn);
  }

  // Infer return type for every fn body, then stamp each expression
  for (const fn of root.querySelectorAll('ir-fn')) {
    const body = fn.querySelector(':scope > ir-block');
    if (body) inferBlock(body, doc, fnIndex);
  }

  // Global initialisers
  for (const g of root.querySelectorAll('ir-global')) {
    const init = g.children[g.children.length - 1];
    if (init) inferExpr(init, doc, fnIndex);
  }
}

// ── Type node → string ────────────────────────────────────────────────────────

export function typeNodeToStr(typeNode) {
  if (!typeNode) return null;
  switch (typeNode.localName) {
    case 'ir-type-scalar': return typeNode.getAttribute('kind');
    case 'ir-type-void':   return 'void';
    case 'ir-type-ref':    return typeNode.getAttribute('name');
    case 'ir-type-nullable': {
      const inner = typeNodeToStr(typeNode.children[0]);
      return inner ? `?${inner}` : null;
    }
    case 'ir-type-array': {
      const inner = typeNodeToStr(typeNode.children[0]);
      return inner ? `array[${inner}]` : null;
    }
    default: return null;
  }
}

// Return type of an ir-fn: the type child that isn't fn-name / self-param /
// param-list / block.
export function fnReturnType(fn) {
  for (const child of fn.children) {
    const tag = child.localName;
    if (tag === 'ir-fn-name' || tag === 'ir-self-param' ||
        tag === 'ir-param-list' || tag === 'ir-block') continue;
    return typeNodeToStr(child);
  }
  return 'void';
}

// Type of a binding node (ir-param, ir-let, ir-global, ir-self-param)
function bindingType(node, doc, fnIndex) {
  if (!node) return null;
  switch (node.localName) {
    case 'ir-param':
    case 'ir-let':
    case 'ir-global': {
      // First child that is a type node
      for (const child of node.children) {
        const t = typeNodeToStr(child);
        if (t) return t;
      }
      return null;
    }
    case 'ir-self-param': {
      // Type is the receiver of the enclosing ir-fn
      const fn = node.closest('ir-fn');
      if (!fn) return null;
      const fnName = fn.querySelector(':scope > ir-fn-name');
      const recv   = fnName?.getAttribute('receiver');
      return recv ?? null;
    }
    case 'ir-fn':
      return fnReturnType(node);
    case 'ir-capture':
      return 'i64'; // spec: for loop captures are always i64
    default:
      return null;
  }
}

// ── Block / statement inference ───────────────────────────────────────────────

function inferBlock(block, doc, fnIndex) {
  for (const child of block.children) {
    inferExpr(child, doc, fnIndex);
  }
  // Block type = type of last child
  const last = block.children[block.children.length - 1];
  if (last?.dataset.type) block.dataset.type = last.dataset.type;
}

// ── Expression inference ──────────────────────────────────────────────────────

function inferExpr(node, doc, fnIndex) {
  if (!node || typeof node.localName !== 'string') return;

  switch (node.localName) {

    case 'ir-lit': {
      const kind = node.getAttribute('kind');
      const map  = { int: 'i32', float: 'f64', bool: 'bool', string: 'str',
                     'string-multi': 'str', null: 'null' };
      node.dataset.type = map[kind] ?? kind;
      return;
    }

    case 'ir-ident': {
      const bid = node.dataset.bindingId;
      if (bid) {
        const decl = doc.getElementById(bid);
        const t = bindingType(decl, doc, fnIndex);
        if (t) node.dataset.type = t;
      }
      return;
    }

    case 'ir-let': {
      // Infer the init expression, then type is the declared type annotation
      for (const child of node.children) inferExpr(child, doc, fnIndex);
      for (const child of node.children) {
        const t = typeNodeToStr(child);
        if (t) { node.dataset.type = t; return; }
      }
      return;
    }

    case 'ir-block': {
      inferBlock(node, doc, fnIndex);
      return;
    }

    case 'ir-paren': {
      const inner = node.children[0];
      if (inner) { inferExpr(inner, doc, fnIndex); node.dataset.type = inner.dataset.type ?? ''; }
      return;
    }

    case 'ir-unary': {
      const operand = node.children[0];
      if (operand) inferExpr(operand, doc, fnIndex);
      const op = node.getAttribute('op');
      node.dataset.type = op === 'not' ? 'bool' : (operand?.dataset.type ?? '');
      return;
    }

    case 'ir-binary': {
      const [lhs, rhs] = [...node.children];
      inferExpr(lhs, doc, fnIndex);
      inferExpr(rhs, doc, fnIndex);
      const op = node.getAttribute('op');
      const cmp = ['==','!=','<','>','<=','>=','and','or','xor','not'];
      node.dataset.type = cmp.includes(op) ? 'bool' : (lhs?.dataset.type ?? '');
      return;
    }

    case 'ir-assign': {
      const [, rhs] = [...node.children];
      for (const child of node.children) inferExpr(child, doc, fnIndex);
      node.dataset.type = 'void';
      return;
    }

    case 'ir-if': {
      for (const child of node.children) inferExpr(child, doc, fnIndex);
      // Type = type of then-block (else must match — type checking validates)
      const thenBlock = node.querySelector(':scope > ir-block');
      if (thenBlock?.dataset.type) node.dataset.type = thenBlock.dataset.type;
      return;
    }

    case 'ir-while':
    case 'ir-for': {
      for (const child of node.children) inferExpr(child, doc, fnIndex);
      node.dataset.type = 'void';
      return;
    }

    case 'ir-match':
    case 'ir-alt': {
      for (const child of node.children) inferExpr(child, doc, fnIndex);
      // Type = first arm body type
      const firstArm = node.querySelector('ir-match-arm, ir-alt-arm');
      const armBody  = firstArm?.children[firstArm.children.length - 1];
      if (armBody?.dataset.type) node.dataset.type = armBody.dataset.type;
      return;
    }

    case 'ir-promote': {
      for (const child of node.children) inferExpr(child, doc, fnIndex);
      const arm = node.querySelector('ir-promote-arm');
      if (arm?.dataset.type) node.dataset.type = arm.dataset.type;
      return;
    }

    case 'ir-return':
    case 'ir-break': {
      const child = node.children[0];
      if (child) inferExpr(child, doc, fnIndex);
      node.dataset.type = 'void';
      return;
    }

    case 'ir-assert':
    case 'ir-fatal': {
      node.dataset.type = 'void';
      return;
    }

    case 'ir-else': {
      const [expr, fallback] = [...node.children];
      inferExpr(expr, doc, fnIndex);
      inferExpr(fallback, doc, fnIndex);
      // Unwrap nullable: ?T \ default → T
      const t = expr?.dataset.type;
      node.dataset.type = t?.startsWith('?') ? t.slice(1) : (t ?? '');
      return;
    }

    case 'ir-call': {
      for (const child of node.children) inferExpr(child, doc, fnIndex);
      const callee = node.children[0];
      // Free fn call: callee is ir-ident with a binding to ir-fn
      if (callee?.localName === 'ir-ident' && callee.dataset.bindingId) {
        const fn = doc.getElementById(callee.dataset.bindingId);
        if (fn?.localName === 'ir-fn') {
          node.dataset.type = fnReturnType(fn);
        }
      }
      // Method calls (callee = ir-field-access) are resolved in pass 8
      return;
    }

    case 'ir-type-member': {
      // Static call: TypeName.method — return type resolved in pass 8
      for (const child of node.children) inferExpr(child, doc, fnIndex);
      return;
    }

    case 'ir-field-access': {
      const recv = node.children[0];
      if (recv) inferExpr(recv, doc, fnIndex);
      // Field type resolved in pass 8 (needs receiver's declared struct)
      return;
    }

    case 'ir-struct-init': {
      for (const child of node.children) inferExpr(child, doc, fnIndex);
      const typeName = node.getAttribute('type');
      if (typeName) node.dataset.type = typeName;
      return;
    }

    case 'ir-null-ref': {
      const typeName = node.getAttribute('type');
      node.dataset.type = typeName ? `?${typeName}` : 'null';
      return;
    }

    case 'ir-tuple': {
      for (const child of node.children) inferExpr(child, doc, fnIndex);
      node.dataset.type = 'tuple'; // tuples are not first-class types
      return;
    }

    default:
      for (const child of node.children) inferExpr(child, doc, fnIndex);
  }
}
