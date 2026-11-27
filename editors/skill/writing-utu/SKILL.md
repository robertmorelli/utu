---
name: writing-utu
description: Load before writing or reviewing any .utu code (programs, std, Wutu sites, tests). Teaches idiomatic utu, not JS-shaped utu, and how to check it with the CLI.
---

# Writing idiomatic utu

Authority: what `bun cli/utu.mjs check FILE` accepts > `docs/language/*.md` > `selfhost/*.utu` > `std/*.utu` > `examples/`. Check every snippet you write.

## File shape

```utu
using console from std:console

struct Point:
    | x: F64
    | y: F64

enum Shape:
    | Circle { r: F64 }
    | Rect { w: F64, h: F64 }
    | Dot

fn Point.len |p| () F64 => F64.sqrt(p.x * p.x + p.y * p.y)

fn area(s: Shape) F64 => alt s {
    Circle |c| => F64.pi() * c.r * c.r,
    Rect |r| => r.w * r.h,
    ~> 0.0,
}

main {
    let p = Point { x: 3.0, y: 4.0 }
    console.log(p.len())
    let shapes = [Circle { r: 1.0 }, Rect { w: 2.0, h: 3.0 }, Dot]
    console.log(shapes map |s| { area(s) } sum)
}
```

- Statements end at a line break; `;` only joins two on one line.
- `fn f(…) T => expr` for one-expression bodies; braced bodies need `return`.
- Methods: `fn T.m |self| (args) R`. A fieldless variant is a value by its bare name: `Dot` (or `Shape.Dot`; a name two enums have needs its enum unless one is expected).
- `main { }` returns nothing (print with `console.log`). Functions JS calls go in `lib { fn … }`. One entry file has one of `main`, `lib`, `html`.
- Tests sit beside code:

```utu
fn clamp(x: I32, lo: I32, hi: I32) I32 => if x < lo { lo } else if x > hi { hi } else { x }

lib {
    fn score(a: I32, b: I32) I32 => clamp(a * b, 0, 100)
}

test "clamps" {
    assert score(20, 20) == 100
    assert score(-1, 3) == 0
}
```

### Protocols and mods

```utu
using console from std:console

proto Named:
    | name() Str

struct Cat[Named]:
    | lives: I32

struct Dog[Named]:
    | good: Bool

fn Named[Cat].name |c| () Str => `cat with ${c.lives} lives`
fn Named[Dog].name |d| () Str => if d.good { "good dog" } else { "dog" }

mod geo {
    let unit: F64 = 1.0
    fn double(x: F64) F64 => x * 2.0
}

main {
    let pets: Array[Named] = [Cat { lives: 9 }, Dog { good: true }]
    for (pets) |p| console.log(p.name())
    console.log(geo.double(geo.unit))
}
```

- A struct lists its protocols (`struct Cat[Named]:`); `Array[Named]` then dispatches.
- Generic types are mods: `mod Stack[T] { struct &: … fn &.push |s| (v: T) Void … }` (see docs/language/generics.md). A mod promoting a type is Capitalized, one promoting a function (`fn &(…)`) lowercase.
- One-statement loop bodies drop braces: `for (pets) |p| console.log(p.name())`.

## Idioms (JS-shaped → utu)

### Tagged data: enums + `alt`/`match`, not string kinds

JS-shaped: `{ kind: "num", value }` and `if (t.kind === "num")`.

```utu
using console from std:console

enum Token:
    | Num { value: I64 }
    | Word { text: Str }
    | End

enum(U8) Dir:
    | North
    | East
    | South
    | West

fn describe(t: Token) Str => alt t {
    Num |n| => `number ${n.value}`,
    Word |w| => `word ${w.text}`,
    ~> "end",
}

fn turn(d: Dir) Dir => Dir((d.i32() + 1) % Dir.count())

fn digit_name(n: I32) Str => match n {
    0 => "zero",
    1 => "one",
    2, 3 => "a few",
    ~> "many",
}

main {
    console.log(describe(Num { value: 42 }))
    console.log(describe(Token.End))
    console.log(Dir.name(turn(Dir.West)))
    console.log(digit_name(1))
}
```

- `alt` is for enums with data; `match` for numbers, Bool, integer enums (not strings). Default arm is `~>`, never `_ =>`. One arm for several: `A, B => e` (commas, not `|`; such an arm binds nothing).
- `enum(U8)` gives small integer enums: `d.i32()`, `Dir(n)`, `Dir.count()`, `Dir.name(d)`.

