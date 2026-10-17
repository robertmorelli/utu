; `@es/\ … \/` is JavaScript, `@css/\ … \/` CSS, `@json/\ … \/` JSON.
((dsl_expr (identifier) @_name (dsl_body) @injection.content)
  (#eq? @_name "es")
  (#set! injection.language "javascript"))
((dsl_expr (identifier) @_name (dsl_body) @injection.content)
  (#eq? @_name "css")
  (#set! injection.language "css"))
((dsl_expr (identifier) @_name (dsl_body) @injection.content)
  (#eq? @_name "json")
  (#set! injection.language "json"))
((comment) @injection.content
  (#set! injection.language "comment"))
