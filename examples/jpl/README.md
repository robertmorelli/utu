# JPL lexer, parser, and type checker

The lexer, parser, and type checker from CS4470's Zig JPL compiler, ported to utu.

- The token listing (`-l`) is byte-identical to the Zig compiler's on the 12 MB
  `t2.jpl` and `t3.jpl` benchmarks (5,758,303 tokens; 65.8 MB and 48.4 MB of
  output).
- The parser builds the same flat node array as Zig's precedence-climbing
  parser (`parser_bench_inline_forced`): 3,617,757 nodes on `t2.jpl` and
  3,182,221 on `t3.jpl`, with identical token counts, and it accepts and
  rejects all 713 CS4470 parser fixtures as Zig does.
- The type checker is Zig's fused parser and checker (`parser_typecheck`): on
  the type-correct `t3.jpl` it reports the same 3,933,868 tokens, 3,182,205
  nodes, 27,484 symbols, and 9 types; it rejects `t2.jpl` as Zig does; and it
  passes all 25 type checker fixtures.

```sh
bun cli/utu.mjs build-exe examples/jpl/jpl.utu -o jpl -O3   # JSC (Bun) executable
./jpl t2.jpl -l          # token listing
./jpl t2.jpl -_          # lex only
./jpl t2.jpl -p -q       # parse only
./jpl t2.jpl -s          # tokens=… nodes=…
./jpl t3.jpl -t -q       # parse and type check
./jpl t3.jpl -t -s       # tokens=… nodes=… symbols=… types=…
./jpl t2.jpl -bench      # in-process medians
node examples/jpl/run.mjs t2.jpl -bench                 # the same on V8
python3 tests/jpl-parser/run.py ./jpl                   # in the Zig repository: 713 fixtures
python3 tests/jpl-typechecker/run.py ./jpl              # and 25 type checker fixtures
```

| Zig | utu |
|---|---|
| comptime `StateMachine` → `[125][256]u8` table | `const mem dfa: U8 = @comptime/\ build().tabs \/` — `build` is ordinary utu run during compilation |
| `enum(u8) tipe`, `enum(u8) Tag` | `enum(U8) Kind`, `enum(U8) Tag`, stored in mems |
| labeled `switch` on `tabs[state][byte]` | `loop match next { … continue next; }` |
| 256-entry comptime precedence table | `const mem precedence: U8 = @comptime/\ precedence_table() \/` |
| `ArrayList(Node)` of `{tag, a, b, token}` | four mems: `node_tag: Tag`, `node_a`, `node_b`, `node_token` |
| `try` on every call | a syntax or type error throws; `parse` and `check` catch it once |
| `StringHashMap` of input slices | names interned in place as spans of `src`, in an open-addressing table in mems |
| `ArrayList`s of types, fields, symbols, patterns | one mem per column |
| input with a 255 sentinel | `src.copy_in(Fs.readFileSync(path)); src.push(255);` |
| print buffer, one write | `mem out: U8`, then `Fs.writeSync(1.0, out.view(0, at))` |

## Speed on `t2.jpl`

Apple M1 Pro. In-process medians of 15 runs after warmup; whole-process from
hyperfine (15 runs, output to `/dev/null`).

| | lex | lex + listing | parse |
|---|---:|---:|---:|
| utu on V8 (Node 25.8), in-process | **45.5 ms** | **103 ms** | **87.5 ms** |
| utu on JSC (Bun 1.4.2), in-process | 47 ms | 115 ms | 108 ms |
| Zig `ReleaseFast`, whole process | 45.2 ms | 114.6 ms | 79.2 ms |
| utu Bun executable, whole process | 75.9 ms | 152.9 ms | 137.9 ms |

## Type checking `t3.jpl`

| | parse | parse + type check |
|---|---:|---:|
| utu on V8, in-process | 67 ms | **86.5 ms** |
| utu on JSC, in-process | 82 ms | 96 ms |
| Zig `ReleaseFast`, whole process | 57.8 ms | 71.0 ms |

Steady-state utu is level with the Zig binaries on lexing, within about 10% on
parsing, and within about 20% on type checking, though Zig's numbers also
include its startup and file read (a few ms). The whole-process gap is the JS
runtime: an empty input takes 16.4 ms, and a single run executes partly before
the engine has optimized the loop. For comparison, the two Rust student
compilers in the Zig repository's benchmark take 61–73 ms to lex, 121–298 ms
to list, 350–483 ms to parse `t2.jpl`, and 327–458 ms to type check `t3.jpl`.

Floats parse to an approximate F64 (digit by digit); the node array stores
those bits, so node payloads can differ from Zig's in the last bit. Token and
node counts and acceptance do not depend on it.
