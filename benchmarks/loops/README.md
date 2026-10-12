# Loops and iterators against Rust

`loops.utu` and `loops.rs` implement the same 29 kernels: every loop form and
every iterator operator. Rust is the yardstick (`opt-level=3`, fat LTO, no
SIMD, since utu has none), not a target: its slices live in linear memory
where LLVM removes bounds checks and unrolls, while every WasmGC `array.get`
is checked by the engine.

```sh
node scripts/benchmark-loops.mjs     # V8
bun  scripts/benchmark-loops.mjs     # JSC
ONLY=sort_ints,zip_dot N=200000 node scripts/benchmark-loops.mjs
```

The script checks that utu and Rust agree on every kernel before timing.

## Results (1M elements, Apple Silicon; ns per element)

This table is from the first pass; later passes are listed below it.

| kernel | Rust V8 | utu -Oz V8 | utu -O3 V8 | Rust JSC | utu -Oz JSC | utu -O3 JSC |
| --- | --- | --- | --- | --- | --- | --- |
| `while` sum | 0.32 | 0.65 | 0.64 | 0.13 | 0.67 | 0.67 |
| `for` range sum | 0.32 | 0.63 | **0.46** | 0.13 | 0.69 | **0.37** |
| `for (xs)` sum | 0.31 | 0.64 | **0.46** | 0.13 | 0.67 | **0.37** |
| `each` / `sum` | 0.31 | 0.63 | **0.45** | 0.13 | 0.67 | **0.37** |
| `map filter fold` | 0.42 | 0.70 | 0.70 | 0.41 | 0.81 | 0.78 |
| `count_where` / `any` | 0.31 | 0.62 | 0.62 | 0.25 | 0.68 | 0.70 |
| `zip` dot (I32) | 0.31 | 0.72 | 0.72 | 0.19 | 0.83 | 0.82 |
| `zip` dot (F64) | 0.94 | 0.94 | 0.93 | 0.98 | 0.94 | 0.95 |
| `skip take sum` | 0.16 | 0.33 | **0.22** | 0.07 | 0.35 | **0.19** |
| `chain` | 0.63 | 1.27 | **0.90** | 0.27 | 1.38 | **0.75** |
| `collect` (map) | 0.27 | 1.41 | 1.39 | 0.25 | 1.80 | 1.77 |
| `scan collect` | 0.79 | 1.38 | 1.41 | 0.74 | 1.58 | 1.53 |
| `sort` (stable) | 8.9 | 58 | 58 | 8.7 | 60 | 60 |
| `group_by` (16 keys) | 5.4 | 10.2 | 10.2 | 8.3 | 14.0 | 14.3 |
| `partition` | 4.0 | 5.8 | 5.8 | 4.4 | 7.4 | 7.5 |
| `batched(64)` | 0.36 | 0.51 | 0.52 | 0.29 | 1.08 | 1.14 |
| `windows(4)` | 12.1 | 25.6 | 23.6 | 11.7 | 7.7 | 7.5 |
| `min_by` | 0.88 | 0.50 | 0.50 | 0.85 | 0.62 | 0.63 |
| `bisect` ×1M | 22 | 48 | 48 | 22 | 42 | 42 |
| `flat_map` (2-element arrays) | 0.40 | 2.58 | 2.49 | 0.20 | 4.11 | 3.54 |

Geometric mean, utu -Oz / Rust: **2.0× on V8, 3.0× on JSC** (it was 3.35× and
5.1× before the changes below). Module size for all 26 kernels: utu 4.4 KB
(-Oz) / 5.7 KB (-O3), Rust 29.5 KB.

## Against other wasm languages

The same 29 kernels, written idiomatically in AssemblyScript 0.28 (`loops.ts`,
linear memory, `-O3 --noAssert`) and Dart 3.11 (`loops.dart`, `dart compile
wasm -O2`, WasmGC like utu). The harness runs them when the toolchains are
present and checks every result against Rust. Geometric mean of time relative
to Rust (lower is better):

| | V8 | JSC | wasm (gzip) |
| --- | --- | --- | --- |
| Rust | 1× | 1× | 37.7 KB (14.5 KB) |
| **utu -Oz** | **1.51×** | **2.19×** | **6.2 KB (2.6 KB)** |
| AssemblyScript | 6.77× | 8.06× | 16.9 KB (6.2 KB) |
| Dart | 11.15× | 12.18× | 49.1 KB (19.2 KB) + 12.8 KB JS loader |

(29 kernels; the 4,096-key grouping kernels use each language's idiomatic hash
map: Rust `HashMap`/`HashSet`, AssemblyScript `Map`/`Set`, Dart `Map`/`Set`.)

Where they differ most (V8, ns/element; Rust · utu · AssemblyScript · Dart):

- Plain `while` sum with a cached length: 0.41 · 0.83 · 1.65 · 1.29. The same
  loop re-reading `xs.length` costs AssemblyScript 7.0 (it reloads the array
  header every iteration).
- `map filter fold`: 0.54 · 0.91 · 9.1 · 30.7. Closures/iterables are calls in
  AssemblyScript and Dart; utu fuses the stages into one loop.
