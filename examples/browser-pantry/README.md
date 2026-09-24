# Pantry

An inventory dashboard written in UTU against the browser's declarations. It
exists to find friction: it is written the way a TypeScript developer would
write it, and every place UTU pushed back was fixed in the compiler rather than
worked around in the app.

It covers `fetch` and JSON, `Intl.NumberFormat`, a debounced search with a
mutable captured timer, URL state through `history.replaceState`, filter chips,
sorting with a comparator, favorites persisted in `localStorage` through a
`Set`, a `/` keyboard shortcut, a canvas bar chart, a `requestAnimationFrame`
count-up, event delegation with `closest()` and `dataset`, and a validated form
read through `FormData`.

```sh
node scripts/test-browser-pantry.mjs
```

The test builds the app, serves it with `items.json`, and drives every feature
in Chromium. Wasm and generated JS together are about 5 KB gzipped.

## Friction this app found

| Written as | Problem | Fix |
|---|---|---|
| `let step = cl(now: F64) void { … requestAnimationFrame(step); }` | a closure could not name itself | recursive `let` closures (a shared cell, filled after creation) |
| `let input: ?Browser.HTMLInputElement = document.querySelector("#search")` | `querySelector<E>` only mentions E in its result | E is inferred from the expected type, within its constraint |
| `document.getElementById("items") orelse fatal` | `fatal` was typed `void` | `fatal` is the bottom type and fits any context |
| `other == chip` | host references had no `==` | `==` and `!=` on host values are JS `===` |
| `Browser.Array.from(favorites)` | a `Set` was not an `Iterable` | declared interfaces are structural, as in TypeScript |
| `["All", "Produce"].forEach(cl(name) …)` | a literal-only array was a native array | a literal used through JS array members is a JS array of its element type |
| `a.price - b.price`, `sum + item.price * item.quantity` | arithmetic on two JSON values | dynamic operands are numeric, or take `+`'s context; checked at the boundary |
| `row.dataset.id = item.id` | a dynamic value into a `string \| undefined` slot | dynamic values meet a union through its primitive member |
| `16 + i.to_f64() * 40` | the literal kept I32 | literal operands adopt their sibling's numeric type |
| `ids.length.to_i32()` on parsed JSON | a UTU method on a JS value | the receiver is read as the primitive that has the method |
| `promote search { \|input\| => … cl(event) { input.value } }` | closures captured a promote binding with the wrong type | captures use the binding's type |
| `for (…) { saved.add(id); }` | loop bodies ending in a value emitted invalid Wasm | loop bodies discard their value |
| `map.get("k")` on a `Map<any, any>` | `any \| undefined` was nullable | `any` absorbs unions, as in TypeScript |
