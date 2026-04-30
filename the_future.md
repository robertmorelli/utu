# The Future of Utu

## Core direction

Utu should aim to be:

- a WasmGC-first language with direct control over representation and lowering
- a language that produces very small bundles
- a language with excellent host interop
- a language whose tooling is so strong that unusual features feel safe to use
- a language whose standard library hides most interop complexity

The real pitch is not just "WasmGC-first".

The stronger pitch is:

- much smaller bundles than Rust for many web workloads
- competitive runtime performance
- better ergonomics for host interop
- clean compilation to Wasm-oriented structures

Target:

- no more than 2x slower than Rust on compute-heavy workloads
- faster than Rust on interop-heavy workloads where JS/host crossings dominate

For browser-facing work, Utu should aim to be one of the best options short of handwritten WAT or extremely specialized code.

## Make the language less weird

Some weirdness is unavoidable because Utu sits on Wasm the way C sits on asm. The language should expose representation and control where it matters.

But unnecessary weirdness should be reduced.

### Syntax changes worth doing

- keep `&` promotion as a core feature and accept the weirdness cost

### Nominal / runtime tagging

Nominal control is real and necessary because of the Wasm representation model. New users should not have to understand the full theory immediately.

Direction:

- when a construct requires runtime identity, the compiler should say so plainly
- diagnostics should recommend the right marker instead of forcing users to guess

The goal is:

- users can mark the thing and move on
- deeper docs explain why this exists

### Modules

Modules are weird, but probably worth keeping.

They are the only mechanism of code sharing and parameterization between files. That is a strong architectural idea. The weirdness cost should be paid with:

- very good examples
- very good docs
- very good diagnostics

### DSL syntax

DSLs are a primary feature, not a side feature, because Utu is built around interop.

The syntax must be rare enough that delimiters almost never collide with DSL contents. Some exoticness is acceptable here because the feature is fundamentally raw-text-based.

The main goal is not to eliminate weirdness completely. The goal is to make DSLs feel intentional and powerful rather than arbitrary.

## Make the docs much more approachable

Docs should reduce the "what am I looking at?" effect.

### Explain the weird things early

Docs should explicitly explain:

- why `&` exists
- why nominal/runtime tagging exists
- why modules are central
- why DSLs are raw and powerful
- why Utu exposes Wasm-oriented control rather than hiding it

The framing should be:

- Utu exposes these things because they map to the platform and give the user real control
- the language is not being weird for its own sake

### Group related concepts together

The match-like forms should be documented together as one family:

- `match`
- `alt`
- `promote`

Each should be explained in this order:

1. programmer-facing purpose
2. semantic distinction
3. lowering intuition

That makes them feel like a coherent design rather than three unrelated inventions.

### Use examples aggressively

Every unusual feature should have:

- the smallest possible example
- a "when to use this" explanation
- a "what this lowers to conceptually" explanation when useful

### Show recommended defaults

If there is a sane default, the docs should say so directly.

Users should not have to infer the intended style from scattered examples.

## Tooling must be S+ tier

This is non-negotiable.

Utu can afford some unusual syntax if the tooling is exceptional.

Requirements:

- jump-to-definition must be excellent
- reference search must be excellent
- hover/type info must be excellent
- compiler behavior must be reliable across environments
- the compiler must work everywhere
- LSP backed by the same compiler the CLI uses
- incremental compilation fast enough for keystroke-latency editor feedback

The language should feel safer than its syntax first suggests.

Bench should also be leveraged as a tooling feature:

- in theory, `bench` should insert stack/function tracking
- users should get per-function profiling out of the box

That makes performance work feel built in, not bolted on.

### Formatter

A canonical formatter (`utufmt` or equivalent) should ship with the compiler.

The ecosystem should have one style. No bikeshedding, no per-project configs.

### Test framework

The language needs a first-class test story. Users should not have to invent their own.

Direction:

- a built-in `test` form that the compiler recognizes
- a runner that finds and executes tests across files
- assertion primitives in the stdlib
- works the same in browser, node, and bun

## Async/await

Utu should have first-class `async` / `await`.

This matters not because it is theoretically elegant, but because it dramatically reduces adoption friction for JS/Dart/web developers.

Direction:

- make it feel boring and expected
- lower it so the rest of the compiler does not need to care much
- avoid inventing a bespoke concurrency syntax unless it buys something major

