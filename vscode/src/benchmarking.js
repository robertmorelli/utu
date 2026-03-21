import * as vscode from 'vscode';

export const DEFAULT_BENCHMARK_OPTIONS = Object.freeze({
    iterations: 1000,
    samples: 10,
    warmup: 2,
});

export function getBenchmarkOptionsFromConfig() {
    const config = vscode.workspace.getConfiguration('utu');
    return {
        iterations: clampCount(config.get('bench.iterations', DEFAULT_BENCHMARK_OPTIONS.iterations), 1),
        samples: clampCount(config.get('bench.samples', DEFAULT_BENCHMARK_OPTIONS.samples), 1),
        warmup: clampCount(config.get('bench.warmup', DEFAULT_BENCHMARK_OPTIONS.warmup), 0),
    };
}

export function formatDurationMs(value, { includeNs = false } = {}) {
    if (value >= 1)
        return `${value.toFixed(3)}ms`;
    if (value >= 0.001)
        return `${(value * 1000).toFixed(3)}us`;
    return includeNs
        ? `${(value * 1_000_000).toFixed(0)}ns`
        : `${(value * 1000).toFixed(3)}us`;
}

function clampCount(value, minimum) {
    return Number.isFinite(value) ? Math.max(minimum, Math.floor(value ?? minimum)) : minimum;
}
