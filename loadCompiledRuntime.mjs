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
  const artifact = normalizeCompileArtifact(await compileSource(source, { where: 'external', ...compileOptions, mode }));
  const loaded = await loadModule(artifact.shim, artifact);
  const module = loaded?.module ?? loaded;
  const cleanup = loaded?.cleanup ?? NOOP_CLEANUP;
  const prepared = await prepareRuntime?.();
  const hostImports = typeof prepared === "object" && prepared !== null ? prepared.hostImports ?? {} : {};
  const runtimeCleanup = typeof prepared === "function" ? prepared : prepared?.cleanup ?? NOOP_CLEANUP;
  try {
    const exports = await module.instantiate(artifact.wasm, hostImports);
    return createRuntime({
      metadata: module.metadata ?? artifact.metadata,
      module,
      exports,
      cleanup: async () => { await runtimeCleanup(); await cleanup(); },
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
    metadata: { ...metadata, tests: metadata?.tests ?? [], benches: metadata?.benches ?? [] },
    module,
    exports,
    cleanup,
    async invoke(exportName, args = []) { return { logs: [], result: await exports[exportName](...args) }; },
  };
}

export function getCallableExport(exports, name) { return exports[name]; }

export async function executeRuntimeTest(runtime, ordinal, { now = () => performance.now() } = {}) {
  const t = runtime.metadata.tests[ordinal];
  const start = now();
  try {
    await runtime.exports[t.exportName]();
    return { name: t.name, exportName: t.exportName, durationMs: now() - start, passed: true };
  } catch (e) {
    return { name: t.name, exportName: t.exportName, durationMs: now() - start, error: JSON.stringify(e), passed: false };
  }
}

export const DEFAULT_BENCHMARK_OPTIONS = Object.freeze(data.defaultBenchmarkOptions);
const IPS_THRESH = data.iterationsPerSecondFormatThresholds;
const NS_THRESH = data.durationNsFormatThresholds;

export async function executeRuntimeBenchmark(runtime, ordinal, options = {}, measureOptions = {}) {
  const bench = runtime.metadata.benches[ordinal];
  const { seconds, samples, warmup } = normOpts(options);
  const targetNs = Math.floor(seconds * 1e9);
  const sampleNs = Math.max(1, Math.floor(targetNs / samples));
  const clk = measureOptions.clock ?? hrClock();
  const profile = measureOptions.profile ?? null;
  const fn = runtime.exports[bench.exportName];

  let estimate = 1;
  for (let i = 0; i < warmup; i++) estimate = await calibrate(fn, sampleNs, estimate, clk);

  const runs = [], profileCounts = [];
  for (let i = 0; i < samples; i++) {
    const iters = clamp(estimate);
    profile?.reset?.();
    const t0 = clk.nowNs(); await fn(iters); const elapsedNs = Math.max(0, clk.nowNs() - t0);
    estimate = project(iters, elapsedNs, sampleNs);
    runs.push({ durationMs: elapsedNs / 1e6, elapsedNs, iterations: iters });
    if (profile?.snapshot) {
      const c = profile.snapshot();
      for (let j = 0; j < c.length; j++) profileCounts[j] = (profileCounts[j] ?? 0) + (c[j] ?? 0);
    }
  }

  const durMs = runs.map(r => r.durationMs);
  const durationMs = durMs.reduce((a, v) => a + v, 0);
  const iterTotal = runs.reduce((a, r) => a + r.iterations, 0);
  const rates = runs.map(r => r.elapsedNs > 0 ? r.iterations / (r.elapsedNs / 1e9) : 0);
  const meanRate = durationMs > 0 ? iterTotal / (durationMs / 1000) : 0;
  const summary = `${bench.name}: mean ${fmtIps(meanRate)}, min ${fmtIps(Math.min(...rates))}, max ${fmtIps(Math.max(...rates))}, ${fmtNs(iterTotal > 0 ? durationMs / iterTotal * 1e6 : 0)}/iter, ${seconds.toFixed(3)}s total target, ${runs.map(r => r.iterations).join(', ')} iterations`;
  return {
    name: bench.name, exportName: bench.exportName,
    durationMs, maxMs: Math.max(...durMs), meanMs: durationMs / runs.length, minMs: Math.min(...durMs),
    perIterationMs: iterTotal > 0 ? durationMs / iterTotal : 0,
    sampleDurationsMs: durMs, sampleElapsedNs: runs.map(r => r.elapsedNs),
    iterations: runs.map(r => r.iterations), iterationTotal: iterTotal, profileCounts, summary,
  };
}

function normOpts(o) {
  const d = DEFAULT_BENCHMARK_OPTIONS;
  return {
    seconds: o?.seconds > 0 ? o.seconds : d.seconds,
    samples: o?.samples >= 1 ? Math.floor(o.samples) : d.samples,
    warmup: o?.warmup >= 0 ? Math.floor(o.warmup) : d.warmup,
  };
}

function clamp(v) { return Math.max(1, Math.min(0x7fffffff, Math.round(v) || 1)); }
function project(n, ns, target) { return ns > 0 ? clamp(n * target / ns) : clamp(n * 10); }
function hrClock() {
  return typeof process !== 'undefined' && process?.hrtime?.bigint
    ? { nowNs: () => Number(process.hrtime.bigint()) }
    : { nowNs: () => Math.round(performance.now() * 1e6) };
}

async function calibrate(fn, target, n, clk) {
  let iters = clamp(n);
  let t = clk.nowNs(); await fn(iters); let ns = Math.max(0, clk.nowNs() - t);
  while (ns < target / 10 && iters < 0x7fffffff) {
    const next = clamp(iters * (ns > 0 ? Math.max(2, Math.ceil(target / 10 / ns)) : 10));
    if (next === iters) break;
    iters = next;
    t = clk.nowNs(); await fn(iters); ns = Math.max(0, clk.nowNs() - t);
  }
  return project(iters, ns, target);
}

function fmtIps(v) {
  for (const { min, divisor, suffix, digits } of IPS_THRESH)
    if (v >= min) return `${(v / divisor).toFixed(digits)}${suffix}`;
  return `${v.toFixed(2)} iter/s`;
}

function fmtNs(v) {
  for (const { min, divisor, suffix, digits } of NS_THRESH)
    if (v >= min) return `${(v / divisor).toFixed(digits)}${suffix}`;
  return `${v.toFixed(0)}ns`;
}

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