### Nullables: `promote` / `orelse`, not `if (x != null)`

```utu
using console from std:console

struct User:
    | name: Str
    | email: ?Str

fn find(users: Array[User], name: Str) ?User {
    for (users) |u| { if u.name == name { return u } }
    return null
}

fn contact(u: User) Str => promote u.email {
    |e| => e,
    ~> "(no email)",
}

main {
    let users = [User { name: "ada", email: "ada@x.org" }, User { name: "bob", email: null }]
    let bob = find(users, "bob") orelse fatal
    console.log(contact(bob))
    console.log((find(users, "eve") orelse bob).name)
}
```

- `x orelse fatal` when absence is a bug; `orelse default` otherwise; `promote` to branch.
- `a?.b` is statement-only: as a value it errors ("?. only in a statement"; use `promote`).
- Expected failures return `Result[T, E]` and propagate with `try` (docs/language/errors.md). Bugs `fatal`/`assert`.

### Pipelines, generators, generics, maps, buffers

```utu
using console from std:console
using StrMap from std:StrMap
using Buffer from std:Buffer

gn evens(n: I32) I32 {
    for (0 ..< n) |i| { if i % 2 == 0 { yield i } }
}

fn largest(a: $T, b: T) T => if a > b { a } else { b }

main {
    let xs = [3, 1, 4, 1, 5, 9]
    let big = xs filter |x| { x > 2 } map |x| { x * 10 } collect(I32)
    console.log(big)
    console.log(xs fold (0) |acc, x| { acc + x })
    console.log(xs sort(I32) |a, b| { a < b })
    for (evens(7)) |e| console.log(e)
    console.log(largest(2.5, 1.0))

    let counts = StrMap[I32].new()
    for ("a b a c a".split(" ")) |w| counts.set(w, counts.get(w, 0) + 1)
    console.log(counts.get("a", 0))

    let buf = Buffer[Str].new()
    for (0 ..< 3) |i| buf.push(`item ${i}`)
    let items = buf.finish()
    console.log(", ".join(items))

    let total: F64 = 0.0
    for (xs) |x| { total += x.f64() / 2.0 }
    console.log(total)
    let _ = counts.remove("b")

    let n = 5
    let add_n: cl(I32) I32 = cl(x) { return x + n }
    console.log(add_n(1))
}
```

- Pipelines (`map filter take skip zip flat_map scan` → `fold sum count any all each collect(T) sort(T) group_by first_where …`, docs/language/iterators.md) compile to one loop, no closures, no intermediate arrays. Prefer them to index loops that push.
- `collect(T)` / `sort(T)` name the element type. A pipeline must end in a terminal; parenthesize before piping again.
- Loops: `for (xs) |x|`, `for (0 ..< n) |i|` (exclusive), `0 ... n` (inclusive), `for (xs, 0 ..< n) |x, i|`. Loop captures are read-only.
- `gn g(…) T { yield … }` generators are expanded inline at the `for`; they are not values.
- `$T` makes a generic function, monomorphized per call.
- `Array[T]` is fixed-length (no `.push`). Build with a pipeline + `collect`, a literal, `Array[T].new(n, fill)`, or `Buffer[T]` (`push`, then `finish()`). In Wutu state, `std:List` `append`/`remove_at` return copies.
- `StrMap[V]`: `new`, `set`, `get(key, missing)`, `has`, `remove`, `len`, `keys`.
- Strings: template strings `` `x=${x}` `` (calls `x.str()`), `sep.join(parts)`, `s.split(sep)`, `index_of(part, from)`, `slice`, `trim`, `parse_i32(fallback)`, `parse_f64()`.
- A statement drops its value (`p.then(…)`, `m.remove(k)`); `let _ = e` also works.
- A pipeline's index (`each |x, i|`) is U64: compare with `i.i32()`. A range counter has its ends' type.
- Searching: `for (xs) |x| { if … { return x } }` then `return null`, not a `found` variable set in a loop. Conditional list parts: build each, then `chain`.
- `sort`, `distinct_by`, `first_where`, `min_by` end a pipeline: bind or parenthesize before continuing.
- Return `?T`, not `""` or `-1`, when "nothing" is a real answer. A state with a few values is an enum, never a `Str`; behaviour goes on it as methods (`fn Page.path |p| () Str`). An enum that crosses JSON or the DOM spells its variants as the wire does, so `@json` and `E.name(v)` need no code.
- Closures: `cl(…) R` is a JS function (crosses the host boundary per call; for callbacks/DOM). `fun(…) R` is a wasm function pointer from a named fn (no literal form). A `fun` decays to `cl`, never the reverse. Hot paths use pipelines, not closures.

