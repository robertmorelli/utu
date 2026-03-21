import path from "node:path";
import { pathToFileURL } from "node:url";

export async function loadRuntimeImports(cwd: string, importsPath?: string) {
  const userImports = importsPath ? await loadUserImports(cwd, importsPath) : {};
  return {
    ...builtinRuntimeImports(),
    ...userImports,
  };
}

async function loadUserImports(cwd: string, importsPath: string) {
  const resolved = path.resolve(cwd, importsPath);
  const mod = await import(pathToFileURL(resolved).href);

  const collected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mod)) {
    if (key !== "default") {
      collected[key] = value;
    }
  }

  if (typeof mod.default === "object" && mod.default !== null) {
    Object.assign(collected, mod.default);
  }

  return collected;
}

function builtinRuntimeImports() {
  const globals = globalThis as typeof globalThis & {
    document?: unknown;
  };

  return {
    console_log: (value: unknown) => console.log(value),
    i64_to_string: (value: bigint | number) => String(value),
    f64_to_string: (value: number) => String(value),
    math_sin: (value: number) => Math.sin(value),
    math_cos: (value: number) => Math.cos(value),
    math_sqrt: (value: number) => Math.sqrt(value),
    fetch: typeof globals.fetch === "function" ? globals.fetch.bind(globals) : undefined,
    document: globals.document,
  };
}
