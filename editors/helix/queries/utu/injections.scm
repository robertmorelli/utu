; A DSL's text (`@name/\ … \/`, without the delimiters) in its own language:
; Wutu (which injects utu's DSLs again, recursively), JavaScript, Go, CSS. (@json's
; text is its own small language, not JSON: it reads as a string.)
((dsl_expr (identifier) @_name (dsl_body "dsl_text" @injection.content))
  (#eq? @_name "wutu")
  (#set! injection.language "wutu"))
((dsl_expr (identifier) @_name (dsl_body "dsl_text" @injection.content))
  (#eq? @_name "es")
  (#set! injection.language "javascript"))
((dsl_expr (identifier) @_name (dsl_body "dsl_text" @injection.content))
  (#eq? @_name "go")
  (#set! injection.language "go"))
((dsl_expr (identifier) @_name (dsl_body "dsl_text" @injection.content))
  (#eq? @_name "css")
  (#set! injection.language "css"))
((comment) @injection.content
  (#set! injection.language "comment"))
