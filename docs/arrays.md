# Array literals

`[a, b, c]` builds an array. Its type comes from context, in this order:

1. A declared native array type: `let xs: Array[F64] = [1, 2.5];`, a parameter,
   a return type, or a struct field. Elements take the element type as
   context, so `1` becomes an `F64` there.
2. A declaration slot from an imported `.d.ts` (`T[]`, a typed array,
   `ArrayLike<T>`, `Iterable<T>`, `any`): the literal becomes a real JS array,
   or the declared typed array. See [the declaration guide](typescript-abi.md).
3. Otherwise the elements decide: `[1, 2]` is `Array[I32]`, `["a"]` is
   `Array[Str]`, `[x, y]` uses their common type, integer literals join any
   numeric neighbour (`[x, 2]` with `x: F64` is `Array[F64]`), `null` makes
   the element nullable (`[p, null]` is `Array[?P]`), and arrays nest
   (`[[1, 2], [3]]`). Host values work too: `[new JS.Date(0)]` is a native
   array of `JS.Date`.
4. An unannotated `let` bound to a literal waits for its first use: passed
   to JavaScript, or used through a JS array member native arrays lack
   (`push`, `length`, `join`, `sort`, …), it is a JS array; passed where an
   `Array[T]` is expected, or assigned one, an empty `[]` becomes that type.
   An empty `[]` nothing constrains holds nothing, so it is `Array[I32]`.

A native Wasm array is opaque to JavaScript, so an array literal never reaches
a JS slot as one: `JSON.stringify([1, 2])` receives a real JS array. An
`@es` binding cannot take or give an `Array[T]` (`fun(Array[Str]) F64` is an
error): pass its elements, or a `Str` from `@json encode`.

Generic module instances are created before types are known. When typing
finds an array literal whose element type has no `Array[T]` instance yet, the
compiler requests it and compiles once more; programs that do not need this
never pay for it.

A native literal lowers to one `array.new_fixed` instruction. A declaration
slot lowers to one generated import that builds the JS array.

`.{a, b}` is reserved for tuples, which are not supported yet.
