= 11. Grammar

EBNF-style grammar for Utu. Whitespace is insignificant except inside string
literals. Semicolons terminate expressions in blocks and simple top-level
declarations. Comments use `//`, line comments only, with no block comments.

== 11.1 Top-Level

```ebnf
program      ::= item*
item         ::= import_decl | export_decl | fn_decl | type_decl
               | struct_decl | global_decl | test_decl | bench_decl
```

== 11.2 Declarations

```ebnf
struct_decl  ::= 'struct' TYPE_IDENT '{' field_list '}'
field_list   ::= (field (',' field)* ','?)?
field        ::= 'mut'? IDENT ':' type

type_decl    ::= 'type' TYPE_IDENT '=' variant_list ';'
variant_list ::= '|'? variant ('|' variant)*
variant      ::= TYPE_IDENT ('{' field_list '}')?

fn_decl      ::= 'fun' IDENT '(' param_list ')' return_type block
param_list   ::= (param (',' param)* ','?)?
param        ::= IDENT ':' type
return_type  ::= 'void'
               | type ('#' type)? (',' type ('#' type)?)*

global_decl  ::= 'let' IDENT ':' type '=' expr ';'
import_decl  ::= 'shimport' STRING
                  ( IDENT '(' import_param_list? ')' return_type
                  | IDENT ':' type )
                  ';'
import_param_list ::= import_param (',' import_param)* ','?
import_param ::= param | type
export_decl  ::= 'export' fn_decl
test_decl    ::= 'test' STRING block
bench_decl   ::= 'bench' STRING '|' IDENT '|' '{' setup_decl '}'
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

func_type    ::= 'fun' '(' type_list ')' return_type
type_list    ::= (type (',' type)*)?
```

== 11.4 Expressions

```ebnf
expr         ::= literal | IDENT | unary_expr | binary_expr
             |   call_expr | tuple_expr | pipe_expr | field_expr
             |   index_expr | if_expr | match_expr | alt_expr
             |   block_expr | for_expr | while_expr | break_expr
             |   assign_expr | bind_expr | else_expr
             |   struct_init | array_init
             |   namespace_call_expr | ref_null_expr
             |   emit_expr | 'fatal' | '(' expr ')'

bind_expr    ::= 'let' IDENT ':' type (',' IDENT ':' type)* '=' expr

else_expr    ::= expr '\' expr

tuple_expr   ::= '(' expr ',' expr (',' expr)* ','? ')'

pipe_expr    ::= expr '-o' pipe_target
pipe_target  ::= pipe_path
             |   pipe_path '(' pipe_args ')'
pipe_path    ::= IDENT | BUILTIN_NS | pipe_path '.' IDENT
pipe_args    ::= expr (',' expr)*
             |   pipe_prefix? '_' pipe_suffix?
pipe_prefix  ::= expr (',' expr)* ','
pipe_suffix  ::= ',' expr (',' expr)*

call_expr    ::= expr '(' arg_list ')'
arg_list     ::= (expr (',' expr)* ','?)?

field_expr   ::= expr '.' IDENT
index_expr   ::= expr '[' expr ']'

namespace_call_expr ::= BUILTIN_NS '.' IDENT ('(' arg_list? ')')?
ref_null_expr ::= 'ref' '.' 'null' TYPE_IDENT

if_expr      ::= 'if' expr block ('else' (if_expr | block))?

match_expr   ::= 'match' expr '{' match_arm+ '}'
match_arm    ::= match_lit '=>' expr ','
             |   '_' '=>' expr ','
match_lit    ::= INT_LIT | FLOAT_LIT | 'true' | 'false'

alt_expr     ::= 'alt' expr '{' alt_arm+ '}'
alt_arm      ::= IDENT ':' TYPE_IDENT '=>' expr ','
             |   '_' ':' TYPE_IDENT '=>' expr ','
             |   IDENT '=>' expr ','
             |   '_' '=>' expr ','

for_expr     ::= 'for' '(' for_sources ')' capture? block
while_expr   ::= 'while' '(' expr? ')' block
for_sources  ::= for_source (',' for_source)*
for_source   ::= expr '..' expr
capture      ::= '|' IDENT (',' IDENT)* '|'

block_expr   ::= (IDENT ':')? block
block        ::= '{' (expr ';')* '}'
break_expr   ::= 'break'
emit_expr    ::= 'emit' expr

struct_init  ::= TYPE_IDENT '{' (IDENT ':' expr),* '}'
array_init   ::= 'array' '[' type ']' '.' IDENT '(' arg_list ')'

assign_expr  ::= (IDENT | field_expr | index_expr) '=' expr
```

The parser accepts comma-separated `for` sources and captures, but current
lowering only uses the first source/capture pair. Pipe targets may contain at
most one `_` placeholder. Literal scalar switch arms such as `0 => ...` are
not part of the current `match_pattern` grammar.

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
BUILTIN_NS   ::= 'str' | 'array' | 'i31' | 'ref'
              |   'extern' | 'any'
              |   'i32' | 'i64' | 'f32' | 'f64'
```

Line comments only. No block comments.
