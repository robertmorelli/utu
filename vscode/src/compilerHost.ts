export interface CompileArtifacts {
  js: string;
  wat?: string;
  wasm: Uint8Array;
}

export interface CompilerModule {
  compile(source: string, options?: { wat?: boolean; optimize?: boolean }): Promise<CompileArtifacts>;
}

export interface CompilerHost {
  compile(
    source: string,
    options?: { wat?: boolean; optimize?: boolean },
  ): Promise<CompileArtifacts>;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}
