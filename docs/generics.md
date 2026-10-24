# Generics

Modules are utu's only unit of type parameters. `mod Stack[T] { … }` is a
template: `Stack[I32]` and `Stack[Str]` are two instances, each checked and
compiled on its own, with T replaced by its argument. There are no generic
functions; a generic function is a function of a generic module
(`Order[I32].max(3, 9)`).

```utu
mod Stack[T] {
    struct &:
        | items: Array[T]
        | size: I32
    fn &.new(fill: T) & { &{ items: Array[T].new(16, fill), size: 0 }; }
    fn &.push |s| (v: T) void { s.items[s.size] = v; s.size += 1; }
    fn &.pop |s| () T { s.size -= 1; s.items[s.size]; }
}

let nums: Stack[I32] = Stack[I32].new(0);
using Stack[Str] |Words|;          // an alias for one instance
```

A global in a generic module is one per instance, as its functions are:
each instance has its own, of its own type, set by its own initializer. The
type and initializer can use T, `&`, and the module's own types and
functions. A global that uses none of them (`let limit: I32 = 64;`) is
still one per instance.

```utu
using Buffer from std:Buffer;

mod Stash[T] {
    let items: Buffer[T] = Buffer[T].new();
    fn add(x: T) void { items.push(x); }
    fn size() I32 { items.len(); }
}

Stash[I32].add(1);
Stash[Str].add("a");
Stash[I32].size();                 // 1: Stash[Str] has its own items
```

Only the instances the program names are made. Globals are set as the
program starts, each after the globals its initializer reads, across
instances too; a cycle is an error ("Globals b and a each need the other
set first", with a note naming the instance). An `@es` binding is host
code, not a value the module holds: it is not copied per instance, and
each instance imports it at its own type.

## Bounds

A type parameter can list protocols its argument must implement, the way a
struct lists the protocols it implements:

```utu
mod Sorted[T[Ord]] { … }
mod Map[K[Hash, Eq], V] { … }
```

Inside the module, a T has the protocols' methods, getters, and setters:
`a.cmp(b)`, `x.name`. Since each instance is compiled for its own T, a call
is the call of that type's implementation, chosen when the instance is
checked: no dispatch and no boxing, so a scalar can be a T as well as a
struct.

```utu
proto Ord:
    | cmp(&) I32                   // & is the implementing type

struct Version[Ord]:
    | major: I32
    | minor: I32

fn Ord[Version].cmp |a| (b: Version) I32 {
    if a.major != b.major { a.major - b.major; } else { a.minor - b.minor; };
}
fn Ord[I32].cmp |a| (b: I32) I32 { a - b; }

mod Largest[T[Ord]] {
    fn of(xs: Array[T]) T {
        let best = xs[0];
        for (xs) |x| { if x.cmp(best) > 0 { best = x; }; };
        best;
    }
}

Largest[Version].of(versions);
Largest[I32].of([3, 9, 4]);        // 9
```

A type implements a bound when it has, for each method, an implementation
`fn P[T].m` with the method's signature, and for each getter and setter, a
field of that name and type:

| T | implements P with |
|---|---|
| a struct | `fn P[T].m` (listing P, `struct T[P]:`, also lets an `Array[P]` hold it) |
| a scalar or `Str` | `fn P[I32].m` |
| an enum | `fn P[E].m` on the enum itself, an `alt` over its variants |
| every instance of a generic module | `fn P[&].m` inside the module |

In a protocol, `&` is the implementing type: `cmp(&) I32` takes another of
the same type, so `Ord[I32].cmp` takes an I32 and `Ord[Version].cmp` a
Version. Only a bounded T can call a member that uses `&`; a protocol value
(an `Array[Ord]` element) cannot, since which type `&` is is not known
there.

A protocol's own function, `fn Counter.tick |c|`, is a method of a T
bounded by Counter, as of a Counter value: `c.tick()` calls the T's own
`tick` if it has one, else Counter's (when two bounds both have one, say
which: `Counter.tick(c)`). Counter's is checked for each T, as the module
is, so a scalar, Str or enum T works too, and `c.step()` in it is T's.

A bounded parameter passes its bounds on: in `mod Ranking[T[Ord, Named]]`,
`Order[T]` is an instance whose T implements Ord.

A protocol declared in a mod is named by its path, in a bound or in a
struct's list alike: `mod Sorted[T[m.Ord]]`, `struct Tri[shapes.Area]:`.
A type declared in a mod is too, where it implements one:
`fn Area[geo.Sq].area |q| () I32 { … }`.

## What is checked

Each instantiation in your files is checked against the bounds:

```
 ERROR  Point does not implement Ord (Order's T needs it)
12 │     Order[Point].max(p, q);
   │           ━━━━━
   │           ╰─ no cmp
41 │ mod Order[T[Ord]] {
   │             ───
   │             ╰─ needs Ord
```

An unbounded T keeps working as a template: whatever its argument has, the
instance can use. But a protocol's method on a T needs the bound, and the
error says where to put it:

```
 ERROR  T has no method cmp; bound it: mod Largest[T[Ord]]
  fix   bound T by Ord
```

A bound that names anything but a protocol is an error, and so is passing
an unbounded parameter to a module that bounds it (`Order[V]` inside
`mod Ranked[V]`).

## std:Ord

`std:Ord` has `Ord` for I32, U32, I64, U64, F32, F64 (NaN ties with
everything), and Str (by UTF-16 code units, as JavaScript's `<`), and
`Order[T[Ord]]`, what a bounded module does with it:

| function | |
|---|---|
| `max(a, b)`, `min(a, b)` | the greater, the lesser (a, when they tie) |
| `clamp(x, low, high)` | x, or the nearer end |
| `sort(xs)` | in place, stable, O(n log n) |
| `is_sorted(xs)` | |
| `search(xs, x)` | where x is in sorted xs, or -1 |
| `max_of(xs)`, `min_of(xs)` | the greatest, the least (the first of a tie) |

```utu
using Ord from std:Ord;            // the protocol, to implement it
using Order from std:Ord;

fn Ord[Version].cmp |a| (b: Version) I32 { … }

let words: Array[Str] = ["pear", "fig", "apple"];
Order[Str].sort(words);            // apple fig pear
Order[Version].max_of(versions);
```

See [examples/bounds.utu](../examples/bounds.utu).
