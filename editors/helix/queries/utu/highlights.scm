; utu highlights for Helix. Later patterns win, so general ones come first.

(identifier) @variable

; Types and modules
(type_ident) @type
(promoted_type) @type.builtin
; `$T`: the type a call's argument binds, a type like its other uses.
(type_binder) @type
(module_name (identifier) @namespace)
(module_name (type_ident) @namespace)
; `std:Console`: a module, named like one (as the site shows it), not a string.
(platform_path) @namespace

((type_ident) @type.builtin
  (#match? @type.builtin "^(I8|U8|I16|U16|I32|U32|I64|U64|F32|F64|Bool|Str|Externref|I31|M32|M64|M128|V128)$"))

; Declarations
(fn_name (identifier) @function)
(fn_name (type_ident) @type)
(param (identifier) @variable.parameter)
(self_param (identifier) @variable.builtin)
(closure_param (identifier) @variable.parameter)
(capture (identifier) @variable.parameter)
(field (identifier) @variable.other.member)
(field_init (identifier) @variable.other.member)
(variant (type_ident) @type.enum.variant)

; Calls and members
; (Any base: `a.b`, `a.b.c`, `T.x.y`.)
(field_expr (_) (identifier) @variable.other.member .)
(optional_field_expr (_) (identifier) @variable.other.member .)
(type_member_expr (_) (identifier) @variable.other.member .)
(call_expr (identifier) @function)
(call_expr (field_expr (_) (identifier) @function.method .))
(call_expr (type_member_expr (_) (identifier) @function .))

; Literals
(int_lit) @constant.numeric.integer
(float_lit) @constant.numeric.float
(bool_lit) @constant.builtin.boolean
(null_expr) @constant.builtin
(string_lit) @string
(multiline_string_line) @string
(template_head) @string
(template_middle) @string
(template_tail) @string
(template_full) @string
(comment) @comment

; Embedded languages: `@wutu/\ … \/`, `@es/\ … \/`, …
(dsl_expr (identifier) @function.macro)
(dsl_expr "@" @function.macro)
(dsl_body ["/\\" "\\/"] @function.macro)
; (A DSL's text gets its own language: see injections.scm. It is not
; captured itself, so it takes no string colour or background.)

; Keywords
[
  "fn" "let" "struct" "enum" "proto" "mod" "type" "distinct" "tag" "rec"
  "mem" "vec" "const" "using" "from" "lazy" "export" "lib" "main" "test" "bench" "measure"
  "get" "set" "new" "cl" "fun"
] @keyword

[
  "if" "else" "for" "while" "loop" "match" "alt" "promote" "orelse"
  "return" "continue" "defer" "errdefer" "yield" "try" "catch" "await" "assert" "in" "out"
] @keyword.control

[ "and" "or" "not" "xor" ] @keyword.operator

; Iterator stages and terminals
[
  "map" "filter" "take" "skip" "take_while" "skip_while" "zip" "chain" "flat_map" "scan" "repeat"
  "fold" "each" "sum" "product" "fast_sum" "count" "count_where" "any" "all" "first_index" "last_index"
  "collect" "sort" "group_by" "distinct_by" "partition" "batched" "windows" "min_by" "max_by"
  "first_where" "reduce" "bisect"
] @function.builtin

; Operators and punctuation
[
  "=" "+=" "-=" "*=" "/=" "%=" "&=" "|=" "^=" "<<=" ">>=" ">>>=" "and=" "or=" "xor="
  "==" "!=" "<" "<=" ">" ">=" "+" "-" "*" "/" "%" "&" "^" "<<" ">>" ">>>" "~"
  "=>" "~>" "..<" "..." "?" "?."
] @operator

[ "(" ")" "[" "]" "{" "}" ] @punctuation.bracket
[ "," ";" ":" "." "|" ] @punctuation.delimiter
