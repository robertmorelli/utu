; utu highlights for Helix. Later patterns win, so general ones come first.

(identifier) @variable

; Types and modules
(type_ident) @type
(void_type) @type.builtin
(promoted_type) @type.builtin
(module_name (identifier) @namespace)
(module_name (type_ident) @namespace)
(platform_path) @string.special.path

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
(call_expr (identifier) @function)
(call_expr (field_expr (identifier) (identifier) @function.method))
(call_expr (type_member_expr (type_ident) (identifier) @function))
(field_expr (identifier) (identifier) @variable.other.member)
(optional_field_expr (identifier) (identifier) @variable.other.member)

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
(dsl_body) @string.special

; Keywords
[
  "fn" "let" "struct" "enum" "proto" "mod" "type" "distinct" "tag" "rec"
  "mem" "vec" "const" "using" "from" "lazy" "export" "lib" "main" "test" "bench" "measure"
  "get" "set" "new" "cl" "fun"
] @keyword

[
  "if" "else" "for" "while" "loop" "match" "alt" "promote" "orelse"
  "return" "continue" "defer" "yield" "try" "catch" "await" "assert" "in" "out"
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
  "=>" "~>" "-o" "..<" "..." "?" "?."
] @operator

[ "(" ")" "[" "]" "{" "}" ] @punctuation.bracket
[ "," ";" ":" "." "|" ] @punctuation.delimiter
