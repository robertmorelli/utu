# Native range and spatial indexes

These modules compile to WasmGC data structures. They introduce no JS query
runtime or database dependency. Importing an unused module adds no website
runtime. They complement fused iteration: build an index once and reuse it when
many queries would otherwise rescan the same data.

## Segment trees

```utu
using SegmentTree from std:SegmentTree;
using PersistentSegmentTree from std:PersistentSegmentTree;

fn add(a: I32, b: I32) I32 {
    a + b;
}

fn example() I32 {
    let sums = SegmentTree[I32].new([2, 3, 5, 7], 0, add);
    sums.set(1, 10, add);
    sums.query(1, 3, add); // 15
}
```

`SegmentTree[T].new(values, identity, combine)` copies values into an index.
`.set(index, value, combine)` changes one position. `.query(start, end, combine)`
aggregates the half-open range `[start,end)` in source order. It supports any
associative combiner with a neutral identity: sum, min/max, string concatenation,
or custom struct aggregates. Commutativity is **not** required. An empty range
returns identity. Invalid bounds trap. Build and storage are O(n); updates and
queries are O(log n). Scalar overflow retains the element type's arithmetic;
choose I64/F64 when I32 sums may overflow.

`.first_prefix(matches, combine)` finds the first element whose inclusive prefix
satisfies a monotone false-to-true predicate, in O(log n). It returns length when
none matches or the input is empty. For example, nonnegative weights plus
`matches(total) { total >= target; }` implement weighted selection. Negative
weights can break monotonicity; the module does not scan to verify this.

The combiner is passed explicitly on each operation and must stay consistent
with construction. It is a native `fun`, not a JS-backed closure. Utu currently
cannot store `fun` references in struct fields; passing it avoids a JS wrapper
and makes that limitation explicit.

`PersistentSegmentTree[T]` has the same constructor and range-query signatures.
Its `.set(index, value, combine)` **returns a new index**: the original remains
valid. Build is O(n); each version update allocates O(log n) nodes and shares
untouched branches. Queries are O(log n). It has no prefix-search method yet.
The combiner must be pure. Reference-valued T is shared; the module does not
freeze/deep-copy mutable user objects or prevent direct mutation of public
implementation fields.

```utu
fn versions() I32 {
    let before = PersistentSegmentTree[I32].new([2, 3, 5], 0, add);
    let after = before.set(1, 10, add);
    before.query(0, 3, add) * 100 + after.query(0, 3, add); // 10, 17: 1017
}
```

## Priority search tree and geometric queries

```utu
using Spatial from std:Spatial;

fn lookups() void {
    let points = [
        Spatial.point(0.0, 0.0, 10),
        Spatial.point(1.0, 2.0, 20),
        Spatial.point(3.0, 1.0, 30)
    ];
    let index = Spatial.new(points);
    let ids = index.below(0.0, 3.0, 2.0); // x interval, y ceiling
    let nearby = index.radius(0.0, 0.0, 2.5);
    let closest = index.nearest(2.9, 1.0); // ?Found[I32]
}
```

This is a static, balanced-by-x priority search tree with minimum-y nodes and
subtree bounding boxes. Build copies point coordinates/IDs, sorts by x, and
recursively partitions; subsequent changes to the input points do not change the
index. Construction is O(n log n), with O(n log n) total transient array
allocation and O(n) final storage. Rebuild to change points.

| Method | Result and boundaries |
| --- | --- |
| `.below(minX, maxX, ceiling)` | IDs in inclusive x interval with y ≤ ceiling; the PST three-sided reporting query |
| `.within(minX, maxX, minY, maxY)` | IDs in an inclusive rectangle |
| `.radius(x, y, radius)` | IDs at Euclidean distance ≤ radius |
| `.nearest(x, y)` | `?Found[I32]`; null for no points, ties choose the lowest ID |

All returned lists own their array storage, preserve duplicate points/IDs, and
have unspecified traversal order. Sort explicitly if order matters. Coordinates,
query coordinates, and radius must be finite and have absolute value ≤ 1e150;
this keeps squared-distance arithmetic finite. Reversed bounds and negative
radius trap. Floating-point boundary comparisons use F64 with no tolerance.
Coordinates are planar, not geographic latitude/longitude distance calculations.

Three-sided reporting targets O(log n + k) traversal for k output points using
balanced x partitions and y-priority pruning. Rectangle/radius/nearest queries
prune bounding boxes but retain O(n) worst-case time; this is not an R-tree or a
promise of logarithmic nearest-neighbor queries. Result storage is O(k).

`std:Buffer[T]` is the native growable buffer used for reporting. `new`, `push`,
and `finish` support non-defaultable structs as well as scalars; `finish` returns
an exact-length copy. Growth doubles capacity; append is amortized O(1).

Runnable examples: [iterators](../examples/queries/iterators.utu),
[indexes](../examples/queries/indexes.utu). Run `node scripts/test-query-features.mjs`
for edge cases plus deterministic brute-force comparisons of 320 spatial and
720 mutable/persistent range queries.
