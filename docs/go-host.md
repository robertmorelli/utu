# The Go host

`utu build` writes a Go package: the module, made Go by gosm (a WasmGC-to-Go
transpiler), and its Go host, the Go that gives everything the module
imports. Utu code and Go code share one garbage collector and one compiler,
with no bridge between them.

```sh
utu build main.utu -o out --package app
#   out/main.wasm       the module
#   out/main_gosm.go    the module as Go: New(Host) (*Instance, error), an
#                       Instance method per export
#   out/host.go         Imports, which is gosm's Host: a method per import
#   out/utu_*.go        the runtime and the standard library's Go
#   out/go.mod          when out is in no module: one that finds gosm/rt
```

```go
inst, err := app.New(&app.Imports{})
err = rt.Catch(func() { inst.Main(); app.Run() })
```

`--package main` makes a program: its `main()` runs `export main`, then the
event loop, and prints what it returns, as `utu run` does, so `go run ./out`
is `utu run main.utu`, in Go.

gosm is `UTU_GOSM` (a checkout of it, or the command), `gosm` on the PATH,
or a checkout beside utu's. Without it, `utu build` writes the module and
its host, for gosm to make Go of later. `--host=js` writes the JavaScript
loader (`main.mjs`) in place of all of it. `utu run` and `utu test` run on
JavaScript, so a program with `@go` bindings is built, not run, by them.

## Writing Go: `@go`

An `@go` binding is a host binding whose body is a Go expression:

```utu
let twice: fun(I32) I32 = @go/\ func(x int32) int32 { return 2 * x } \/;
let shout: fun(Str) Str = @go/\ import "strings"; strings.ToUpper \/;
let answer: I32 = @go/\ 40 \/;
```

- A body may open with `import "path";` declarations; they become host.go's
  imports.
- A function binding's body is any Go function; a value binding's is a value,
  or a function of no arguments that returns it.
- Utu's types are Go's: `I32` is `int32`, `Bool` is `bool`, `F64` is
  `float64`, `Str` is `string`, `cl(I32) Bool` is `func(int32) bool`, and
  anything the host owns (`Externref`, `Promise[T]`) is `any`.
- `utu build` runs the host through `gofmt`, so a body that is not Go fails
  the build, and says where.

The body runs once, when the package starts (a `var`), as an `@es` body does
when its glue module loads.

## The standard library

Every host binding of the standard library, except Wutu's (they are the
browser's), has Go in [std/go](../std/go): a function marked with the
binding it gives.

```go
// utu:Str.trim
func strTrim(s string) string { return strings.TrimFunc(s, isSpace) }
```

The key is the std file and the function the binding is in. `utu build`
finds which binding an import is from its text and its signature, and
host.go calls that binding's function. Nothing is translated from
JavaScript: the Go is written in Go, with Go's library.

`scripts/test-go-host.mjs` (part of `bun run test`) checks that every binding
has Go, that every key is a binding, and that the Go gives what the JavaScript
host does, case by case; and that programs made Go by gosm print what `utu run`
prints. The differences are on purpose, and listed there:

| | Go | JavaScript |
|---|---|---|
| `F64.pow(1, NaN)`, `F64.pow(-1, Infinity)` | 1 | NaN |
| `"straße".to_upper()` | `STRASSE` is not made: `ß` stays | `STRASSE` |
| `"ΟΔΟΣ".to_lower()` | `οδοσ` | `οδος` (final sigma) |
| `F64.pow`, `sin`, `tan` | `math`'s rounding: up to 52, 25, 25 ulps off fdlibm's | fdlibm's |

## Strings

A `Str` is a Go `string`. Its length and positions count UTF-16 code units,
as the module's own string instructions do, so `"é".len()` is 1 and
`"😀".len()` is 2 on every host, and a position from `index_of` is one
`slice` takes. Half a surrogate pair, which slicing can leave, is in the Go
string as its WTF-8 bytes; joining it to its other half makes the pair.
`std/go/strings.go` has the string operations (`StrLength`, `StrSubstring`,
`StrConcat`, …) in those terms, for the transpiled module's string
instructions.

## The runtime

| the module imports | the Go host gives |
|---|---|
| `utu.closure_new`, `utu.closure_call_N` | `*Closure`: the module's function (an `*rt.Func`, called with depth 0) over its environment; `In` makes it any `func` type |
| `utu.promise_then`, `utu.promise_catch` | `*Promise`, with reactions as microtasks |
| `utu.await_N` | `Await`: runs the loop until the promise settles; a rejection is thrown |
| `utu.mem_NAME`, `mem_copy_in_NAME`, `mem_view_NAME` | `*Memory`, over its `*rt.Memory`: `CopyIn`, `View` (a typed slice over `Data`) |
| `utu.js_tag` | `JSTag`, an `*rt.Tag` |

A host exception is an `*rt.Exception` of `JSTag` with the thrown value:
`Throw(v)` throws one, which utu's `catch` catches, and `Thrown(recover())`
is the value. A rejected promise's `Await` throws its reason.

The host runs on the goroutine that calls into the module. Promise
reactions and timers run there, in `Run` or while `Await` waits, never at
the same time as the module's code. So after calling an export, call `Run`,
as a JavaScript host would run its event loop. Go code that works on other
goroutines returns its results through `Post`, or `Async(func() (any, error))`,
which gives a promise.

An import with no Go (an `@es` body of the program's, or an operation of a
TypeScript declaration) becomes a method of `UserImports`, which host.go
declares, and `Imports.User` gives. Package main has none: a program needs
Go for every import, and `utu build` names the ones it lacks.

```go
type UserImports interface {
	// __es_0: (v, ms) => new Promise(r => setTimeout(() => r(v), ms))
	M_es___es_0(p0 int32, p1 int32) any
}
```

## Names

Import `module.field` is the method `M_module_field`, as gosm names it: a
byte Go does not allow in a name is `_` and two hex digits (`a.b` is
`a_2e_b`), and names that come out the same take `_2`, `_3`, … in import
order. Its signature is the one `gosm -emit-host` gives: `int32`, `int64`,
`float32`, `float64`, `*rt.Func` for a function reference, `any` for
anything else of the host's. host.go adapts them to the Go it calls (`In`,
`Out`, `CallN`).
