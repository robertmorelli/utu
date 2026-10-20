# Richards benchmark

Richards, Martin Richards' simulation of an operating-system task scheduler,
as the [Are We Fast Yet](https://github.com/smarr/are-we-fast-yet) suite has
it (`Richards.java` / `richards.js`). It exercises pointer-chasing over small
linked lists (task control blocks and packet queues), field updates, and
dispatch over the four kinds of task: idle, worker, handler, and device.

Four ports compute the same algorithm in their own language's idiom: WasmGC
utu (nullable references, and one enum of task kinds whose variants carry each
kind's private data, as DeltaBlue's constraint kinds are modelled), safe Rust
(`Rc` tasks with `Cell`/`RefCell` state, `Rc<RefCell<_>>` packets, and an enum
of task data), unsafe Rust (typed arenas and raw pointers, with the same enum),
and JavaScript (a class per kind of task data, whose `run` method the
scheduler calls). The scheduler, the packet queues, and the order of every
operation are the same in all four; AWFY's `TaskState` objects are replaced by
passing the three initial state flags directly, in every port.

## Workload

One simulation creates six tasks and ten packets and schedules until every
task is held or waiting; the idle task counts down from 10,000. It ends with
`queuePacketCount = 23246` and `holdCount = 9297`, AWFY's expected values.
`bench(iterations)` runs `iterations * 10` simulations and returns the sum of
`queuePacketCount * 100000 + holdCount` over them, so `bench(1)` returns
23,246,092,970 in every port.
