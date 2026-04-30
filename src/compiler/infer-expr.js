// infer-expr.js — expression and block inference rules

import { typeNodeToStr, fnReturnType, stampType } from './ir-helpers.js';
import { bindingType, unifyTypes } from './infer-type-helpers.js';

// ── Block / statement inference ───────────────────────────────────────────────

export function inferBlock(block, env) {
  for (const child of block.children) {
    inferExpr(child, env);
  }
  // Block type = type of last child
  const last = block.lastElementChild;
  if (last?.dataset.type) block.dataset.type = last.dataset.type;
}

// ── Expression inference ──────────────────────────────────────────────────────

export function inferExpr(node, env) {
  if (!node || typeof node.localName !== 'string') return;

  switch (node.localName) {

    case 'ir-lit': {
      // Allow stdlib @ir templates to pin a literal's type explicitly.  This
      // matters for wrappers like `<ir-i64-sub><ir-lit kind="int" type="i64"
      // value="0"/><ir-ident name="a"/></ir-i64-sub>`: without the override
      // `kind="int"` would default to i32 via literal_defaults and the sub
      // op would get a width mismatch.
      const override = node.getAttribute('type');
      const kind = node.getAttribute('kind');
      const fallback = kind; // unknown kinds keep their own name as a typestring
      const t = override ?? env.literalDefaults.get(kind) ?? fallback;
      stampType(node, t, 'literal');
      return;
    }

    case 'ir-ident': {
      const bid = node.dataset.bindingId;
      if (bid) {
        const decl = env.doc.getElementById(bid);
        const t = bindingType(decl);
        if (t) stampType(node, t, 'binding');
      }
      return;
    }

    case 'ir-let': {
      // Infer the init expression, then type is the declared type annotation
      for (const child of node.children) inferExpr(child, env);
      for (const child of node.children) {
        const t = typeNodeToStr(child);
        if (t) { stampType(node, t, 'declared'); return; }
      }
      return;
    }

    case 'ir-block': {
      inferBlock(node, env);
      return;
    }

    case 'ir-paren': {
      const inner = node.firstElementChild;
      if (inner) { inferExpr(inner, env); stampType(node, inner.dataset.type ?? '', 'paren'); }
      return;
    }

    case 'ir-unary': {
      const operand = node.firstElementChild;
      if (operand) inferExpr(operand, env);
      stampType(node, operand?.dataset.type ?? '', 'unary');
      return;
    }

    case 'ir-binary': {
      const [lhs, rhs] = [...node.children];
      inferExpr(lhs, env);
      inferExpr(rhs, env);
      stampType(node, lhs?.dataset.type ?? '', 'binary');
      return;
    }

    case 'ir-assign': {
      for (const child of node.children) inferExpr(child, env);
      stampType(node, 'void', 'assign');
      return;
    }

    case 'ir-if': {
      for (const child of node.children) inferExpr(child, env);
      const thenBlock = node.firstElementChild?.localName === 'ir-block'
        ? node.firstElementChild
        : node.querySelector(':scope > ir-block');
      const elseBlock = node.lastElementChild !== thenBlock ? node.lastElementChild : null;
      const t = unifyTypes(thenBlock?.dataset.type, elseBlock?.dataset.type)
        ?? thenBlock?.dataset.type
        ?? elseBlock?.dataset.type;
      if (t) stampType(node, t, 'if');
      return;
    }

    case 'ir-while':
    case 'ir-for': {
      for (const child of node.children) inferExpr(child, env);
      stampType(node, 'void', node.localName === 'ir-while' ? 'while' : 'for');
      return;
    }

    case 'ir-match':
    case 'ir-alt': {
      for (const child of node.children) inferExpr(child, env);
      // Type = first arm body type
      const firstArm = node.querySelector(':scope > ir-match-arm, :scope > ir-alt-arm');
      const armBody  = firstArm?.lastElementChild;
      if (armBody?.dataset.type) stampType(node, armBody.dataset.type, node.localName === 'ir-match' ? 'match' : 'alt');
      return;
    }

    case 'ir-promote': {
      for (const child of node.children) inferExpr(child, env);
      const arm = node.querySelector('ir-promote-arm');
      const armType = arm?.lastElementChild?.dataset.type;
      const defaultType = node.querySelector(':scope > ir-default-arm')?.lastElementChild?.dataset.type;
      const t = unifyTypes(armType, defaultType) ?? armType ?? defaultType;
      if (t) stampType(node, t, 'promote');
      return;
    }

    case 'ir-return':
    case 'ir-break': {
      const child = node.firstElementChild;
      if (child) inferExpr(child, env);
      stampType(node, 'void', node.localName === 'ir-return' ? 'return' : 'break');
      return;
    }

    case 'ir-assert':
    case 'ir-fatal': {
      stampType(node, 'void', node.localName === 'ir-assert' ? 'assert' : 'fatal');
      return;
    }

    case 'ir-else': {
      const [expr, fallback] = [...node.children];
      inferExpr(expr, env);
      inferExpr(fallback, env);
      // Unwrap nullable: ?T \ default → T
      const t = expr?.dataset.type;
      stampType(node, t?.startsWith('?') ? t.slice(1) : (t ?? ''), 'orelse');
      return;
    }

    case 'ir-call': {
      for (const child of node.children) inferExpr(child, env);
      const callee = node.firstElementChild;
      // Free fn call: callee is ir-ident with a binding to ir-fn
      if (callee?.localName === 'ir-ident' && callee.dataset.bindingId) {
        const fn = env.doc.getElementById(callee.dataset.bindingId);
        if (fn?.localName === 'ir-fn' || fn?.localName === 'ir-extern-fn') {
          stampType(node, fnReturnType(fn), 'call');
        }
      }
      // Method calls (callee = ir-field-access) are resolved in pass 8
      return;
    }

    case 'ir-type-member': {
      // Static call: TypeName.method — return type resolved in pass 8
      for (const child of node.children) inferExpr(child, env);
      return;
    }

    case 'ir-field-access': {
      const recv = node.firstElementChild;
      if (recv) inferExpr(recv, env);
      // Field type resolved in pass 8 (needs receiver's declared struct)
      return;
    }

    case 'ir-struct-init': {
      for (const child of node.children) inferExpr(child, env);
      const typeName = node.getAttribute('type');
      if (typeName) stampType(node, typeName, 'struct-init');
      return;
    }

    case 'ir-null-ref': {
      const typeName = node.getAttribute('type');
      stampType(node, typeName ? `?${typeName}` : 'null', 'null-ref');
      return;
    }

    case 'ir-ref-test': {
      const inner = node.firstElementChild;
      if (inner) inferExpr(inner, env);
      stampType(node, env.literalDefaults.get('bool') ?? 'bool', 'ref-test');
      return;
    }

    case 'ir-ref-is-null': {
      const inner = node.firstElementChild;
      if (inner) inferExpr(inner, env);
      stampType(node, env.literalDefaults.get('bool') ?? 'bool', 'ref-is-null');
      return;
    }

    case 'ir-ref-cast': {
      const inner = node.firstElementChild;
      if (inner) inferExpr(inner, env);
      const typeName = node.getAttribute('type');
      if (typeName) stampType(node, typeName, 'ref-cast');
      return;
    }

    default:
      for (const child of node.children) inferExpr(child, env);
  }
}

