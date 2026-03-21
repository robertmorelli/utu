import { toUint8Array } from "./compilerArtifacts.mjs";

export function normalizeWasmSource(source) {
  return typeof source === "string" && source.startsWith("file://")
    ? decodeURIComponent(source.slice("file://".length))
    : source;
}

export function createTreeSitterInitOptions(runtimeWasmSource) {
  const runtimeWasm = normalizeWasmSource(runtimeWasmSource);
  const runtimeWasmBinary = toOptionalUint8Array(runtimeWasm);
  if (runtimeWasmBinary) {
    return {
      wasmBinary: runtimeWasmBinary,
      instantiateWasm(imports, successCallback) {
        void WebAssembly.instantiate(runtimeWasmBinary, imports).then(({ instance, module }) => {
          successCallback(instance, module);
        });
        return {};
      },
    };
  }

  if (!runtimeWasm) return undefined;
  return {
    locateFile(scriptName) {
      return scriptName === "web-tree-sitter.wasm" ? runtimeWasm : scriptName;
    },
  };
}

function toOptionalUint8Array(value) {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return toUint8Array(value);
  }
  return undefined;
}
