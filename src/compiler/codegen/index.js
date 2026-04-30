// codegen/index.js — emit a compiled IR document as a wasm binary
//
// Pipeline:
//   1. Register every top-level ir-struct with binaryen via TypeBuilder.
//      (Struct registration + struct.* emit live in ./structs.js — this file
//      stays an orchestrator.)
//   2. Build a fn-id → ir-fn lookup so call sites can resolve their target.
//   3. Walk every top-level ir-fn that isn't a std-lib intrinsic wrapper and
//      emit it into a binaryen Module.
//   4. Export each fn marked `data-export="wasm"` (came from `export lib`)
//      and `data-export="main"` (came from `export main`).
//   5. Validate, emit binary. Caller can WebAssembly.instantiate the result.

import {
  binaryen,
  makeTypeMapper,
  makeScalarNamespaceLookup,
  collectScalarKinds,
} from './types.js';
import { emitFn } from './fn.js';
import { describeIntrinsicWrapper } from './intrinsics.js';
import { buildHeapTypes } from './heap-types.js';
import { noteBinarySize, noteExport, noteStructType } from './explainability.js';

/**
 * @param {Document} doc  fully-analysed IR (target='normal')
 * @param {{ artifacts?: object }} [opts]
 * @returns {object}      a binaryen Module — caller is responsible for dispose()
 */
export function buildModule(doc, { artifacts = null, sourceMap = false } = {}) {
  const m = new binaryen.Module();
  // GC + ReferenceTypes are required so addStructType / struct.new validate.
  // SIMD128 is required for the stdlib v128/m128 surface.
  // MutableGlobals + BulkMemory stay on for the existing scalar-side features.
  m.setFeatures(
    binaryen.Features.MutableGlobals |
    binaryen.Features.BulkMemory |
    binaryen.Features.GC |
    binaryen.Features.ReferenceTypes |
    binaryen.Features.Strings |
    binaryen.Features.SIMD128,
  );

  const root = doc.body.firstChild;
  if (!root) return m;

  // Phase 1 — register all top-level struct types in one TypeBuilder pass.
  const structTypes        = buildHeapTypes(root);
  const toType             = makeTypeMapper(structTypes);
  const scalarNamespaceOf  = makeScalarNamespaceLookup(structTypes);
  const scalarKinds        = collectScalarKinds(structTypes);
  for (const node of root.querySelectorAll(':scope > ir-struct, :scope > ir-enum, :scope > ir-enum > ir-variant')) {
    noteStructType(artifacts, node, structTypes.get(node.getAttribute('name')));
  }

  // fn-id index covers every ir-fn anywhere in the document, including std-lib
  // wrappers (so call resolution can detect them as intrinsics).
  const fnById = new Map();
  for (const fn of root.querySelectorAll('ir-fn, ir-extern-fn')) {
    if (fn.id) fnById.set(fn.id, fn);
  }

  const ctx = {
    module: m,
    fnById,
    structTypes,
    toType,
    scalarNamespaceOf,
    scalarKinds,
    artifacts,
    debug: sourceMap ? createDebugInfo(m) : null,
  };

  for (const { spec } of readDslWasmImports(root)) {
    const params = binaryen.createType((spec.params ?? []).map(type => toType(type)));
    const result = toType(spec.result ?? 'void');
    m.addFunctionImport(spec.localName ?? spec.name, spec.module, spec.name, params, result);
  }

  // Emit user fns (anything top-level that isn't itself an intrinsic wrapper).
  for (const fn of root.querySelectorAll(':scope > ir-fn')) {
    if (describeIntrinsicWrapper(fn, scalarKinds)) continue;
    emitFn(fn, ctx);
  }

  // Exports
  for (const fn of root.querySelectorAll(':scope > ir-fn[data-export]')) {
    const name = fn.getAttribute('name');
    if (name) {
      m.addFunctionExport(name, name);
      noteExport(artifacts, fn, name, fn.dataset.export ?? 'unknown');
    }
  }

  return m;
}

function readDslWasmImports(root) {
  try {
    return JSON.parse(root.dataset.dslWasmImports || '[]');
  } catch {
    return [];
  }
}

