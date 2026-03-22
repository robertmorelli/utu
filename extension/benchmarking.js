import * as vscode from 'vscode';

import { DEFAULT_BENCHMARK_OPTIONS } from '../compiler/loadCompiledRuntime.mjs';

function clampCount(value, minimum) {
    return Number.isFinite(value) ? Math.max(minimum, Math.floor(value ?? minimum)) : minimum;
}

export { DEFAULT_BENCHMARK_OPTIONS };

export function getBenchmarkOptionsFromConfig(config = vscode.workspace.getConfiguration('utu')) {
    return {
        seconds: clampSeconds(config.get('bench.seconds', DEFAULT_BENCHMARK_OPTIONS.seconds)),
        samples: clampCount(config.get('bench.samples', DEFAULT_BENCHMARK_OPTIONS.samples), 1),
        warmup: clampCount(config.get('bench.warmup', DEFAULT_BENCHMARK_OPTIONS.warmup), 0),
    };
}

function clampSeconds(value) {
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_BENCHMARK_OPTIONS.seconds;
}