## Types and numbers

- Conversions by type name: `x.f64()`, `x.i32()`, `x.str()`, `F64(…)`, `Tag(n)`. `to_X` is gone (`x.to_f64()` → "No method I32.to_f64; did you mean f64?").
- Untyped int literals try I32 → U32 → I64 → U64. Untyped float literals are F32 when the F32 and F64 readings agree, else F64. So `let total = 0.0` is **F32**; write `let total: F64 = 0.0` when F64 is meant (else "total is F32, got F64").
- Arithmetic is Wasm's: `+ - *` wrap; divide by zero and `I32.MIN / -1` trap; float→int conversions saturate. Not bugs.
- Only reference types (structs, enums, Str, Array, host refs) are usefully `?T`; scalars are never null. Pipeline lookups (`first_where`, `min_by`) return `?Found[T]` with `.value`.
- `Void` (not `void`). Prelude aliases: `S B U I F` = `Str Bool U64 I64 F64`, `V` = Void, `C` = Component.
- Logic: `and or not xor`, not `&& || !`. `else if`, not `elif`. `let`, not `const`, in a function.

## Host interop

- `@es/\ js \/` binds JS: `let host_log: fun(Str) Void = @es/\ (s) => console.log(s) \/` (std/console.utu).
- Typed browser/JS APIs: `using Browser from std:Browser`, `using JS from std:JS` (docs/language/typescript-abi.md).
- `Promise[T]` is a real JS promise: `await p` in any `fn` or closure (needs JSPI: Bun, Node 23+, Chrome 126+); a closure the host calls that awaits is an async JS function. `.then(cl(v) { … })` everywhere. No `async` keyword.
- Data crossing to JS as structure: `@json/\ encode T v \/`, `@json/\ decode T text \/` (gives `?T`) (docs/language/json.md). A native `Array[T]` is opaque to JS.

## Wutu (sites)

Full reference: docs/language/wutu.md. Examples: examples/wutu-five, examples/wutu-reactive.

- Page: top-level `html { head { … } body { … } }`, reactive by default; an optional `@document { … }` CSS block goes first.
- Components: `wn name(params) { template }`, or a struct listing `Component`/`C` with `wn C[T].render |t| () { … }`. Insert with `| value` or `|> expr`.
- Elements `tag.class#id { … }`; inside, `prop: value` is CSS, `name = "v"` an attribute, `.prop = e` a DOM property, `"text"` text.
- Events `on click { … }` or `on click |e| { … }`; bindings `bind:value = s.text` (`checked number group values files`).
- Children: `if c { … } else { … }`, `for items |item| key item.id { … }`.
- In `@reactive` views mutate state, not managed nodes; handlers re-render automatically, and a handler that awaits re-renders again when it settles. Callbacks outside a handler (timers, a `.then`) call `wutu.refresh()`.
- `@wutu/\ … \/` is the template as an expression; `@style sheet()` installs a `@css` sheet.
- A template is a `wn`; its `let`s go at the top of its body. Use `fn … Externref { …; return @wutu/\ … \/ }` only when it needs other statements first, and `fn … ?Externref` for a part that may be absent. Repeated markup is a `wn`, not copies.
- An attribute takes a `Str` (`data-kind = kind.str()`); a `match` works in an attribute value or a hole. Don't name a `wn` parameter `on`.
- A checkbox or radio reports with `on change`, not `on click`. `bind:value` binds only a `Str`; a select of an enum renders options from the enum and parses its value `on change`.
- In a Wutu template `for (xs filter |x| { … }) |x|` works; outside it, write `xs filter … each |x| { … }` ("Unfinished pipeline").
- Sheets: `wn sheet() { @document { … } }`, rendered from the root. A site build minifies all `@document` CSS into `app.HASH.css`, in module order (a module after its imports), so don't rely on order across modules of the same specificity; use `@layer`. A declaration ends at its line's end; a value continues only when the line ends in `,`. Never close two blocks on one line (`} }`). Element-local `prop: value` is for per-element computed values; static CSS goes in the sheet.

