import grammarWasmPath from "../../tree-sitter-utu.wasm" with { type: "file" };
import runtimeWasmPath from "web-tree-sitter/web-tree-sitter.wasm" with { type: "file" };
import * as compiler from "../../../compiler/index.js";
import { normalizeCompileArtifact } from "../../../shared/compilerArtifacts.mjs";

const wasmUrl = grammarWasmPath;
const runtimeWasmUrl = runtimeWasmPath;

export async function compileUtuSource(source, { wat = false, mode = "program" } = {}) {
  await compiler.init({ wasmUrl, runtimeWasmUrl });
  return normalizeCompileArtifact(await compiler.compile(source, { wat, mode, wasmUrl, runtimeWasmUrl }));
}
