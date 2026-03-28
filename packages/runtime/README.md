# Runtime Package

Shared runtime-loading and module-loading helpers live here.

Use this package for:

- compile artifact normalization
- loading compiled UTU runtimes
- executing `main`, tests, and benchmarks
- loading generated modules from source in Node or browser-like hosts

Public entrypoints:

- [`index.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/runtime/index.js)
- [`browser.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/runtime/browser.js)
- [`node.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/runtime/node.js)

Key modules:

- [`artifact.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/runtime/artifact.js)
- [`loader.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/runtime/loader.js)
- [`run-main.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/runtime/run-main.js)
- [`run-test.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/runtime/run-test.js)
- [`run-bench.js`](/Users/robertmorelli/Documents/personal-repos/utu/packages/runtime/run-bench.js)
- [`moduleSourceLoader.mjs`](/Users/robertmorelli/Documents/personal-repos/utu/packages/runtime/moduleSourceLoader.mjs)
- [`loadNodeModuleFromSource.mjs`](/Users/robertmorelli/Documents/personal-repos/utu/packages/runtime/loadNodeModuleFromSource.mjs)

Import rule:

- browser-safe code should import from `browser.js` or `index.js`
- Node-only code that needs `loadNodeModuleFromSource()` should import from `node.js`
- CLI, tests, and hosts should prefer this package over root-level runtime helper paths
- runtime entrypoints now live only in this package