/**
 * Build, validate, and emit a wasm binary for `doc`. Throws on validation
 * failure with the validator's text printed to stderr.
 *
 * @param {Document} doc
 * @param {{ artifacts?: object, stringMode?: 'native' | 'lowered', sourceMap?: boolean | string }} [opts]
 *   stringMode controls how stringref ops reach the final binary:
 *     - 'lowered' (default): run binaryen's `string-lowering-magic-imports`
 *       pass so stringref becomes externref + JS-String-Builtins magic
 *       imports (`wasm:js-string` module). Runs in any V8 with
 *       `{ builtins: ['js-string'], importedStringConstants: "'" }` compile
 *       options. This is what real browsers ship today.
 *     - 'native': emit raw stringref. Validates, but only runs in engines
 *       with the stringref proposal enabled (binaryen.interpret, Chrome with
 *       experimental flags, etc.). Useful for inspection / golden WAT.
 *
 *   sourceMap, when truthy, returns `{ binary, sourceMap }` instead of the
 *   bare Uint8Array. Pass a string to control the embedded sourceMappingURL
 *   (defaults to 'module.wasm.map').
 *
 *   CAVEAT — sourceMap + stringMode='lowered': binaryen's string-lowering
 *   passes do NOT preserve debug locations on the externref/magic-import
 *   instructions they synthesise. So source-map mappings are reliable for
 *   non-string code paths but degrade (or vanish) for instructions that
 *   touched stringref before the pass ran. If you need full-fidelity maps
 *   over string-using code, emit with stringMode='native' for inspection.
 * @returns {Uint8Array | { binary: Uint8Array, sourceMap: string }}
 */
export function emitBinary(doc, { artifacts = null, stringMode = 'lowered', sourceMap = false } = {}) {
  const m = buildModule(doc, { artifacts, sourceMap });
  if (!m.validate()) {
    const text = m.emitText();
    m.dispose();
    throw new Error(`codegen: binaryen validation failed\n${text}`);
  }
  if (stringMode === 'lowered') {
    m.runPasses(['string-lowering-magic-imports']);
    if (!m.validate()) {
      const text = m.emitText();
      m.dispose();
      throw new Error(`codegen: binaryen validation failed after string-lowering-magic-imports\n${text}`);
    }
  } else if (stringMode !== 'native') {
    m.dispose();
    throw new Error(`codegen: unknown stringMode ${JSON.stringify(stringMode)} (expected 'lowered' | 'native')`);
  }
  const sourceMapUrl = sourceMap ? (sourceMap === true ? 'module.wasm.map' : sourceMap) : undefined;
  const emitted = sourceMap ? m.emitBinary(sourceMapUrl) : m.emitBinary();
  const binary = sourceMap ? emitted.binary : emitted;
  noteBinarySize(artifacts, doc.body.firstChild, binary.length);
  m.dispose();
  return sourceMap ? { binary, sourceMap: emitted.sourceMap } : binary;
}

/**
 * Compile-time options that callers must pass to WebAssembly.compile (or
 * WebAssembly.compileStreaming) when running a binary produced with the
 * default stringMode='lowered'. Re-exported so test harnesses and embedders
 * stay in sync with the lowering pass we run above.
 */
export const JS_STRING_BUILTINS_COMPILE_OPTIONS = Object.freeze({
  builtins: ['js-string'],
  importedStringConstants: "'",
});

/**
 * Convenience wrapper around WebAssembly.compile + WebAssembly.instantiate
 * that supplies the JS-String-Builtins compile options. Use this in tests
 * and embedders that target stringMode='lowered' (the default).
 *
 * @param {Uint8Array} bytes
 * @param {object} [importObject]
 */
export async function instantiateLowered(bytes, importObject = {}) {
  const mod = await WebAssembly.compile(bytes, JS_STRING_BUILTINS_COMPILE_OPTIONS);
  const instance = await WebAssembly.instantiate(mod, importObject);
  return { module: mod, instance };
}

/**
 * Convenience for tests: build the module and return its WAT (wasm text).
 * Useful for snapshot-style assertions before binary execution exists.
 */
export function emitText(doc, { artifacts = null } = {}) {
  const m = buildModule(doc, { artifacts });
  const text = m.emitText();
  m.dispose();
  return text;
}

function createDebugInfo(module) {
  const files = new Map();
  return {
    fileIndex(file) {
      if (!file) return null;
      if (!files.has(file)) files.set(file, module.addDebugInfoFileName(file));
      return files.get(file);
    },
  };
}
