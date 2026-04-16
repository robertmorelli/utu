export function createDslArtifactState() {
  return { globalKeys: new Set(), wasmImports: new Map(), outputFiles: new Map() };
}

export function collectDslArtifacts(root, state, result, normalize) {
  for (const item of result.globals ?? []) {
    if (!item?.key || !item?.node || state.globalKeys.has(item.key)) continue;
    state.globalKeys.add(item.key);
    root.insertBefore(normalize(item.node), root.firstChild);
  }
  for (const item of result.wasmImports ?? []) {
    if (item?.key && !state.wasmImports.has(item.key)) state.wasmImports.set(item.key, item.spec);
  }
  for (const item of result.outputFiles ?? []) {
    if (item?.key && !state.outputFiles.has(item.key)) {
      state.outputFiles.set(item.key, { path: item.path, contents: item.contents });
    }
  }
}

export function stampDslArtifacts(root, state) {
  root.dataset.dslWasmImports = JSON.stringify([...state.wasmImports].map(([key, spec]) => ({ key, spec })));
  root.dataset.dslOutputFiles = JSON.stringify([...state.outputFiles].map(([key, file]) => ({ key, ...file })));
}
