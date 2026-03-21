import { pathToFileURL } from "node:url";

import { resolveProjectPath } from "./project.ts";

type CompilerApi = {
  init?: (config?: { wasmUrl?: URL }) => Promise<void>;
  compile: (
    source: string,
    options?: { optimize?: boolean; wat?: boolean; wasmUrl?: URL },
  ) => Promise<{
    js: string;
    wasm: Uint8Array | ArrayBuffer | ArrayBufferView;
    wat?: string;
  }>;
};

export type CompileOptions = {
  optimize?: boolean;
  emitWat?: boolean;
};

export type CompileArtifacts = {
  js: string;
  wasm: Uint8Array;
  wat?: string;
  optimized: boolean;
  warning?: string;
};

let compilerPromise: Promise<CompilerApi> | undefined;

export async function compileUtuSource(source: string, options: CompileOptions = {}): Promise<CompileArtifacts> {
  const compiler = await loadCompiler();
  const wasmUrl = pathToFileURL(await resolveProjectPath("cli_artifact/tree-sitter-utu.wasm"));
  const preferOptimized = options.optimize ?? true;

  if (compiler.init) {
    await compiler.init({ wasmUrl });
  }

  try {
    const result = await compiler.compile(source, {
      optimize: preferOptimized,
      wat: options.emitWat ?? false,
      wasmUrl,
    });

    return {
      js: result.js,
      wasm: toUint8Array(result.wasm),
      wat: result.wat,
      optimized: preferOptimized,
    };
  } catch (error) {
    if (!preferOptimized) {
      throw error;
    }

    const fallback = await compiler.compile(source, {
      optimize: false,
      wat: options.emitWat ?? false,
      wasmUrl,
    });

    process.exitCode = 0;

    return {
      js: fallback.js,
      wasm: toUint8Array(fallback.wasm),
      wat: fallback.wat,
      optimized: false,
      warning: `Optimization failed; emitted unoptimized output instead.`,
    };
  }
}

async function loadCompiler() {
  if (!compilerPromise) {
    compilerPromise = (async () => {
      const compilerPath = await resolveProjectPath("compiler/index.js");
      const compilerUrl = pathToFileURL(compilerPath).href;
      const mod = (await import(compilerUrl)) as Partial<CompilerApi>;

      if (typeof mod.compile !== "function") {
        throw new Error("Shared compiler module does not export compile().");
      }

      return mod as CompilerApi;
    })();
  }

  return compilerPromise;
}

function toUint8Array(value: Uint8Array | ArrayBuffer | ArrayBufferView) {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  throw new Error("Compiler returned wasm bytes in an unsupported format.");
}