### Markup and CSS rules

Apply by default for all Wutu UI output unless the user explicitly asks for legacy behavior. Primary objective: minimize DOM depth and element count while preserving semantics and accessibility.

- Every element carries content or is interactive: no wrapper `div`s. Lay out with grid/subgrid on the content elements themselves (the `li` is the grid, the `button` is the card). Decoration is `::before`/`::after`, counters and backgrounds.
- No `top/right/bottom/left` nudging when a layout primitive can do it. No `position: relative` or `position: absolute`, in any case (overlays, popovers, fallbacks included).
- Top-down and contained: grid. Top-down and out of flow (floating UI): anchor positioning with `position: fixed`. Bottom-up and contained: flexbox. Overlap (badges, markers, stacked layers) and known-aspect-ratio compositions: grid.
- Size and container queries are a last resort.
- Semantic elements (`main section article nav button` …). `background` images for decoration; `img` only for content.
- `rem` for sizing; `px` only for borders and hairlines. `clamp()` for fluid type and spacing over breakpoint steps. Logical properties (`margin-inline`, `padding-block`).
- `gap` over margins. On one layout boundary use margin or padding, not both, unless there is a strong, explicit reason.
- z-index scale `0, 1, 10, 100` only.
- Tokens as CSS variables for spacing, radius, color and type; no color literals in component rules. Author colors in `oklch()`/`oklab()`; derive them with `color-mix(in oklab, …)`.
- Animate `transform` and `opacity`, never `width height top left margin`. `will-change` only while animating. `contain`/`content-visibility` deliberately on large regions. No heavy `filter`, `backdrop-filter` or large blur shadows unless required.
- No `!important`, except documented utility escape hatches.
- Prefer cutting-edge CSS. Target Chrome and Safari only unless asked for more.
- Features worth reaching for. Support was checked in Chrome 151 and Safari 26.5 (Playwright WebKit); re-check after browser updates.
  - Use these (in both browsers):
    - Anchor positioning (`anchor-name`, `position-anchor`, `position-area`, `anchor()`, `position-try-fallbacks`, `@position-try`).
    - Scroll-driven animations (`animation-timeline: scroll()` / `view()`) instead of scroll listeners.
    - Cross-document view transitions (`@view-transition { navigation: auto }`).
    - `text-wrap: pretty` for body text (`balance` for headings).
    - The inline `if()` function (`padding: if(media(width > 40rem): 2rem; else: 1rem)`).
  - Not these: `initial-letter` (Safari has only the prefixed form), `interpolate-size` and `calc-size()` (Chrome only), `fit-content()` outside grid (neither).
- No vendor prefixes (`-webkit-` …) unless there is truly no other way.

## Tooling

```
bun cli/utu.mjs check FILE          # errors only
bun cli/utu.mjs FILE                # run main / preview an html page (also: run FILE)
bun cli/utu.mjs test FILE           # run test blocks
bun cli/utu.mjs bench FILE          # time bench blocks
bun cli/utu.mjs build FILE -o dir   # NAME.wasm + NAME.mjs, or a prerendered site
bun cli/utu.mjs format FILES [--check]
```

- `-O small` (default), `-O fast`, `-O debug`, `-O smallUnsafe`, `-O fastUnsafe`.
- `build --blame` writes NAME.blame.json/html: each wasm byte on its source.
- `wat FILE` prints the generated wasm text; `grep '$v.push($x)' paths` searches by syntax and type.
- In this repo, compiler builds are `bun run build`, tests `bun run test`.

## Common mistakes

| Wrong | Right | Compiler says |
| --- | --- | --- |
| `fn f() void` | `fn f() Void` | Write Void, not void |
| `x.to_f64()` | `x.f64()` | No method I32.to_f64; did you mean f64? |
| `let t = 0.0` then F64 math | `let t: F64 = 0.0` | t is F32, got F64 |
| `xs.push(1)` on `Array[I32]` | pipeline + `collect`, or `Buffer[T]` | No method Array[I32].push |
| `a?.b orelse d` as a value | `promote a { \|x\| => x.b, ~> d }` | ?. only in a statement |
| `let x = 1;` | `let x = 1` | accepted, but not idiomatic: no `;` at line ends |
| `if (x != null)` on a scalar | `?Found[T]` + `promote`/`orelse` | scalars are never null |
| index loop that pushes | `xs filter … map … collect(T)` | (unidiomatic, slower) |
