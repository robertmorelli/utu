Standard library `.utu` sources live here, including generated subdirectories.

The build recursively embeds each source in the portable compiler as
`std:<filename-without-extension>`. Basenames must be unique across directories.
Apps import only the modules they use; optimized Wasm imports determine which
JavaScript wrappers reach the output.

`JS.utu` provides exact host-value operations and arbitrary-signature callbacks.
`browser/` contains the generated TypeScript DOM/ES2022 ABI. Regenerate it with
`bun run bindings:browser`, then rebuild the compiler with `bun run build`.
Do not edit generated files. The manifest records TypeScript version, input
libraries, allocated names, counts, and static type erasures.

See [TypeScript ABI](../docs/typescript-abi.md) and the
[browser demo](../examples/browser-board/README.md).
