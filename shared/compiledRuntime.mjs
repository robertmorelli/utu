import { normalizeCompileArtifact, normalizeCompileMetadata } from "./compilerArtifacts.mjs";

const NOOP_CLEANUP = async () => {};

export async function loadCompiledRuntime({
  source,
  mode = "program",
  compileSource,
  loadModule,
  createImports,
  compileOptions = {},
}) {
  const artifact = normalizeCompileArtifact(await compileSource(source, { ...compileOptions, mode }));
  const loadedModule = await loadModule(artifact.js);
  const module = loadedModule?.module ?? loadedModule;
  const cleanup = loadedModule?.cleanup ?? NOOP_CLEANUP;
  const importProvider = normalizeImportProvider(createImports ? await createImports() : {});

  try {
    const exports = await module.instantiate(importProvider.imports);
    return createRuntime({
      metadata: artifact.metadata,
      exports,
      cleanup,
      resetLogs: importProvider.resetLogs,
      getLogs: importProvider.getLogs,
    });
  } catch (error) {
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

export function createRuntime({ metadata, exports, cleanup = NOOP_CLEANUP, resetLogs, getLogs }) {
  const readLogs = getLogs ?? (() => []);
  return {
    metadata: normalizeCompileMetadata(metadata),
    exports,
    async cleanup() {
      await cleanup();
    },
    async invoke(exportName, args = [], message) {
      const fn = getCallableExport(exports, exportName, message);
      resetLogs?.();
      try {
        const result = await fn(...args);
        return { logs: readLogs(), result };
      } catch (error) {
        return { logs: readLogs(), error };
      }
    },
  };
}

export function getCallableExport(exports, name, message = `Missing export "${name}".`) {
  const value = exports[name];
  if (typeof value !== "function") {
    throw new Error(message);
  }
  return (...args) => value(...args);
}

export function selectMetadataEntry(entries, ordinal, label) {
  if (!entries.length) {
    throw new Error(`No ${label} found.`);
  }
  const entry = entries[ordinal];
  if (!entry) {
    throw new Error(`Missing ${label.slice(0, -1)} #${ordinal + 1}.`);
  }
  return entry;
}

export async function executeRuntimeTest(runtime, ordinal, { formatError = defaultFormatError, now = defaultNow } = {}) {
  const test = selectMetadataEntry(runtime.metadata.tests, ordinal, "tests");
  const start = now();
  const execution = await runtime.invoke(test.exportName, [], `Missing test export "${test.exportName}"`);
  return {
    name: test.name,
    exportName: test.exportName,
    durationMs: now() - start,
    error: execution.error ? formatError(execution.error) : undefined,
    logs: execution.logs,
    passed: execution.error === undefined,
  };
}

export async function executeRuntimeTests(runtime, options) {
  return Promise.all(runtime.metadata.tests.map((_, ordinal) => executeRuntimeTest(runtime, ordinal, options)));
}

export async function executeFixedRuntimeBenchmark(runtime, ordinal, options, { now = defaultNow } = {}) {
  const bench = selectMetadataEntry(runtime.metadata.benches, ordinal, "benchmarks");
  for (let warmupIndex = 0; warmupIndex < options.warmup; warmupIndex += 1) {
    const warmup = await invokeMeasured(runtime, bench.exportName, [options.iterations], now, `Missing benchmark export "${bench.exportName}"`);
    if (warmup.error) throw warmup.error;
  }

  const durations = [];
  let logs = [];
  for (let sampleIndex = 0; sampleIndex < options.samples; sampleIndex += 1) {
    const sample = await invokeMeasured(runtime, bench.exportName, [options.iterations], now, `Missing benchmark export "${bench.exportName}"`);
    if (sample.error) throw sample.error;
    durations.push(sample.durationMs);
    logs = sample.logs;
  }

  const durationMs = durations.reduce((sum, value) => sum + value, 0);
  const meanMs = durationMs / durations.length;
  return {
    name: bench.name,
    exportName: bench.exportName,
    durationMs,
    logs,
    maxMs: Math.max(...durations),
    meanMs,
    minMs: Math.min(...durations),
    perIterationMs: meanMs / options.iterations,
  };
}

export async function executeFixedRuntimeBenchmarks(runtime, options, measureOptions) {
  return Promise.all(runtime.metadata.benches.map((_, ordinal) => executeFixedRuntimeBenchmark(runtime, ordinal, options, measureOptions)));
}

async function invokeMeasured(runtime, exportName, args, now, message) {
  const start = now();
  const execution = await runtime.invoke(exportName, args, message);
  return {
    ...execution,
    durationMs: now() - start,
  };
}

function normalizeImportProvider(value) {
  if (value && typeof value === "object" && "imports" in value) {
    return {
      imports: value.imports ?? {},
      resetLogs: value.resetLogs,
      getLogs: value.getLogs,
    };
  }
  return { imports: value ?? {} };
}

function defaultFormatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function defaultNow() {
  return performance.now();
}
