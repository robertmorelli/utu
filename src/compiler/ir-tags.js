// IR tag names — every IR node is a custom HTML element with the `ir-` prefix.
// Analysis passes stamp computed facts onto nodes as data-* attributes.
// Rewrite passes query the DOM with CSS selectors over structure + data-* attributes.

export const T = Object.freeze({
  // ── Source ────────────────────────────────────────────────────────────────
  SOURCE_FILE:    'ir-source-file',

  // ── Top-level declarations ────────────────────────────────────────────────
  MODULE:         'ir-module',
  TYPE_DEF:       'ir-type-def',        // type & = @ir/\ wasm descriptor \/
  USING:          'ir-using',
  STRUCT:         'ir-struct',
  PROTO:          'ir-proto',
  ENUM:           'ir-enum',
  FN:             'ir-fn',
  EXTERN_FN:      'ir-extern-fn',
  GLOBAL:         'ir-global',
  EXPORT_LIB:     'ir-export-lib',
  EXPORT_MAIN:    'ir-export-main',
  TEST:           'ir-test',
  BENCH:          'ir-bench',

  // ── Sub-declaration nodes ─────────────────────────────────────────────────
  MODULE_PARAMS:  'ir-module-params',   // list of module type parameters
  MODULE_PARAM:   'ir-module-param',    // single module type param (name + variance)
  IMPL_LIST:      'ir-impl-list',       // [P1, P2] impl list on struct/enum
  FIELD:          'ir-field',           // struct/enum field: name : type
  VARIANT:        'ir-variant',         // enum variant: Name { fields }
  NOM_QUALIFIER:  'ir-nom-qualifier',   // nom[tag] nom[rec] etc.
  SELF_PARAM:     'ir-self-param',      // |self| parameter
  PARAM:          'ir-param',           // named function parameter
  PARAM_LIST:     'ir-param-list',
  MEASURE:        'ir-measure',         // measure { } block inside bench
  FN_NAME:        'ir-fn-name',         // fn name (may be qualified: T.foo, P[T].foo)

  // ── Protocol members ──────────────────────────────────────────────────────
  PROTO_GET:      'ir-proto-get',
  PROTO_SET:      'ir-proto-set',
  PROTO_GET_SET:  'ir-proto-get-set',
  PROTO_METHOD:   'ir-proto-method',

  // ── Types ─────────────────────────────────────────────────────────────────
  TYPE_NULLABLE:  'ir-type-nullable',   // ?T
  TYPE_REF:       'ir-type-ref',        // TypeIdent
  TYPE_QUALIFIED: 'ir-type-qualified',  // Module.Type or Module[T].Type
  TYPE_INST:      'ir-type-inst',       // Module[T1, T2]
  TYPE_FN:        'ir-type-fn',         // fun(T1, T2) R
  TYPE_SELF:      'ir-type-self',       // & (promoted type inside module)
  TYPE_VOID:      'ir-type-void',       // void return

  // ── Expressions ───────────────────────────────────────────────────────────
  LIT:            'ir-lit',             // int/float/string/bool/null literal
  IDENT:          'ir-ident',           // identifier reference
  BLOCK:          'ir-block',           // { stmts... }
  PAREN:          'ir-paren',           // (expr)

  UNARY:          'ir-unary',           // -expr, not expr, ~expr
  BINARY:         'ir-binary',          // expr op expr
  ASSIGN:         'ir-assign',          // lhs op= rhs
  PIPE:           'ir-pipe',            // expr |> target
  ELSE:           'ir-else',            // expr \ fallback  (null fallback)

  CALL:           'ir-call',            // expr(args)
  TYPE_MEMBER:    'ir-type-member',     // TypeIdent.method (static call form)
  MOD_CALL:       'ir-mod-call',        // Module[T].method(args)
  FIELD_ACCESS:   'ir-field-access',    // expr.field
  INDEX:          'ir-index',           // expr[i]
  SLICE:          'ir-slice',           // expr[start, end]
  NULL_REF:       'ir-null-ref',        // Type.null
  REF_TEST:       'ir-ref-test',        // ref.test expr against a heap subtype
  REF_CAST:       'ir-ref-cast',        // ref.cast expr to a heap subtype
  REF_IS_NULL:    'ir-ref-is-null',     // ref.is_null expr

  IF:             'ir-if',              // if cond { } else { }
  WHILE:          'ir-while',           // while (cond) { }
  FOR:            'ir-for',             // for (range) |i| { }
  FOR_SOURCE:     'ir-for-source',      // range operand inside for
  MATCH:          'ir-match',           // match expr { arms }
  MATCH_ARM:      'ir-match-arm',
  ALT:            'ir-alt',             // alt expr { arms }
  ALT_ARM:        'ir-alt-arm',
  PROMOTE:        'ir-promote',         // promote expr { |x| => ... }
  DEFAULT_ARM:    'ir-default-arm',     // ~> fallback in match/alt/promote

  LET:            'ir-let',             // let x: T = expr
  RETURN:         'ir-return',          // return expr?
  BREAK:          'ir-break',           // break (with optional label)
  FATAL:          'ir-fatal',           // fatal

  STRUCT_INIT:    'ir-struct-init',     // T1 { field: expr }
  FIELD_INIT:     'ir-field-init',      // field: expr inside struct init
  ASSERT:         'ir-assert',          // assert cond
  DSL:            'ir-dsl',             // @name/\ body \/

  ARG_LIST:       'ir-arg-list',
  CAPTURE:        'ir-capture',         // |i| capture in for
});
