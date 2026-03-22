import grammarWasmPath from "../tree-sitter-utu.wasm" with { type: "file" };
import runtimeWasmPath from "web-tree-sitter/web-tree-sitter.wasm" with { type: "file" };
import { startLspServer } from "./lsp_server/node.js";

startLspServer({
  grammarWasmPath,
  runtimeWasmPath,
});
