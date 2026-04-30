import { pushLowering, pushSizeFact } from '../explainability.js';

export function noteStructType(artifacts, node, info) {
  if (!artifacts || !node || !info) return;
  pushLowering(artifacts, 'codegen-struct-type', node, {
    emittedName: node.getAttribute('name') ?? null,
    emittedKind: 'heap-type',
    heapType: info.heapType ?? null,
  });
}

export function noteFunction(artifacts, node, emittedName, retType) {
  if (!artifacts || !node || !emittedName) return;
  pushLowering(artifacts, 'codegen-function', node, {
    emittedName,
    emittedKind: 'function',
    retType,
  });
}

export function noteExport(artifacts, node, emittedName, exportKind) {
  if (!artifacts || !node || !emittedName) return;
  pushLowering(artifacts, 'codegen-export', node, {
    emittedName,
    emittedKind: 'export',
    exportKind,
  });
}

export function noteBinarySize(artifacts, node, bytes) {
  if (!artifacts || !Number.isFinite(bytes)) return;
  pushSizeFact(artifacts, 'wasm-module', bytes, node, {
    section: 'module',
  });
}
