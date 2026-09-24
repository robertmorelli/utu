A small Rust crate and its committed wasm-bindgen output, so tests cover the
Rust → wasm-bindgen → `.d.ts` → UTU path without a Rust toolchain.

Regenerate after editing `src/lib.rs` (needs rustup's `wasm32-unknown-unknown`):

```sh
wasm-pack build --target nodejs --out-dir pkg --no-pack && rm pkg/.gitignore
```
