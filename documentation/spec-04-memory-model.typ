= 4. Memory Model

== 4.1 GC-Only Allocation

Utu uses WasmGC exclusively for all heap allocation. There is *no linear
memory*, no malloc or free, and no bundled allocator. All values are either
Wasm value-stack scalars or GC-managed heap objects such as structs, arrays,
and `i31ref`.

*Consequences:*

- The engine's generational and compacting GC manages all memory, typically
  better than what languages ship in linear memory.
- There is no use-after-free, no double-free, and no memory leaks from
  forgotten deallocations.
- Bundle sizes are minimal: just compiled logic, with no runtime overhead.
- The engine performs escape analysis and scalar replacement, so small structs
  that do not escape may never be heap-allocated.

== 4.2 Struct Allocation

```utu
// Language level
let pos: Vec2 = Vec2 { x: 1.0, y: 2.0 }

// Wasm lowering
(struct.new $Vec2 (f32.const 1.0) (f32.const 2.0))
```

== 4.3 Array Allocation

```utu
// Fixed-size, filled with default value
let buf: array[i32] = array[i32].new(1024, 0)
// -> (array.new $i32_array (i32.const 0) (i32.const 1024))

// From existing data
let data: array[f32] = array[f32].new_fixed(1.0, 2.0, 3.0)
// -> (array.new_fixed $f32_array 3 (f32.const 1.0) ...)

// Access
let val: f32 = data[0]      // -> array.get
data[0] = 42                 // -> array.set
let len: i32 = array.len(data)  // -> array.len
```
