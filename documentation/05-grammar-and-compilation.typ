= Grammar And Compilation Model

== Grammar Overview

The grammar is presented in EBNF style. Whitespace is insignificant except
inside string literals, and comments are line comments only.

=== Top-Level Items

```ebnf
program      ::= item*
item         ::= import_decl | export_decl | fn_decl | type_decl
               | struct_decl | global_decl | test_decl | bench_decl
```

The top level therefore supports imports, exports, functions, named sum types,
structs, global `let` bindings, and opt-in in-source tests and benchmarks.

=== Declarations

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
test_decl    ::= 'test' STRING block
bench_decl   ::= 'bench' STRING '|' IDENT '|' '{' setup_decl '}'
setup_decl   ::= 'setup' '{' expr* measure_decl '}'
measure_decl ::= 'measure' block
```

This section encodes a few core language choices:

- struct fields are declared inline with optional `mut`
- function return types are written directly after the parameter list
- `#` can appear inside the return-type grammar
- `export` wraps an ordinary function declaration rather than introducing a
  second export-only syntax

=== Types

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

The type grammar keeps nullable references as `type '#' 'null'`, preserving the
idea that nullability is a form of exclusive disjunction rather than a separate
kind of type constructor.

=== Expressions

```ebnf
expr         ::= literal | IDENT | unary_expr | binary_expr
             |   call_expr | pipe_expr | field_expr
             |   index_expr | if_expr | match_expr
             |   block_expr | for_expr | break_expr
             |   assign_expr | bind_expr | else_expr
             |   struct_init | array_init | assert_expr
             |   'unreachable' | '(' expr ')'

assert_expr  ::= 'assert' expr

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

Several of the spec's most distinctive features appear here:

- binding is an expression form
- `\` is part of the expression grammar
- `-o` is parsed as a dedicated pipe form
- `for` supports range sources, plain expressions, and optional captures
- blocks can be labeled and can yield values

=== Operators

The precedence table from the spec, from highest to lowest, is:

- field access, indexing, and calls: `.`, `[]`, `()`
- prefix operators: `~`, unary `-`, `not`
- multiplicative: `*`, `/`, `%`
- additive: `+`, `-`
- shifts: `<<`, `>>`, `>>>`
- bitwise AND: `&`
- bitwise XOR: `^`
- bitwise OR: `|`
- comparisons: `==`, `!=`, `<`, `>`, `<=`, `>=`
- logical `and`
- logical `or`
- else / unwrap: `\`
- pipe: `-o`

The EBNF fragment is:

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

The spec also emphasizes symbol disambiguation. Each symbol has one role only,
so no operator is overloaded across unrelated features.

=== Literals, Identifiers, And Comments

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

```ebnf
COMMENT      ::= '//' <characters> NEWLINE
```

The identifier rules reinforce the style guide from the overview chapter:

- lowercase snake case for value identifiers
- leading uppercase for type identifiers
- labels reuse the ordinary identifier form

== Compilation Pipeline

The compilation model is deliberately narrow:

- parse source
- validate parse errors
- lower to WAT
- run `wasm-opt`
- emit the final `.wasm` binary

The spec explicitly avoids monomorphization, borrow checking, and large custom
optimization passes. The compiler is supposed to do minimal semantic work and
leave aggressive optimization to the Wasm engine.

The shared compiler also exposes mode-based lowering:

- `program` emits ordinary declarations only
- `test` additionally synthesizes one exported Wasm function per `test`
- `bench` additionally synthesizes one exported Wasm function per `bench`

Test and benchmark metadata is returned alongside generated code so host tools
can report source names while still executing ordinary Wasm exports.

=== Type Lowering

All language types lower into WasmGC types inside recursive type groups. The
compiler may split those groups by strongly connected components to keep the
generated `rec` groups smaller and more engine-friendly.

Field mutability is preserved exactly:

- const fields become immutable Wasm fields
- `mut` fields become `(mut ...)` Wasm fields

=== Function Lowering

Function lowering is meant to stay straightforward:

- parameters become Wasm locals
- the final source expression is left on the Wasm value stack as the return
- pipes are desugared into nested calls during lowering
- `let` bindings become `local.set` and `local.get`

=== Multi-Value Binding Lowering

The spec calls out one crucial stack-order rule: when multiple values are
returned, Wasm leaves them on the stack in declaration order, but `local.set`
consumes from the top. That means the compiler must bind them in reverse order.

```utu
let q: i32, r: i32 = divmod(10, 3)
```

```wasm
(call $divmod (i32.const 10) (i32.const 3))
;; stack: [q_val, r_val]
(local.set $r)
(local.set $q)
```

This reversal rule applies to both tensor returns and exclusive disjunction
returns.

=== Error Lowering

A return type like `A # B` lowers to a two-result Wasm signature with nullable
references:

```wasm
(result (ref null $A) (ref null $B))
```

For imported extern functions, the compiler inserts a trampoline using Wasm
exception handling:

- success path pushes `(value, ref.null)`
- catch path attempts `ref.cast` into the declared error type
- failed typed catches are rethrown with `throw_ref`
- catch-all nullable imports may use a sentinel representation for the error
  branch

=== Else Operator Lowering

The `\` operator lowers to a null check and branch:

- `expr \ fallback` keeps the left side when non-null and evaluates the right
  side only on null
- `expr \ unreachable` traps on null

For `#` results, the compiler first extracts the nullable success branch and
then applies the same null-handling pattern.