- `collect` (map): 0.35 · 1.38 · 2.3 · 42.0.
- `sort`: 11.7 · 10.5 · 88 · 244 (utu radix-sorts plain integers; Dart's sort is unstable).
- `flat_map` to a two-element literal: 0.51 · 0.88 · 32 · 58.
- `F64` dot product: 1.25 · 1.23 · 11.7 · 1.81.

Swift was not measured: Apple's toolchain cannot target wasm, and a Swift wasm
SDK requires a matching swift.org toolchain. Gleam has no wasm target.

## Second pass (closing the largest gaps)

| kernel | before | after (V8 / JSC, ns per element) | how |
| --- | --- | --- | --- |
| `sort` (I32) | 75 / 77 | **10.5 / 11.9** — Rust 11.7 / 11.3 | LSD radix sort, two 16-bit passes, for bare `I32`/`U32` with `<` or `>` (stability is unobservable for plain scalars); others keep the stable merge sort |
| `flat_map` → `[a, b]` | 3.1 / 4.4 | **0.88 / 1.27** | elements of a literal (≤ 4) go downstream directly; no array per element |
| `collect` | 1.77 / 2.30 | **1.38 / 2.25** | bounded buffers of zero-initializable types allocate before the loop; no per-element capacity check |
| `bisect` | 62 / 55 | **43 / 35** | branchless search (select on a halving size, like Rust's `partition_point`) |
| `reduce` (scalars) | 0.81 / 0.82 | 0.80 / 0.82 (-O3 0.72) | accumulates in a local with a flag; the `Found` wrapper is allocated once at the end |
| -O3 unrolling | | JSC: `zip` 1.08 → 0.84, `map filter fold` 1.03 → 0.84 | bodies up to 64 IR nodes unroll unless they allocate or branch through `promote`/`match` |

It also fixed a miscompile found by the `bisect` benchmark: a compound
assignment nested inside another one's value (`h += { …; i += 1; … }`) lost
its operator.

## Third pass

| kernel | before | after (V8 / JSC, ns per element) | Rust | how |
| --- | --- | --- | --- | --- |
| `while` sum, -O3 | 0.83 / 0.88 | **0.59 / 0.49** | 0.41 / 0.18 | counted `while (i < n) { …; i += 1; }` unrolls like `for`; the counter keeps its exact final value |
| `distinct_by`, 64 keys | 29.7 | **4.3 / 4.6** | 15.4 (linear) | integer keys hash (open addressing, linear probing) |
| `distinct_by`, 4,096 keys | — | **6.6 / 6.5** | 10.7 / 11.4 (`HashSet`) | |
| `group_by`, 4,096 keys | — | 18.4 / 17.1 | 16.0 / 16.4 (`HashMap`) | |
| `(xs map … collect) filter … sum` | 4.99 | **0.90 / 0.92** | 0.76 / 0.65 | side-effect-free collects feeding a pipeline are fused away; `filter → sum` adds a select instead of branching |
| F64 dot product, `fast_sum` | 1.24 / 1.26 | 0.95 / 0.82 | 1.25 / 1.23 | opt-in: four rotating sums (floats may round differently) |

Rejected after measuring: copying the JSON parser's string into a character
array before parsing was slower on both engines (V8 13.4 → 20.1 ms, JSC
28.8 → 40.7 ms); string reads were not the bottleneck.

## What changed in codegen

- **Counted loops are minimal**: a plain loop compiles to one compare, one
  `array.get`, the body, and one increment. The remaining gap to Rust is the
  engine's bounds check plus LLVM's unrolling.
- **-O3 unrolls small counted loops four ways** (bodies up to 40 IR nodes,
  no nested loops): 1.4× (V8) and 1.8× (JSC) faster for reductions. A wider
  limit slowed `batched` and `min_by` on V8 and grew output ~50%, so it stays
  small. -Oz never unrolls.
- **Pipelines that cannot stop early are counted `for` loops**, with no stop
  flag in the condition, so the unroller applies to them.
- **Leading `skip`/`take` and a first-stage `zip` become loop bounds** instead
  of per-element counters and guards.
- **Position counters are only emitted when read** (index bindings,
  `take`/`skip`/`zip`, `first_index`…).
- **Buffers allocate once** when every stage preserves or shrinks length
  (`map`, `filter`, `take`, `scan`, `zip`…), sized to the source range; otherwise
  they double with a single `array.copy` (`Array.copy_from`). Results are only
  trimmed when the buffer is not exactly full. `collect` went from 11× to 5×
  Rust, `scan` from 3.7× to 1.8×.
- **`sort` is a stable merge sort**: insertion-sorted runs of 24, bottom-up
  merges, already-ordered neighbours copied in bulk, remainders copied in bulk.
  A select-based branchless merge measured slower on both engines (it
  serializes on the comparison), so the merge branches. Compared with Rust's
  stable `sort` (driftsort) it is 6.5–7×; WasmGC arrays themselves are the
  bottleneck here (the same algorithm over a JS `Int32Array` runs 2× faster on
  JSC).
- **`batched`/`windows` slice the source directly** when nothing runs upstream,
  and preallocate the exact number of groups: 8.8× → 1.4× on V8.
- **`bisect` halves with `>>>`** instead of a signed division: 3.0× → 2.1×.
- **`slice` of scalar/nullable arrays uses `array.new_default`**, so the copy
  writes each element once.

## Known gaps

- `flat_map` bodies that build a small array allocate it per element; Rust's
  arrays are values. Engines do not escape-analyze these.
- `while` loops unroll at -O3 only in the counted shape
  `while (i < n) { …; i += 1; }`; other shapes run as written.
- Plain loops stay about 1.4× (V8) to 2.7× (JSC) Rust at -O3: every WasmGC
  `array.get` is bounds-checked, and WasmGC has no SIMD loads. Closing that
  needs engine bounds-check elimination or linear-memory arrays.
