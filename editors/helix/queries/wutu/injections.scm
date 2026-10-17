; `@document { … }` is CSS.
((css_text) @injection.content
  (#set! injection.language "css"))

; A DSL inside a template's utu, by name: `@wutu` is Wutu again.
((dsl_expr (dsl_name) @_name (dsl_body "dsl_text" @injection.content))
  (#eq? @_name "wutu")
  (#set! injection.language "wutu"))
((dsl_expr (dsl_name) @_name (dsl_body "dsl_text" @injection.content))
  (#eq? @_name "es")
  (#set! injection.language "javascript"))
((dsl_expr (dsl_name) @_name (dsl_body "dsl_text" @injection.content))
  (#eq? @_name "css")
  (#set! injection.language "css"))
