// src/selfhost/index.js — the self-hosted compiler's JavaScript API, for any
// host (bundled as dist/selfhost/utu.js). The compiler itself is
// dist/utu.wasm, with its spec in dist/utu.host.json.
export { ROLE, TARGET, OPTIMIZE, builtModule, compile, compileProgram, instantiate, loadCompiler, loadProgram, readDiagnostics } from './compiler.js';
export { programIndex } from './query.js';
export { catalogStdlib } from './catalog.js';
export { formatDiagnostics } from './format.js';
export { glueSource, loaderSource } from './loader.js';
export { PLATFORM_SOURCES } from '../compiler/platform-sources.generated.js';
