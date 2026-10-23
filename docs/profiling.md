# Profiling

`utu run --profile` samples a program while it runs and writes where its
time went:

```
utu run examples/float.utu -O fast --profile
utu run app.utu --profile --interval 0.1 -o prof/
```

It prints the ten functions with the most self time to stderr, and writes
three files (in `-o dir`, else here): `NAME.folded` (`main;spin;fib 812`,
for flamegraph.pl and others), `NAME.speedscope.json` (open it at
speedscope.app), and `NAME.flame.html`, a flame graph that needs nothing
else (click to zoom, type to highlight). The last line it prints is that
page's path.

## How

A profile build (selfhost/profile.utu) keeps a shadow stack of the utu
functions running, in a shared memory the module exports (`utu_profile`):
each function's body pushes its id on entry, and its pop is an implicit
`defer`, so returns, `try`, breaks, and JS exceptions all pop it. Bodies are
instrumented before inlining, so `-O fast` shows the source's stack, an
inlined helper still a frame. A generator's expansion is a frame of its
own, left while the consumer's body runs at a `yield`. Names are as the
source says them, a module's instance first (`Stack[I32].push`, `closure in
main`), with their file and line.

The program never stops. A worker thread spins on `performance.now()` and,
every 0.25 ms (`--interval`), copies the stack out. Each frame holds the
count of pushes when it was pushed; a frame pushed after the sampler read
the count was rewritten under it, and the sample is read again (or, rarely,
dropped). A sample with nothing on the stack is `(idle)`: waiting on a
promise, a timer, or JavaScript.

At an `await`, the suspended frames are set aside and the stack goes back
to where that call began; resumed, they are put back on whatever stack it
resumes on. Interleaved suspensions never stack on each other.

A normal build is unchanged: the instrumentation exists only in profile
builds.

## Limits

- Node and Bun. A browser needs `SharedArrayBuffer`, so a page served
  cross-origin isolated (`Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp`); src/runtime/profile.js
  starts its sampler there from a Blob worker, but no command sets that up yet.
- The shadow stack holds 512Ki frames; deeper recursion traps.
- Instrumentation costs: on DeltaBlue (`-O fast`, Node), about 4× the time
  of a normal build. Relative times hold; absolute ones do not.
- Code the standard library expands in place (`@ir` operators) and the
  compiler's own helpers are not frames: their time is their caller's.
