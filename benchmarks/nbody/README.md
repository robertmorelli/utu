# N-body benchmark

The Jovian-planets n-body simulation of the Computer Language Benchmarks
Game, following Are We Fast Yet's `NBody`: the Sun, Jupiter, Saturn, Uranus,
and Neptune, the Sun's velocity offset so the total momentum is zero, a
symplectic-Euler `advance(0.01)` that updates each pair once, and the
system's `energy`. It exercises straight-line `f64` arithmetic, `sqrt`, and
field loads and stores on a handful of small mutable structs.

Every port keeps the bodies as structs (objects) of seven `f64` fields in one
array: a GC struct array in utu, a `Vec<Body>` in safe Rust (`split_at_mut`
for each pair), the same `Vec` through raw pointers in unsafe Rust, and an
array of class instances in JavaScript. The floating-point operations run in
the same order in all four, so their results agree bit for bit.

## Workload

`bench(iterations)` builds a fresh system and advances it 20,000 steps, once
per iteration, and returns the sum over iterations of the final energy in
nano-units, rounded half up (`floor(energy * 1e9 + 0.5)`, as an `i64`).
`bench(1)` returns `-169089263`; the energy is `-0.169075164` before any step
and `-0.169087605` after 1,000, the Benchmarks Game's reference values.
