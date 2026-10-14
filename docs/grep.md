# Semantic grep

`utu grep` finds code by what it is: its syntax, the types the compiler
checked, and what its names resolve to. It runs on the self-hosted
compiler (`src/selfhost/grep.js`); each file given (or each `.utu` file
under a directory) is built as a program, and matches in files several
programs import are reported once.

```sh
utu grep '$v.push($x)' src/                       # every push, on anything
utu grep '$v.push($x)' src/ --where 'v: Array[*]'  # on arrays
utu grep '$a + $a' src/                            # a value added to itself
utu grep 'if $c { $...body; }' src/                # every if without an else
utu grep 'let $n = $v; return $n;' src/            # statements in a row
utu grep '$e' src/ --where 'e: ?Str'               # every expression of a type
utu grep --refs count src/                         # a name's declarations and uses
```

## Patterns

A pattern is utu, parsed by the compiler's own parser, so spacing and
comments never matter. It is an expression, a run of statements, or
declarations, with holes:

| hole | matches |
|---|---|
| `$x` | any one node; where `$x` recurs, the same code each time |
| `$...xs` | any run of siblings: arguments, statements, fields (zero or more) |
| `$_` | any one node, not bound |

Everything else must be as written: node kinds, operators, keywords, names,
and literals. A name in a pattern matches by spelling (`count(…)` is any
call of something named `count`); `--refs` matches by resolution.

## Types

`--where 'x: T'` keeps the matches whose hole `$x` has type `T`, as the
compiler checked it and writes it (`I32`, `?Str`, `Array[I32]`, `Stream[Str]`,
`fun(I32) Bool`). `*` stands for any run of characters: `Array[*]`. A
pattern that is only a hole (`$e`) matches every expression of that type.
Types come from both builds `utu check` makes (the exports' and the
tests'); code neither reaches has none.

## References

`--refs name` lists each declaration named `name` in the program's own files
(functions, types, fields, locals, …) and every name that resolves to it,
methods included. Another declaration of the same name (a local `count`
beside a function `count`) is listed as its own declaration, with its own
uses.

## Output

`file:line:column: line`, the match highlighted on a terminal; with
`--json`, each match's file, line, column, UTF-16 offsets, and the places
its holes bound. The exit status is 0 when something matched, 1 when
nothing did, and 2 when the pattern is not utu.
