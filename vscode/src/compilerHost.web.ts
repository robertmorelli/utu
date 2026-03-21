import * as vscode from 'vscode';
import type {
  BenchmarkOptions,
  BenchmarkResult,
  CompileArtifacts,
  CompileMetadata,
  CompileMode,
  CompileOptions,
  CompilerHost,
  CompilerModule,
  ProgramRunResult,
  RuntimeHost,
  TestResult,
} from './compilerHost';

interface WebCompilerHostOptions {
  compilerModulePath: string;
  grammarWasmPath: string | Uint8Array;
  runtimeWasmPath: string | Uint8Array;
}

interface GeneratedModule {
  instantiate(imports?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface RuntimeInvocation {
  durationMs: number;
  error?: unknown;
  logs: string[];
  result?: unknown;
}

interface LoadedRuntime {
  metadata: CompileMetadata;
  invoke(exportName: string, args?: unknown[]): Promise<RuntimeInvocation>;
}

type CompilerRuntimeModule = CompilerModule;

const DEFAULT_BENCHMARK_OPTIONS: Required<BenchmarkOptions> = {
  iterations: 1000,
  samples: 10,
  warmup: 2,
};

export class WebCompilerHost implements CompilerHost, RuntimeHost {
  private compilerPromise?: Promise<CompilerRuntimeModule>;

  constructor(private readonly options: WebCompilerHostOptions) {}

  async compile(source: string, options: CompileOptions = {}): Promise<CompileArtifacts> {
    return this.compileWithMode(source, 'program', options);
  }

  async runMain(source: string): Promise<ProgramRunResult> {
    const runtime = await this.loadRuntime(source, 'program');
    const execution = await runtime.invoke('main');
    if (execution.error) {
      throw execution.error;
    }
    return {
      logs: execution.logs,
      result: execution.result,
    };
  }

  async runTest(source: string, ordinal: number): Promise<TestResult> {
    const runtime = await this.loadRuntime(source, 'test');
    return executeTest(runtime, ordinal);
  }

  async runTests(source: string): Promise<TestResult[]> {
    const runtime = await this.loadRuntime(source, 'test');
    return Promise.all(runtime.metadata.tests.map((_, ordinal) => executeTest(runtime, ordinal)));
  }

  async runBenchmark(
    source: string,
    ordinal: number,
    options: BenchmarkOptions = {},
  ): Promise<BenchmarkResult> {
    const runtime = await this.loadRuntime(source, 'bench');
    return executeBenchmark(runtime, ordinal, { ...DEFAULT_BENCHMARK_OPTIONS, ...options });
  }

  async runBenchmarks(
    source: string,
    options: BenchmarkOptions = {},
  ): Promise<BenchmarkResult[]> {
    const runtime = await this.loadRuntime(source, 'bench');
    const settings = { ...DEFAULT_BENCHMARK_OPTIONS, ...options };
    return Promise.all(runtime.metadata.benches.map((_, ordinal) => executeBenchmark(runtime, ordinal, settings)));
  }

  private async compileWithMode(
    source: string,
    mode: CompileMode,
    options: CompileOptions = {},
  ): Promise<CompileArtifacts> {
    const compiler = await this.getCompiler();
    const result = await compiler.compile(source, {
      optimize: false,
      ...options,
      mode,
      runtimeWasmUrl: this.options.runtimeWasmPath,
      wasmUrl: this.options.grammarWasmPath,
    });

    return {
      js: result.js,
      wat: result.wat,
      wasm: toUint8Array(result.wasm),
      metadata: normalizeMetadata(result.metadata),
    };
  }

  private async loadRuntime(source: string, mode: CompileMode): Promise<LoadedRuntime> {
    const artifact = await this.compileWithMode(source, mode);
    const module = await importGeneratedModule(artifact.js);
    let logSink: string[] = [];
    const exports = await module.instantiate(createDefaultImports((line) => {
      logSink.push(line);
    }));

    return {
      metadata: artifact.metadata,
      async invoke(exportName: string, args: unknown[] = []) {
        const fn = getExport(exports, exportName);
        logSink = [];
        const start = performance.now();

        try {
          const result = await fn(...args);
          return {
            durationMs: performance.now() - start,
            logs: [...logSink],
            result,
          };
        } catch (error) {
          return {
            durationMs: performance.now() - start,
            error,
            logs: [...logSink],
          };
        }
      },
    };
  }

  private async getCompiler(): Promise<CompilerRuntimeModule> {
    this.compilerPromise ??= this.loadCompiler();
    return this.compilerPromise;
  }

  private async loadCompiler(): Promise<CompilerRuntimeModule> {
    const source = await vscode.workspace.fs.readFile(vscode.Uri.parse(this.options.compilerModulePath, true));
    return importModule<CompilerRuntimeModule>(new TextDecoder().decode(source));
  }
}

function createDefaultImports(writeLine: (line: string) => void): Record<string, unknown> {
  return {
    console_log(value: unknown) {
      writeLine(String(value));
    },
    i64_to_string(value: unknown) {
      return String(value);
    },
    f64_to_string(value: unknown) {
      return String(value);
    },
    math_sin(value: number) {
      return Math.sin(value);
    },
    math_cos(value: number) {
      return Math.cos(value);
    },
    math_sqrt(value: number) {
      return Math.sqrt(value);
    },
  };
}

async function importGeneratedModule(source: string): Promise<GeneratedModule> {
  return importModule<GeneratedModule>(source);
}

async function importModule<T>(source: string): Promise<T> {
  const errors: string[] = [];
  const strategies = source.length > 1_000_000
    ? [() => importBlobModule<T>(source), () => importDataModule<T>(source)]
    : [() => importDataModule<T>(source), () => importBlobModule<T>(source)];

  try {
    for (const strategy of strategies) {
      try {
        return await strategy();
      } catch (error) {
        errors.push(formatError(error));
      }
    }
  } catch {
    // Unreachable, kept so TS preserves the structured control flow.
  }

  throw new Error(`Failed to import generated module.\n${errors.map((error, index) => `Attempt ${index + 1}: ${error}`).join('\n')}`);
}

function getExport(exports: Record<string, unknown>, exportName: string): (...args: unknown[]) => unknown {
  const value = exports[exportName];

  if (typeof value !== 'function') {
    throw new Error(`Missing export "${exportName}".`);
  }

  return value;
}

async function executeTest(runtime: LoadedRuntime, ordinal: number): Promise<TestResult> {
  const test = selectMetadataEntry(runtime.metadata.tests, ordinal, 'tests');
  const execution = await runtime.invoke(test.exportName, []);

  return {
    name: test.name,
    exportName: test.exportName,
    durationMs: execution.durationMs,
    error: execution.error ? formatError(execution.error) : undefined,
    logs: execution.logs,
    passed: execution.error === undefined,
  };
}

async function executeBenchmark(
  runtime: LoadedRuntime,
  ordinal: number,
  options: Required<BenchmarkOptions>,
): Promise<BenchmarkResult> {
  const bench = selectMetadataEntry(runtime.metadata.benches, ordinal, 'benchmarks');

  for (let warmupIndex = 0; warmupIndex < options.warmup; warmupIndex += 1) {
    const warmup = await runtime.invoke(bench.exportName, [options.iterations]);
    if (warmup.error) throw warmup.error;
  }

  const durations: number[] = [];
  let logs: string[] = [];

  for (let sampleIndex = 0; sampleIndex < options.samples; sampleIndex += 1) {
    const sample = await runtime.invoke(bench.exportName, [options.iterations]);
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

function normalizeMetadata(metadata: Partial<CompileMetadata> | undefined): CompileMetadata {
  return {
    tests: metadata?.tests ?? [],
    benches: metadata?.benches ?? [],
  };
}

function selectMetadataEntry(
  entries: CompileMetadata['tests'],
  ordinal: number,
  label: string,
): CompileMetadata['tests'][number] {
  if (!entries.length) {
    throw new Error(`No ${label} found.`);
  }

  const entry = entries[ordinal];
  if (!entry) {
    throw new Error(`Missing ${label.slice(0, -1)} #${ordinal + 1}.`);
  }

  return entry;
}

function toUint8Array(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

async function importBlobModule<T>(source: string): Promise<T> {
  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));

  try {
    return (await import(moduleUrl)) as T;
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}

async function importDataModule<T>(source: string): Promise<T> {
  return (await import(`data:text/javascript;base64,${base64Encode(source)}`)) as T;
}

function base64Encode(source: string): string {
  return base64EncodeBytes(new TextEncoder().encode(source));
}

function base64EncodeBytes(bytes: Uint8Array): string {
  let binary = '';

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error, createCircularReplacer(), 2);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function createCircularReplacer() {
  const seen = new WeakSet<object>();

  return (_key: string, value: unknown) => {
    if (typeof value !== 'object' || value === null) {
      return value;
    }

    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);
    return value;
  };
}
