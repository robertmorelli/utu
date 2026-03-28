import {
  DEFAULT_BENCHMARK_OPTIONS,
  DURATION_NS_FORMAT_THRESHOLDS,
  ITERATIONS_PER_SECOND_FORMAT_THRESHOLDS,
} from '../language-spec/runtime-defaults.js';

const IPS_THRESH = ITERATIONS_PER_SECOND_FORMAT_THRESHOLDS;
const NS_THRESH = DURATION_NS_FORMAT_THRESHOLDS;

export async function executeRuntimeBenchmark(runtime, ordinal, options = {}, measureOptions = {}) {
  const bench = runtime.metadata.benches[ordinal];
  const { seconds, samples, warmup } = normalizeOptions(options);
  const targetNs = Math.floor(seconds * 1e9);
  const sampleNs = Math.max(1, Math.floor(targetNs / samples));
  const clock = measureOptions.clock ?? highResolutionClock();
  const profile = measureOptions.profile ?? null;
  const fn = runtime.exports[bench.exportName];

  let estimate = 1;
  for (let index = 0; index < warmup; index += 1) {
    estimate = await calibrate(fn, sampleNs, estimate, clock);
  }

  const runs = [];
  const profileCounts = [];
  for (let index = 0; index < samples; index += 1) {
    const iterations = clampIterations(estimate);
    profile?.reset?.();
    const start = clock.nowNs();
    await fn(iterations);
    const elapsedNs = Math.max(0, clock.nowNs() - start);
    estimate = projectIterations(iterations, elapsedNs, sampleNs);
    runs.push({ durationMs: elapsedNs / 1e6, elapsedNs, iterations });
    if (profile?.snapshot) {
      const counts = profile.snapshot();
      for (let countIndex = 0; countIndex < counts.length; countIndex += 1) {
        profileCounts[countIndex] = (profileCounts[countIndex] ?? 0) + (counts[countIndex] ?? 0);
      }
    }
  }

  const sampleDurationsMs = runs.map((run) => run.durationMs);
  const durationMs = sampleDurationsMs.reduce((sum, value) => sum + value, 0);
  const iterationTotal = runs.reduce((sum, run) => sum + run.iterations, 0);
  const rates = runs.map((run) =>
    run.elapsedNs > 0 ? run.iterations / (run.elapsedNs / 1e9) : 0,
  );
  const meanRate = durationMs > 0 ? iterationTotal / (durationMs / 1000) : 0;
  const summary = `${bench.name}: mean ${formatIterationsPerSecond(meanRate)}, min ${formatIterationsPerSecond(Math.min(...rates))}, max ${formatIterationsPerSecond(Math.max(...rates))}, ${formatNanoseconds(iterationTotal > 0 ? (durationMs / iterationTotal) * 1e6 : 0)}/iter, ${seconds.toFixed(3)}s total target, ${runs.map((run) => run.iterations).join(', ')} iterations`;

  return {
    name: bench.name,
    exportName: bench.exportName,
    logs: [],
    durationMs,
    maxMs: Math.max(...sampleDurationsMs),
    meanMs: durationMs / runs.length,
    minMs: Math.min(...sampleDurationsMs),
    perIterationMs: iterationTotal > 0 ? durationMs / iterationTotal : 0,
    sampleDurationsMs,
    sampleElapsedNs: runs.map((run) => run.elapsedNs),
    iterations: runs.map((run) => run.iterations),
    iterationTotal,
    profileCounts,
    summary,
  };
}

function normalizeOptions(options) {
  return {
    seconds: options?.seconds > 0 ? options.seconds : DEFAULT_BENCHMARK_OPTIONS.seconds,
    samples:
      options?.samples >= 1
        ? Math.floor(options.samples)
        : DEFAULT_BENCHMARK_OPTIONS.samples,
    warmup:
      options?.warmup >= 0
        ? Math.floor(options.warmup)
        : DEFAULT_BENCHMARK_OPTIONS.warmup,
  };
}

function clampIterations(value) {
  return Math.max(1, Math.min(0x7fffffff, Math.round(value) || 1));
}

function projectIterations(iterations, elapsedNs, targetNs) {
  return elapsedNs > 0
    ? clampIterations((iterations * targetNs) / elapsedNs)
    : clampIterations(iterations * 10);
}

function highResolutionClock() {
  return typeof process !== 'undefined' && process?.hrtime?.bigint
    ? { nowNs: () => Number(process.hrtime.bigint()) }
    : { nowNs: () => Math.round(performance.now() * 1e6) };
}

async function calibrate(fn, targetNs, estimate, clock) {
  let iterations = clampIterations(estimate);
  let start = clock.nowNs();
  await fn(iterations);
  let elapsedNs = Math.max(0, clock.nowNs() - start);
  while (elapsedNs < targetNs / 10 && iterations < 0x7fffffff) {
    const nextIterations = clampIterations(
      iterations * (elapsedNs > 0 ? Math.max(2, Math.ceil(targetNs / 10 / elapsedNs)) : 10),
    );
    if (nextIterations === iterations) break;
    iterations = nextIterations;
    start = clock.nowNs();
    await fn(iterations);
    elapsedNs = Math.max(0, clock.nowNs() - start);
  }
  return projectIterations(iterations, elapsedNs, targetNs);
}

function formatIterationsPerSecond(value) {
  for (const { min, divisor, suffix, digits } of IPS_THRESH) {
    if (value >= min) return `${(value / divisor).toFixed(digits)}${suffix}`;
  }
  return `${value.toFixed(2)} iter/s`;
}

function formatNanoseconds(value) {
  for (const { min, divisor, suffix, digits } of NS_THRESH) {
    if (value >= min) return `${(value / divisor).toFixed(digits)}${suffix}`;
  }
  return `${value.toFixed(0)}ns`;
}
