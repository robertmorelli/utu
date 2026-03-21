= 8. Polymorphic Dispatch

Dynamic dispatch uses `br_on_cast` for type-based dispatch and
`call_indirect` / `call_ref` for function reference dispatch. There is no
vtable built into the language; dispatch is explicit.

```utu
// Type-based dispatch (br_on_cast chain)
fn describe(s: Shape) str {
    match s {
        c: Circle => "circle",
        r: Rect => "rect",
        t: Triangle => "triangle",
    }
}

// Function reference dispatch (call_ref)
type Handler = fn(Event)
let handlers: array[Handler] = array[Handler].new_fixed(on_click, on_hover, on_key)
handlers[event.kind](event)  // call_ref with array.get
```
