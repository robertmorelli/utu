# Syntax-level iterators

Iterators are compiler syntax over native `Array[T]`. They do not construct
iterator objects, closures, or a runtime operator library. A contiguous pipeline
is consumed immediately by a terminal operation.

```utu
export main() I32 {
    [1, 2, 3, 4, 5]
        map |n| { n * 2; }
        filter |n| { n > 4; }
        fold (0) |total, n| { total + n; };
}
```

Utu blocks retain their usual semicolons. Auxiliary values go in parentheses:
`fold (initial)`, `take (count)`, `zip (other)`. This separates parameters from
capture bars and ordinary bitwise-or expressions without grammar conflicts.
Pipeline precedence is below arithmetic and above assignment. Parenthesize a
consumed result before starting another pipeline.

## Transformations

| Stage | Meaning |
| --- | --- |
| `map \|value, index\| { expression; }` | Transform each value |
| `filter \|value, index\| { predicate; }` | Keep matching values |
| `flat_map \|value, index\| { array; }` | Flatten returned arrays in order |
| `skip(n)` / `take(n)` | Skip/take values; nonpositive counts skip none/take none |
| `skip_while \|value\| { predicate; }` | Skip the initial matching prefix |
| `take_while \|value\| { predicate; }` | End at the first failed predicate |
| `zip(other) \|left, right, index\| { expression; }` | Transform pairs, stopping at the shorter input |
| `chain(other)` | Append another array after the preceding stages finish |
| `repeat(n)` | Repeat **each value** n times; nonpositive n emits nothing |

An optional final capture is the zero-based **U64 index entering that stage**.
For example, indexes after a filter are consecutive indexes of the filtered
stream, not positions in the original array. Fold captures are `|acc, value|` or
`|acc, value, index|`; zip captures are `|left, right|` or
`|left, right, index|`. Other bodies accept one value and an optional index.

## Terminals

| Terminal | Result |
| --- | --- |
| `fold(initial) \|acc, value\| { expression; }` | Accumulator; initial value on empty input |
| `each \|value\| { statements; }` | `void`; effects run in order |
| `sum` / `product` | Element numeric type; zero/one on empty input |
| `fast_sum` | Like `sum`, with four rotating running sums so additions overlap; exact for integers, floats may round differently (about 1.3–1.5× faster for F64) |
| `count` | I32 count |
| `count_where \|value\| { predicate; }` | I32 matching count |
| `any \|value\| { predicate; }` | Short-circuit Bool; false on empty input |
| `all \|value\| { predicate; }` | Short-circuit Bool; true on empty input |
| `first_index \|value\| { predicate; }` | First matching stage index as I32, or -1 |
| `last_index \|value\| { predicate; }` | Last matching stage index as I32, or -1 |
| `collect(Type)` | A new `Array[Type]` |
| `sort(Type) \|left, right\| { left < right; }` | New stably sorted array; comparator returns Bool |

Collection types are explicit so changed element types and empty collections
remain unambiguous. References, structs, and numeric elements all work:

```utu
struct Row:
    | score: I32

fn rows() Array[Row] {
    [3, 1, 2] map |n| { Row { score: n }; }
        sort(Row) |a, b| { a.score < b.score; };
}
```

Use a typed initial variable for a nondefault fold accumulator:

```utu
let zero: U64 = 0;
let index_total = numbers fold(zero) |total, value, i| { total + i; };
```

## Evaluation and cost

The source and auxiliary arguments are evaluated once, left to right, before
traversal. Bodies are inlined, preserving normal Utu lexical scopes and effects.
`return` returns from the containing function, not from an implicit closure.
Use a block's final expression for its value. Prefer `take` / `take_while` to
`break`, which targets the nearest actual traversal loop.

Map/filter/fold and similar pipelines emit one Wasm loop with scalar locals.
Flat-map and repeat inherently add nested loops; chain adds sequential loops.
None allocate intermediate collections. A user body may of course allocate.
`take(0)` and zip with an empty second array avoid evaluating upstream bodies.
Cancellation respects chain boundaries: `xs take(1) chain(ys) sum` includes all
of `ys`; `xs chain(ys) take(1) sum` consumes only one value in total.

Collect allocates its result once, sized to the source, when every stage keeps
or shrinks the length (`map`, `filter`, `take`, `skip`, `scan`, `zip`, …), and
trims it only if fewer values arrived. Otherwise it grows geometrically with a
bulk `array.copy`. Sort is a **stable** merge sort over that collected result:
insertion-sorted runs, then bottom-up merges through one second buffer of the
same length. It is O(n log n) and never recurses. Equal keys keep their input
order. The original array is never modified by collect or sort. Empty struct
arrays require no dummy objects. Pure reductions ship no JS iterator runtime and
make no indirect calls for their bodies.

