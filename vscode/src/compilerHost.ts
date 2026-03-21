export interface CompileArtifacts {
  js: string;
  wat?: string;
  wasm: Uint8Array;
  metadata: CompileMetadata;
}

export type CompileMode = 'program' | 'test' | 'bench';

export interface CompileMetadataEntry {
  name: string;
  exportName: string;
}

export interface CompileMetadata {
  tests: CompileMetadataEntry[];
  benches: CompileMetadataEntry[];
}

export interface CompileOptions {
  wat?: boolean;
  optimize?: boolean;
}

export interface CompilerModule {
  compile(
    source: string,
    options?: CompileOptions & {
      mode?: CompileMode;
      wasmUrl?: string | Uint8Array;
      runtimeWasmUrl?: string | Uint8Array;
    },
  ): Promise<CompileArtifacts | (CompileArtifacts & { wat?: string })>;
}

export interface CompilerHost {
  compile(source: string, options?: CompileOptions): Promise<CompileArtifacts>;
}

export interface ProgramRunResult {
  logs: string[];
  error?: string;
  result?: unknown;
}

export interface TestResult {
  name: string;
  exportName: string;
  durationMs: number;
  error?: string;
  logs: string[];
  passed: boolean;
}

export interface BenchmarkOptions {
  iterations?: number;
  samples?: number;
  warmup?: number;
}

export interface BenchmarkResult {
  name: string;
  exportName: string;
  durationMs: number;
  logs: string[];
  maxMs: number;
  meanMs: number;
  minMs: number;
  perIterationMs: number;
}

export interface RuntimeHost {
  runMain(source: string): Promise<ProgramRunResult>;
  runTest(source: string, ordinal: number): Promise<TestResult>;
  runTests(source: string): Promise<TestResult[]>;
  runBenchmark(source: string, ordinal: number, options?: BenchmarkOptions): Promise<BenchmarkResult>;
  runBenchmarks(source: string, options?: BenchmarkOptions): Promise<BenchmarkResult[]>;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const summary = summarizeObject(error);
    if (summary) {
      return summary;
    }
  }

  return String(error);
}

function summarizeObject(error: object): string | undefined {
  const record = error as Record<string, unknown>;
  const namedMessage = [record.name, record.message].filter((value) => typeof value === 'string' && value).join(': ');
  if (namedMessage) {
    return typeof record.stack === 'string' && record.stack ? record.stack : namedMessage;
  }

  try {
    return JSON.stringify(error, createCircularReplacer(), 2);
  } catch {
    return undefined;
  }
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
