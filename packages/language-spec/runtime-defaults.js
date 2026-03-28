import data from '../../jsondata/runtime.data.json' with { type: 'json' };

export const DEFAULT_BENCHMARK_OPTIONS = Object.freeze(
  data.defaultBenchmarkOptions,
);
export const ITERATIONS_PER_SECOND_FORMAT_THRESHOLDS = data.iterationsPerSecondFormatThresholds;
export const DURATION_NS_FORMAT_THRESHOLDS = data.durationNsFormatThresholds;

// Runtime defaults are data-backed but still part of the language-spec surface.
