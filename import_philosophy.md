Import philosophy

- Import resolution should be as simple as possible.
- The shim should resolve the requested JS path and pass the resolved value directly into the wasm import object.
- The shim should not track owners, bind methods, call `apply`, or add host-specific cleverness.
- The shim should not special-case VS Code or any other host in order to make editor UX work.
- If an imported JS value is a function, pass that function directly.
- If an imported JS value is not callable where wasm expects a callable import, the runtime should throw. That is the runtime's job, not the shim's job.
- If an imported JS value is a plain value, pass that value directly.
- `main()` return values should be surfaced by hosts directly instead of inventing fake logging behavior in the compiler.
- Host-specific functionality should come from explicit imports exposed by the host, not compiler hacks or ambient host introspection.
