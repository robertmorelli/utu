import { pathToFileURL } from "node:url";
import { access } from "node:fs/promises";
import path from "node:path";

export async function compileUtuSource(source: string, wat = false) {
  const compiler = await loadCompiler();
  const cliRoot = await getCliRoot();
  const wasmUrl = pathToFileURL(path.join(cliRoot, "tree-sitter-utu.wasm"));

  if (compiler.init) {
    await compiler.init({ wasmUrl });
  }

  const result = await compiler.compile(source, {
    optimize: false,
    wat,
    wasmUrl,
  });

  return {
    js: result.js,
    wasm: toUint8Array(result.wasm),
    wat: result.wat,
  };
}

async function loadCompiler() {
  const cliRoot = await getCliRoot();
  const compilerPath = path.join(cliRoot, "..", "compiler", "index.js");
  const mod = await import(pathToFileURL(compilerPath).href);
  if (typeof mod.compile !== "function") {
    throw new Error("Shared compiler module does not export compile().");
  }
  return mod;
}

async function getCliRoot() {
  const candidates = [
    path.resolve(import.meta.dir, "..", ".."),
    path.resolve(import.meta.dir, ".."),
  ];

  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, "tree-sitter-utu.wasm"));
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("Could not find cli_artifact.");
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
