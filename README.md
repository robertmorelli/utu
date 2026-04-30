utu is a language that compiles to WasmGC. The compiler, standard library, parser, and analysis engine ship as one bundle -- same bytes whether you're running it in Node, Bun, a browser, an IDE, or CI. There is no separate stdlib install, no host-specific build, no "lite" version. You get all of utu or none of it.

See `PRINCIPLES.md` for the design constraints that keep this true.
