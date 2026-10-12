# JPL lexer

The lexer from CS4470's Zig JPL compiler, ported to utu. Its token listing
(`-l`) is byte-identical to the Zig compiler's on the 12 MB `t2.jpl` and
`t3.jpl` benchmarks (5,758,303 tokens; 65.8 MB and 48.4 MB of output).

```sh
bun cli/utu.mjs build-exe examples/jpl-lexer/lexer.utu -o jpl-lex -O3   # JSC (Bun) executable
./jpl-lex t2.jpl -l          # token listing
./jpl-lex t2.jpl -_          # lex only
./jpl-lex t2.jpl -bench      # in-process medians
node examples/jpl-lexer/run.mjs t2.jpl -bench                        # the same on V8
```

It uses the pieces a fast lexer needs:

| Zig | utu |
|---|---|
| comptime `StateMachine` → `[125][256]u8` table | `const mem dfa: U8 = @comptime/\ build().tabs \/` — `build` is ordinary utu run during compilation |
| `enum(u8) tipe` | `enum(U8) Kind`, stored in `mem kinds: Kind` |
| labeled `switch` on `tabs[state][byte]` | `loop match next { … continue next; }` |
| input with a 255 sentinel | `src.copy_in(Fs.readFileSync(path)); src.push(255);` |
| token arrays sized to the input | `starts.resize(src.len() + 1)`, then direct stores |
| print buffer, one write | `mem out: U8`, then `Fs.writeSync(1.0, out.view(0, at))` |

## Speed on `t2.jpl`

Apple M1 Pro. In-process medians of 15 runs after warmup; whole-process from
hyperfine (15 runs, output to `/dev/null`).

| | lex | lex + listing |
|---|---:|---:|
| utu on V8 (Node 25.8), in-process | **45.5 ms** | **103 ms** |
| utu on JSC (Bun 1.4.2), in-process | 47 ms | 115 ms |
| Zig `ReleaseFast`, whole process | 45.2 ms | 114.6 ms |
| utu Bun executable, whole process | 75.9 ms | 152.9 ms |

Steady-state utu is level with the Zig binary, which includes its own startup
and file read (a few ms). The whole-process gap is the JS runtime: an empty
input takes 16.4 ms, and a single run executes partly before the engine has
optimized the loop. For comparison, the two Rust student compilers in the Zig
repository's benchmark take 61–73 ms to lex and 121–298 ms to list.
