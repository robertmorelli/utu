import data from './jsondata/runtime.data.json' with { type: 'json' };

const NOOP_CLEANUP = async () => { };

export async function loadCompiledRuntime({
  source,
  mode = "program",
  compileSource,
  loadModule,
  prepareRuntime,
  compileOptions = {},
}) {
  const artifact = normalizeCompileArtifact(await compileSource(source, { ...compileOptions, mode }));
  const loaded = await loadModule(artifact.shim, artifact);
  const module = loaded?.module ?? loaded;
  const cleanup = loaded?.cleanup ?? NOOP_CLEANUP;
  const prepared = await prepareRuntime?.();
  const runtimeCleanup = prepared?.cleanup ?? prepared ?? NOOP_CLEANUP;
  try {
    const exports = await module.instantiate(artifact.wasm);
    return createRuntime({
      metadata: module.metadata ?? artifact.metadata,
      module,
      exports,
      cleanup: async () => {
        await runtimeCleanup();
        await cleanup();
      },
    });
  } catch (error) {
    await runtimeCleanup();
    await cleanup();
    throw error;
  }
}

export async function withRuntime(runtimePromise, run) {
  const runtime = await runtimePromise;
  try {
    return await run(runtime);
  } finally {
    await runtime.cleanup();
  }
}

export function createRuntime({ metadata, module, exports, cleanup = NOOP_CLEANUP }) {
  return {
    metadata: {
      ...metadata,
      tests: metadata?.tests ?? [],
      benches: metadata?.benches ?? [],
    },
    module,
    exports,
    cleanup,
    async invoke(exportName, args = []) {
      return { logs: [], result: await exports[exportName](...args) };
    },
  };
}

export function getCallableExport(exports, name) { return exports[name]; }

export async function executeRuntimeTest(runtime, ordinal, { now = defaultNow } = {}) {
  return runtime.module.runTest(runtime.exports, ordinal, { formatError: (e) => JSON.stringify(e), now });
}

export const DEFAULT_BENCHMARK_OPTIONS = Object.freeze(data.defaultBenchmarkOptions);

export async function executeRuntimeBenchmark(runtime, ordinal, options = {}, measureOptions = {}) {
  return runtime.module.runBenchmark(runtime.exports, ordinal, options, measureOptions);
}

function defaultNow() { return performance.now(); }

export function normalizeCompileArtifact(value) {
  return {
    ...value,
    js: value.js ?? value.shim,
    shim: value.shim ?? value.js,
    wasm: toUint8Array(value.wasm),
    metadata: value.metadata ?? {},
  };
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}
