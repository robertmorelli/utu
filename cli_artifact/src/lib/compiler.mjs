import grammarWasmPath from "../../tree-sitter-utu.wasm" with { type: "file" };
import runtimeWasmPath from "web-tree-sitter/web-tree-sitter.wasm" with { type: "file" };
import * as compiler from "../../../compiler/index.js";
import { normalizeCompileArtifact } from "../../../shared/compilerArtifacts.mjs";

const compilerAssetOptions = {
  wasmUrl: grammarWasmPath,
  runtimeWasmUrl: runtimeWasmPath,
};

export async function compileUtuSource(source, { wat = false, mode = "program", shim = "inline-wasm", moduleFormat = "esm" } = {}) {
  await compiler.init(compilerAssetOptions);
  return normalizeCompileArtifact(await compiler.compile(source, {
    wat,
    mode,
    shim,
    moduleFormat,
    ...compilerAssetOptions,
  }));
}
