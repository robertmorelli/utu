= 11. Grammar

EBNF-style grammar for Utu. Whitespace is insignificant except inside string
literals. Comments use `//`, line comments only, with no block comments.

== 11.1 Top-Level

```ebnf
program      ::= item*
item         ::= import_decl | export_decl | fn_decl | type_decl
               | struct_decl | global_decl
```

== 11.2 Declarations

```ebnf
struct_decl  ::= 'struct' TYPE_IDENT '{' field_list '}'
field_list   ::= (field (',' field)* ','?)?
field        ::= 'mut'? IDENT ':' type

type_decl    ::= 'type' TYPE_IDENT '=' variant_list
variant_list ::= '|'? variant ('|' variant)*
variant      ::= TYPE_IDENT ('{' field_list '}')?

fn_decl      ::= 'fn' IDENT '(' param_list ')' return_type? block
param_list   ::= (param (',' param)* ','?)?
param        ::= IDENT ':' type
return_type  ::= type ('#' type)? (',' type ('#' type)?)*

global_decl  ::= 'let' IDENT ':' type '=' expr

import_decl  ::= 'import' 'extern' STRING IDENT '(' param_list ')'
                  return_type?
export_decl  ::= 'export' fn_decl
```

== 11.3 Types

```ebnf
type         ::= scalar_type | ref_type | func_type
             |   type '#' 'null'
             |   '(' type ')'

scalar_type  ::= 'i32' | 'u32' | 'i64' | 'u64'
             |   'f32' | 'f64' | 'v128' | 'bool'

ref_type     ::= TYPE_IDENT | 'str'
             |   'externref' | 'anyref' | 'eqref'
             |   'i31' | 'array' '[' type ']'

func_type    ::= 'fn' '(' type_list ')' return_type
type_list    ::= (type (',' type)*)?
```

== 11.4 Expressions

```ebnf
expr         ::= literal | IDENT | unary_expr | binary_expr
             |   call_expr | pipe_expr | field_expr
             |   index_expr | if_expr | match_expr
             |   block_expr | for_expr | break_expr
             |   assign_expr | bind_expr | else_expr
             |   struct_init | array_init
             |   'unreachable' | '(' expr ')'

bind_expr    ::= 'let' IDENT ':' type (',' IDENT ':' type)* '=' expr

else_expr    ::= expr '\' expr

pipe_expr    ::= expr '-o' pipe_target
pipe_target  ::= IDENT
             |   IDENT '(' pipe_args ')'
pipe_args    ::= pipe_arg (',' pipe_arg)*
pipe_arg     ::= '_' | expr

call_expr    ::= expr '(' arg_list ')'
arg_list     ::= (expr (',' expr)* ','?)?

field_expr   ::= expr '.' IDENT
index_expr   ::= expr '[' expr ']'

if_expr      ::= 'if' expr block ('else' (if_expr | block))?

match_expr   ::= 'match' expr '{' match_arm+ '}'
match_arm    ::= pattern '=>' expr ','
             |   IDENT ':' TYPE_IDENT '=>' expr ','
             |   '_' '=>' expr ','
pattern      ::= IDENT | '_'

for_expr     ::= 'for' '(' for_sources ')' capture? block
for_sources  ::= for_source (',' for_source)*
for_source   ::= expr '..' expr | expr
capture      ::= '|' IDENT (',' IDENT)* '|'

block_expr   ::= (IDENT ':')? '{' stmt* expr? '}'
break_expr   ::= 'break' IDENT? expr?

struct_init  ::= TYPE_IDENT '{' (IDENT ':' expr),* '}'
array_init   ::= 'array' '[' type ']' '.' IDENT '(' arg_list ')'

assign_expr  ::= (field_expr | index_expr) '=' expr
```

== 11.5 Operators

*Precedence, high to low:*

- `1`, highest: `.` `[]` `()`, associativity left
- `2`: `~` bitwise NOT, unary `-` negate, `not`, associativity prefix
- `3`: `*` `/` `%`, associativity left
- `4`: `+` `-`, associativity left
- `5`: `<<` `>>` `>>>`, associativity left
- `6`: `&`, bitwise AND, associativity left
- `7`: `^`, bitwise XOR, associativity left
- `8`: `|`, bitwise OR, associativity left
- `9`: `==` `!=` `<` `>` `<=` `>=`, associativity left
- `10`: `and`, associativity left
- `11`: `or`, associativity left
- `12`: `\`, else or unwrap, associativity left
- `13`, lowest: `-o`, pipe, associativity left

```ebnf
binary_expr  ::= expr bin_op expr
bin_op       ::= '+' | '-' | '*' | '/' | '%'
             |   '==' | '!=' | '<' | '>' | '<=' | '>='
             |   '&' | '|' | '^' | '<<' | '>>' | '>>>'
             |   'and' | 'or'
             |   '\' | '-o'

unary_expr   ::= unary_op expr
unary_op     ::= '-' | 'not' | '~'
```

*Symbol disambiguation:* Every symbol has exactly one role. `#` is always
exclusive disjunction, types only and never expressions. `%` is always
remainder. `^` is always bitwise XOR. `~` is always bitwise NOT, unary only
and never binary. There are no overloaded symbols.

== 11.6 Literals and Identifiers

```ebnf
literal      ::= INT_LIT | FLOAT_LIT | STRING_LIT | 'true' | 'false'
             |   'null'

INT_LIT      ::= [0-9]+ | '0x' [0-9a-fA-F]+ | '0b' [01]+
FLOAT_LIT    ::= [0-9]+ '.' [0-9]+ ([eE] [+-]? [0-9]+)?

STRING_LIT   ::= '"' <characters> '"'
             |   MULTILINE_STR
MULTILINE_STR::= ('\\\\' <characters> NEWLINE)+

IDENT        ::= [a-z_] [a-zA-Z0-9_]*
TYPE_IDENT   ::= [A-Z] [a-zA-Z0-9]*
LABEL        ::= IDENT
```

== 11.7 Comments

```ebnf
COMMENT      ::= '//' <characters> NEWLINE
```

Line comments only. No block comments.
