# Optimized midpoint-insertion Wasm inspection

The production utu module is 192 bytes after Binaryen's max-opt/max-shrink
stage, dedicated `-Oz` stage, string lowering, and import sweeping.
Running an independent `wasm-opt --enable-reference-types --enable-gc -Oz` on
the emitted binary leaves it at exactly 192 bytes.

## Sections

| section | payload | purpose |
|---|---:|---|
| header and section framing | 18 B | Wasm header plus section IDs/lengths |
| types | 28 B | three builtin signatures and exported `run` signature |
| imports | 76 B | `concat`, `length`, and `substring` JS String Builtins |
| functions | 2 B | one function declaration |
| exports | 7 B | export `run` |
| code | 61 B | midpoint loop and calls |

The import section is 40% of the complete module. Most of it is the required
canonical module and field spelling: `wasm:js-string` is encoded independently
for each Wasm import. Those names let the engine recognize JS String Builtins
without shipping a JavaScript adapter.

## Emitted operation shape

Each iteration is reduced to:

```wat
size   = call length(out)
middle = size / 2
out = call concat(
        call concat(call substring(out, 0, middle), piece),
        call substring(out, middle, size))
```

Binaryen keeps `size` and `middle` with `local.tee`, reuses the `out` parameter
as the accumulator, removes the initial zero assignment for the loop counter,
and reduces the loop test to one signed comparison. There are no names, debug,
data, memory, table, element, or custom sections in the production binary.

A dedicated shrink-focused optimization stage after the max-opt stage finds a
byte that the combined max-opt/max-shrink settings alone leave behind
(`eqz(le_s)` becomes `gt_s`). A second independent `-Oz` finds nothing else.

## Remaining theoretical reductions

The standard JS String Builtin ABI is now the lower bound, not utu's IR:

- Replacing canonical imports with short custom names could save tens of Wasm
  bytes, but would require shipping JavaScript adapter code and lose builtin
  recognition. Total wire size and runtime would likely regress.
- Adding a custom host `insert` operation would collapse three imports and four
  calls, but moves language semantics into a utu-specific runtime API. It is a
  different abstraction, not better compression of the same program.
- Countdown-loop canonicalization may save a handful of code bytes in some
  loops, but Binaryen `-Oz` did not choose it and the whole code section is only
  61 bytes.

Conclusion: under the standard host-string ABI, the midpoint-insertion module
is effectively locally optimal. Further substantial reduction requires fewer
semantic operations or a different host ABI, not better generic compression.