### Async functions

Utu should have ordinary first-class async functions.

This should feel familiar to JS, Dart, and C# developers:

- async functions should be a normal part of the language
- host interop should map cleanly onto promise-like async behavior
- the compiler should lower async behavior aggressively so most of the compiler does not need to reason about it directly

### Async generators

Utu should also have first-class async generators.

This matters because a lot of modern platform work is naturally stream-shaped:

- browser and server event streams
- worker/message pipelines
- incremental parsing and processing
- storage/network streams

Utu should be able to piggyback on the async-iterator direction of the JS ecosystem while presenting it with a cleaner language surface.

### Async streams

Utu should also seriously consider first-class async streams.

JavaScript is moving in that direction already, so Utu can piggyback on a model that web developers increasingly understand.

This would help with:

- streaming platform APIs
- worker/message pipelines
- browser and server event streams
- incremental async data processing

If Utu has strong async interop, async streams are a natural extension rather than an exotic feature.

## Closures

Utu needs closures.

Without closures, a lot of ordinary JS/Dart/web-style programming feels immediately constrained. Closures are important for:

- callbacks
- functional collection operations
- async orchestration
- worker/event/message APIs
- general ergonomic expressiveness

Closures should feel like a normal part of the language, not an afterthought.

## Iterator model and `for of`

Utu should support iteration in a first-class way.

This likely means a first-class iteration protocol or operator-function story so that `for of` style loops can exist cleanly.

That matters because:

- iterators are foundational for a good stdlib
- `for of` is familiar to JS developers
- collection abstractions become much nicer
- async iteration can build naturally on the same conceptual model

The language should be able to support both:

- ordinary iteration
- async iteration

with a coherent protocol/operator story.

### First-class iterable syntax

It may be worth making iteration more than just library sugar.

If iterable things are first-class in the language rather than only stdlib conventions, the compiler has more room for:

- loop specialization
- unrolling and jamming
- fusion of iteration-heavy pipelines
- better lowering of numeric/data-oriented loops
- avoiding over-reliance on lazy iterator chains

This should still be explicit enough that users can understand what is happening. The goal is not "magic iterators". The goal is to give the compiler a stronger iteration-shaped IR than library combinators usually provide.

## Expression orientation

Utu should become more expression-oriented in key places.

Important constructs should work naturally as expressions, similar to what people expect from languages like Rust.

In particular:

- `if / else` should work as an expression
- match-like forms should work naturally as expressions

This matters because:

- it makes the language feel more compositional
- it reduces unnecessary statement ceremony
- it makes advanced control flow easier to use ergonomically

This should be treated as a meaningful language-shaping priority, not a small surface tweak.

## String interpolation

Users coming from JS, Dart, Python, or Rust expect template-literal style string interpolation.

Without it, formatting feels like a constant chore.

Direction:

- pick a syntax that does not collide with DSL delimiters or `&` promotion
- lower it cleanly to string concatenation or builder ops
- make it work uniformly with the str stdlib

## Pattern matching depth

`match` and `alt` will become real expressions, but the patterns themselves can grow over time:

- guards (`Circle |c| if c.radius > 0 => ...`)
- nested patterns inside variant payloads
- range patterns for integers
- or-patterns for sharing arms

These are not urgent, but they make `match`/`alt` carry more weight as the stdlib grows.

## Interop must be first-class

Interop is not an escape hatch. It is a central part of the language story.

### TypeScript definitions as first-class imports

If possible, Utu should support TS definition imports as a first-class concept.

That would make npm package interop feel seamless and would let Utu piggyback on the existing JS/TS ecosystem instead of trying to replace it immediately.

### npm use as first-class

Using npm packages should feel native.

This implies:

- first-class npm interop
- strong bundling support
- a clean story for generating a JS bundle that contains some Wasm

Utu should piggyback on the TS/npm ecosystem rather than fighting it.

### Server-side and edge runtimes

Browser and node interop is the headline, but Utu should also be a serious option for:

- WASI runtimes (Wasmtime, Wasmer, Spin)
- Cloudflare Workers, Fastly Compute@Edge, Vercel Edge
- generic serverless wasm hosts

Wasm is increasingly a server-side and edge platform. Utu's small-bundle story is even more compelling there than in the browser. The stdlib organization should accommodate non-JS hosts cleanly.

