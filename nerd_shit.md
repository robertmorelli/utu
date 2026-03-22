Nerd shit

Compiler-side places that look over-engineered, too defensive, or unnecessarily bloated.

## `jsgen.js`

- Import resolution still does too much.
  - It still has `__globalObject`, `__importPaths`, underscore splitting, capitalization variants, and multiple lookup paths for one import.
  - This is a lot of machinery for "find the JS thing and pass it through".
  - If import semantics are supposed to be simple, this is still a major abstraction blob.

- `SUPPORTED_WASM_LOCATIONS` and `SUPPORTED_MODULE_FORMATS` validation is bloated for the actual state of the code.
  - `moduleFormat` only supports `esm`.
  - The runtime code branches across multiple wasm location modes and throws custom validation errors before just doing the obvious thing.

- The generated shim contains a huge amount of benchmark formatting/runtime utility code.
  - `__defaultClock`
  - `__benchmarkRate`
  - `__formatIterationsPerSecond`
  - `__formatDurationNs`
  - `__normalizeBenchmarkOptions`
  - `__timeInvocation`
  - `__clampIterations`
  - `__projectIterations`
  - `__calibrateIterations`
  - `__mergeCounts`
  - This is a lot of support code living in emitted JS for a compiler shim.

- `__invokeExport` fabricates `{ logs: [], result }`.
  - That is a tiny example of unnecessary abstraction and fake structure.
  - The real thing people care about is the result.

- The string/base64 wasm embedding path is bulky.
  - `toBase64`
  - emitted `__decodeBase64`
  - emitted `__wasmBytes`
  - If this mode stays, fine, but it is still a lot of code around just getting bytes into `WebAssembly.instantiate`.

## `tree.js`

- The `Proxy` wrapper around tree-sitter nodes is peak nerd shit.
  - `RAW_NODE`
  - `wrappedNodes`
  - `wrapNode`
  - proxy `get(...)`
  - rebinding every method with `value.bind(target)`
  - filtering `namedChildren` through proxy access
  - This is a lot of dynamic machinery just to hide comments and make nodes feel nicer.

- `rawNode` / `rawNamedChildren` / proxy caching / symbol tagging is a whole mini-runtime.
  - The parser tree adapter should probably be much dumber.

## `parser.js`

- `normalizeWasmSource` supports too many input shapes.
  - string
  - URL
  - ArrayBuffer
  - any typed array view
  - `.href`
  - fallback to raw object/null
  - That is broad compatibility code, not a tight compiler interface.

- `createTreeSitterInitOptions` has extra compatibility paths that make the parser setup harder to read than it needs to be.
  - `wasmBinary`
  - custom `instantiateWasm`
  - `locateFile`
  - multiple wasm source shapes

- `UtuSourceDocument` is a pretty large utility object for line math, clamping, offsets, and spans.
  - Useful, but definitely more infrastructure than compiler core.

## `index.js`

- The compile path does extra validation/safety work that feels bloated.
  - `ensureValid(mod, ...)` before optimize
  - `ensureValid(mod, ...)` after optimize
  - create a `WebAssembly.Module`
  - maybe instantiate it if it has no imports
  - swallow errors from that instantiate probe
  - This is a lot of defensive checking for one compile call.

- The result object duplicates `shim` and `js` with the same value.
  - `shim: generatedShim`
  - `js: generatedShim`
  - Feels like compatibility sludge.

## `watgen.js`

- The file has a giant "dispatch table for everything" style.
  - `TOP_LEVEL_COLLECT_HANDLERS`
  - `CONST_EXPR_HANDLERS`
  - `CONST_LITERAL_EVALUATORS`
  - `LITERAL_GENERATORS`
  - `UNARY_GENERATORS`
  - `ARRAY_NS_CALL_HANDLERS`
  - `NS_CALL_HANDLERS`
  - `INFER_TYPE_HANDLERS`
  - `INFER_NS_CALL_HANDLERS`
  - `DEFAULT_VALUE_GENERATORS`
  - `LOCAL_COLLECT_HANDLERS`
  - `TYPE_VISIT_HANDLERS`
  - `BODY_TYPE_VISIT_HANDLERS`
  - `ELEM_TYPE_KEY_HANDLERS`
  - `SCALAR_PATTERN_GENERATORS`
  - `EXPR_GENERATORS`
  - `PARSE_TYPE_HANDLERS`
  - Some tables are good, but this many turns the file into framework code.

- There is a lot of constant-folding and type/meta plumbing for what should probably be a more direct emitter.
  - `CONST_BINARY_OPS`
  - `LITERAL_TEXT_INFO`
  - `SCALAR_MATCH_COMPARE_TYPES`
  - `DISCARD_HINT_NODES`
  - `VALUELESS_EXPR_TYPES`
  - `INFERRED_VALUE_EXPR_TYPES`
  - `SCALAR_NAMES`
  - This is the kind of "smart compiler" surface area that tends to grow forever.

## General smell

- There are several places where the code prefers a generic mechanism over a simple explicit rule.
  - dynamic proxies instead of plain helpers
  - broad normalization instead of a strict input contract
  - many runtime modes instead of one obvious path
  - metadata/result wrappers instead of raw values
  - import resolution heuristics instead of direct lookup semantics

- A recurring pattern is "make it flexible for every host / every input / every mode".
  - That flexibility is where a lot of the bloat is coming from.