Integer `group_by`/`distinct_by` keys use an open-addressing hash table (O(n));
other key types use the linear table described below. `sort` of a bare `I32`
or `U32` with `<` or `>` is a radix sort. A side-effect-free
`(xs … collect(T)) …` never builds the intermediate array: the two pipelines
compile as one. `filter` followed by `sum` adds a select instead of branching.

Leading `skip`/`take` stages and a first-stage `zip` narrow the source loop's
bounds instead of counting elements. Pipelines that cannot stop early compile
to counted loops, which `-O3` unrolls four ways when the body is small.
Measurements against Rust are in `benchmarks/loops/README.md`.

An unfinished `map`/`filter` pipeline is an error. Bind a collected array to
reuse results; iterator pipelines are not lazy values that escape their scope.
These operators are synchronous. Promises and push streams are separate from
this feature.

## Additional operators

```utu
let totals = [1, 2, 3] scan(0) |acc, value| {
    acc + value;
} collect(I32); // [1, 3, 6]

let groups = [1, 2, 3, 4] group_by(I32, I32) |value| {
    value % 2;
};
// Array[Group[I32, I32]]: key 1 -> [1, 3], then key 0 -> [2, 4].

let first = [4, 2, 3] first_where(I32) |value| {
    value < 4;
};
let value = (first orelse fatal).value;
```

| Operator | Result and empty-input behavior |
| --- | --- |
| `scan(initial) \|acc, value, index\| { ... }` | Fused stage emitting each updated accumulator, excluding the seed; emits nothing for empty input |
| `distinct_by(T, K) \|value, index\| { key; }` | Terminal `Array[T]`; first occurrence of each key, in input order |
| `group_by(T, K) \|value, index\| { key; }` | Terminal `Array[Group[K,T]]`; each group has `.key` and `.values`; groups and members preserve encounter order |
| `partition(T) \|value, index\| { predicate; }` | Terminal `Array[Array[T]]` of length two: matches at `[0]`, nonmatches at `[1]`; both preserve order |
| `batched(T, n)` | Terminal `Array[Array[T]]`, non-overlapping batches including a final short batch |
| `windows(T, n)` | Terminal `Array[Array[T]]`, overlapping full windows with stride one; empty when fewer than n values |
| `min_by(T) \|a, b\| { a.key < b.key; }` | Terminal `?Found[T]`, minimum by strict less-than comparator; first equal item wins |
| `max_by(T) \|a, b\| { a.key < b.key; }` | Terminal `?Found[T]`, maximum using the **same** less-than comparator; first equal item wins |
| `first_where(T) \|value, index\| { predicate; }` | Terminal `?Found[T]`, short-circuits on the first match |
| `reduce(T) \|acc, value, index\| { ... }` | Terminal `?Found[T]`, seed is first element; body runs n−1 times and first body index is 1 |

The optional index is U64, except min/max comparators have exactly two bindings.
`Found[T]` is a nullable wrapper with `.value`, so missing scalar values are
representable without a sentinel. Unwrap using `promote` or `orelse`; do not
compare a scalar to `null`. Empty reductions and missing matches return null.
A present result allocates one wrapper, updated in place while reducing.

`scan` fuses with following stages. The other additions above are consuming
terminals. Parenthesize their result or assign it to a variable before another
pipeline. For example, `(items batched(Item, 20)) each |batch| { ... };`.

Distinct/group key bodies run exactly once per input. Integer keys (I32, U32,
I64, U64) use an open-addressing hash table: expected O(n). Other key types use
native equality and a linear key table: O(n·g) comparisons for g distinct keys,
O(n²) worst case. Key and member buffers grow geometrically. Key equality
follows its Utu type (including float NaN behavior); a suitable `==`/`!=` must
exist. Partition is O(n).

Batch/window operators materialize their input and return independent copied
arrays. Batching uses O(n) output elements; windows use O((n−w+1)·w) output elements.
Both reject zero/negative widths with a runtime trap. Use these operations when
owned arrays are useful, not as allocation-free views. User bodies retain the
same evaluation and cancellation rules as other pipelines.

## Binary partition search (`bisect`)

```utu
let lower = [1, 2, 2, 4] bisect |value| {
    value < 2;
}; // 1
let upper = [1, 2, 2, 4] bisect |value| {
    value <= 2;
}; // 3
```

`bisect` searches a **materialized array**, returning the first position where a
monotone true-prefix predicate becomes false. It returns zero for an empty array
and length when all values satisfy the predicate. The source evaluates once;
the body executes O(log n) times in binary-search order, not source order. An
optional second binding is the probed U64 array index. The predicate must be
monotone and should be free of effects that change its answer. No allocation is
introduced by bisect. Sort/collect first when coming from another pipeline;
non-materialized preceding stages are rejected rather than secretly allocating.

For repeated range/spatial queries, see [native query indexes](queries.md).
