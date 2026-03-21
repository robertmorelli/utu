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

export function parseTree(parser, source, errorMessage = "Tree-sitter returned no syntax tree for the document.") {
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error(errorMessage);
  }

  return {
    tree,
    dispose() {
      tree.delete();
    },
  };
}

export async function withParsedTree(parser, source, callback, errorMessage) {
  const parsedTree = parseTree(parser, source, errorMessage);
  try {
    return await callback(parsedTree.tree);
  } finally {
    parsedTree.dispose();
  }
}