## Standard library must be top notch

A great stdlib reduces weirdness more than syntax changes do.

The stdlib should:

- hide the common cases of DSLs
- expose common interop cleanly
- make ordinary use feel high level
- reserve raw DSL use for advanced cases

Users should not feel like they are constantly gluing together JS manually.

### Platform libraries

Common interop should be organized by platform:

- browser APIs live in the browser library
- Node APIs live in the node library
- Bun APIs live in the bun library
- WASI / edge runtimes get their own libraries

This should make per-platform interop feel built in and unsurprising.

### JS DSLs

Some JS DSL use will remain common because users will inevitably want it.

That is fine.

But the stdlib should still absorb the common cases so raw DSL usage is not required for ordinary work.

### Huge stdlib is a feature

Utu can build a large stdlib by leaning on host/platform capabilities and layering abstractions on top.

This is good.

A strong stdlib makes the language feel complete and dramatically improves approachability.

## DSLs are infrastructure, not the main user experience

DSLs should power:

- JS interop
- WAT interop
- IR-level escape hatches
- WGSL or other special-purpose domains
- platform integrations

But common use should go through stdlib modules.

Ideal experience:

- normal users mostly use stdlib APIs
- advanced users can drop to DSLs when necessary

### Standard DSLs

The standard built-ins that should ship working:

- `@wat` — currently a stub; needs the same end-to-end treatment `@es` got

Future first-class DSLs:

- `@wgsl` — GPU kernels, see below

## Platform-oriented libraries and accelerators

Utu should lean into the platform.

### Browser

Browser work should include:

- DOM APIs
- Web Workers
- browser storage APIs
- eventually GPU/WebGPU paths

### Workers

Stdlib worker/thread abstractions should exist.

Browser concurrency is annoying enough that a good built-in story is valuable.

### IndexedDB-backed structures

Storage and persistence should be available through high-level modules rather than raw IndexedDB ceremony.

The implementation may use DSLs internally, but the public API should feel like a standard library.

### GPU / WGSL

A WGSL DSL could become a major differentiator.

That would allow Utu to:

- orchestrate in normal Utu
- push data-heavy work to GPU kernels
- use linear memory as a useful buffer primitive where appropriate

This is not "cheating" in a bad way. It is using the platform honestly and effectively.

## Developer experience around the compiler

Beyond the language and stdlib, the day-to-day shell of using Utu matters.

### Hot reload / dev server

A built-in dev server with:

- file-watch and recompile
- live reload in the browser
- preserved state where reasonable

This is what makes early-stage development feel snappy. Ecosystems that lack it (or where it is community-fragmented) consistently lose to ones that ship it.

### Documentation generator

A canonical doc generator (`utudoc` or equivalent) that produces searchable browsable docs from source comments and signatures.

Without one, every package author writes their own docs differently and the ecosystem feels incoherent.

### Reproducible builds

Compiling the same source twice should produce byte-identical wasm. This matters for:

- supply-chain trust
- distributed caching
- meaningful diff in CI

Not a feature in itself, but a property worth defending from day one.

## Performance positioning

The current direction suggests a very compelling performance story:

- quarter-scale bundles relative to Rust in some cases
- acceptable runtime slowdown on pure compute
- potential to outperform Rust on interop-heavy workloads

This should become part of the language identity.

The public performance story should be:

- tiny bundles
- strong interop
- Wasm-native control
- very good performance where browser/runtime interop matters

## Summary priorities

The practical order of importance is:

1. reduce remaining weirdness (expression orientation, string interpolation)
2. make docs approachable and explicit
3. make tooling unbelievably robust (LSP, incremental, formatter, test framework)
4. build an excellent stdlib
5. make async/await first-class
6. add async generators, closures, iteration, and pattern-matching depth
7. make TS def imports and npm usage first-class
8. keep DSLs powerful, but hide the common cases behind stdlib (and finish `@wat`)
9. build strong platform libraries for browser, node, bun, and edge runtimes
10. ship the dev shell (dev server, doc generator, reproducible builds)
11. keep pushing toward tiny bundles and excellent interop-heavy performance

If Utu gets these things right, it can become:

- a serious Wasm-first language
- a great language for browser and platform interop
- a language whose unusual features feel justified by real payoff
