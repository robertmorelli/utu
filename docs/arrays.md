# Array literals

`[a, b, c]` builds an array. Its type comes from context, in this order:

1. A declared native array type: `let xs: Array[F64] = [1, 2.5];`, a parameter,
   a return type, or a struct field. Elements take the element type as
   context, so `1` becomes an `F64` there.
2. A declaration slot from an imported `.d.ts` (`T[]`, a typed array,
   `ArrayLike<T>`, `Iterable<T>`, `any`): the literal becomes a real JS array,
   or the declared typed array. See [the declaration guide](typescript-abi.md).
3. Otherwise, a literal-only array uses the literal defaults: `[1, 2]` is
   `Array[I32]`, `[1, 2.5]` is `Array[F64]`, `["a"]` is `Array[Str]`, and
   `[true]` is `Array[Bool]`. Arrays of other expressions use the
   `Array[T]` matching their element type when the program already uses one;
   otherwise they need an annotation.

A native literal lowers to one `array.new_fixed` instruction. A declaration
slot lowers to one generated import that builds the JS array.

`.{a, b}` is reserved for tuples, which are not supported yet.
