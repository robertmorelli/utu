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
  makeScalarKindLookup,
  collectScalarKinds,
} from './types.js';
import { emitFn } from './fn.js';
import { emitExpr } from './expr.js';
import { describeIntrinsicWrapper } from './intrinsics.js';
import { buildHeapTypes } from './heap-types.js';
import { noteBinarySize, noteExport, noteStructType } from './explainability.js';
import {
  createSignatureTypes, installClosureImports, registerCallableTypes,
} from './closures.js';
import { linkTypeDecls } from '../link-type-decls.js';
import { retainedGraphs } from '../graph-store.js';
import { ensureBackendPlan } from '../backend-plan.js';
import { unwrapNullable } from '../type-strings.js';
import { declareMemoryGlobals, moduleWithMemories, readMems } from './memories.js';
import { childrenOf } from '../ir-helpers.js';

const MODULE_REQUIREMENTS = new WeakMap();

/**
 * @param {Document} doc  fully-analysed IR (target='normal')
 * @param {{ artifacts?: object }} [opts]
 * @returns {object}      a binaryen Module — caller is responsible for dispose()
 */
export function buildModule(doc, { artifacts = null, sourceMap = false } = {}) {
  const m = moduleWithMemories(readMems(doc.body.firstChild));
  try {
    populateModule(m, doc, { artifacts, sourceMap });
    return m;
  } catch (error) {
    // Ownership transfers to the caller only after construction succeeds.
    m.dispose();
    throw error;
  }
}

function populateModule(m, doc, { artifacts, sourceMap }) {
  // GC + ReferenceTypes are required so addStructType / struct.new validate.
  // SIMD128 is required for the stdlib v128/m128 surface.
  // MutableGlobals + BulkMemory stay on for the existing scalar-side features.
  m.setFeatures(
    binaryen.Features.MutableGlobals |
    binaryen.Features.BulkMemory |
    binaryen.Features.MultiMemory |
    binaryen.Features.Multivalue |
    binaryen.Features.NontrappingFPToInt |
    binaryen.Features.ExceptionHandling |
    binaryen.Features.GC |
    binaryen.Features.ReferenceTypes |
    binaryen.Features.Strings |
    binaryen.Features.SIMD128,
  );

  const root = doc.body.firstChild;
  if (!root) return;

  // Compiled documents have one authoritative backend plan. Standalone pass
  // users may still supply an analysed DOM without one, but a stale plan is
  // never mixed with freshly rediscovered facts.
  const graphs = retainedGraphs(doc);
  const plan = ensureBackendPlan(doc, graphs.backend);
  const typeIndex = plan?.typeIndex ?? linkTypeDecls(doc);
  const structTypes        = buildHeapTypes(root, typeIndex);
  const mapType            = makeTypeMapper(structTypes);
  const requirements       = { strings: false, conservativeSweep: false };
  const toType             = type => {
    const entry = structTypes.get(unwrapNullable(type ?? ''));
    if (entry?.typeRepr === 'wasm-stringref') requirements.strings = true;
    return mapType(type);
  };
  const scalarNamespaceOf  = makeScalarNamespaceLookup(structTypes);
  const scalarKindOf       = makeScalarKindLookup(structTypes);
  const scalarKinds        = collectScalarKinds(structTypes);
  for (const node of root.querySelectorAll(':scope > ir-struct, :scope > ir-enum, :scope > ir-enum > ir-variant')) {
    noteStructType(artifacts, node, structTypes.get(node.getAttribute('name')));
  }

  // fn-id index covers every ir-fn anywhere in the document, including std-lib
  // wrappers (so call resolution can detect them as intrinsics).
  const fnByName = plan?.functionsByName
    ?? new Map([...root.querySelectorAll('ir-fn, ir-extern-fn')].map(fn => [fn.getAttribute('name'), fn]));
  const fnById = plan?.functionsById
    ?? new Map([...fnByName.values()].filter(fn => fn.id).map(fn => [fn.id, fn]));

  // Callable types are structural, so they are registered from the stamped
  // type names rather than from declarations — after the struct registry
  // exists, since a signature may mention a struct.
  const signatureRefType = createSignatureTypes();
  registerCallableTypes(root, structTypes, toType, signatureRefType, plan);

  const ctx = {
    module: m,
    // -O3 trades bytes for speed in a few lowerings (loop match arm copies).
    optimize: doc.body.firstChild?.attr?.('data-optimize') === 'speed' ? 'speed' : 'size',
    fnById,
    fnByName,
    structTypes,
    toType,
    scalarNamespaceOf,
    scalarKindOf,
    scalarKinds,
    signatureRefType,
    artifacts,
    backendPlan: plan,
    requirements,
    globals: new Map(),
    typeOf: node => plan?.typeOf(node) ?? node?.attr?.('data-type-name') ?? null,
    expectedOf: node => plan?.expectedOf(node) ?? node?.attr?.('data-expect') ?? node?.attr?.('data-expected-type') ?? null,
    bindingIdOf: node => plan?.bindingIdOf(node) ?? node?.attr?.('data-binding-id') ?? null,
    callTargetIdOf: node => plan?.callTargetIdOf(node) ?? node?.attr?.('data-fn-id') ?? null,
    fieldOf: node => plan?.fieldOf(node) ?? null,
    debug: sourceMap ? createDebugInfo(m) : null,
  };

  for (const { spec } of plan?.runtime.dslImports ?? readDslWasmImports(root)) {
    const params = binaryen.createType((spec.params ?? []).map(type => toType(type)));
    const result = toType(spec.result ?? 'void');
    m.addFunctionImport(spec.localName ?? spec.name, spec.module, spec.name, params, result);
  }

  declareMemoryGlobals(m, readMems(root));

  // Host closure imports must exist before any body that calls them.
  installClosureImports(m, root, ctx);

  // Wasm globals must have constant initializers. Source globals currently
  // support literal scalar/reference constants; reject richer initializers at
  // codegen with a direct error instead of failing later in Binaryen.
  for (const global of childrenOf(root, 'ir-global')) {
    const name = global.getAttribute('name');
    const init = global.lastElementChild;
    const typeName = ctx.typeOf(global) ?? ctx.typeOf(init);
    if (!name || !init || !typeName) throw new Error('codegen: malformed ir-global');
    if (init.localName !== 'ir-lit' && init.localName !== 'ir-null-ref') {
      throw new Error(`codegen: global "${name}" requires a literal constant initializer`);
    }
    const type = toType(typeName);
    const initExpr = emitExpr(init, { ...ctx, locals: new Map() });
    m.addGlobal(name, type, false, initExpr);
    ctx.globals.set(global.id, { name, type });
  }

  // Emit user fns (anything top-level that isn't itself an intrinsic wrapper).
  const emittableFunctions = [...(plan?.emittableFunctions ?? childrenOf(root, 'ir-fn'))]
    .filter(fn => !describeIntrinsicWrapper(fn, scalarKinds));
  requirements.conservativeSweep ||= requiresConservativeSweep(emittableFunctions, plan, typeIndex);
  for (const fn of emittableFunctions) emitFn(fn, ctx);

  // Exports
  for (const fn of plan?.exports ?? root.querySelectorAll(':scope > ir-fn[data-export]')) {
    const name = fn.getAttribute('name');
    if (name) {
      m.addFunctionExport(exportOpaque(m, name), name);
      noteExport(artifacts, fn, name, fn.attr('data-export') ?? 'unknown');
    }
  }

  MODULE_REQUIREMENTS.set(m, requirements);
}

/**
 * utu structs and arrays cross the JS boundary as opaque handles. An export
 * whose signature mentions them gets a wrapper taking and returning externref
 * (the same JS-visible object), so no GC type becomes part of the module's
 * public interface. Public types keep their exact fields, which would stop
 * string lowering from rewriting their Str fields and leave the module invalid.
 * Returns the name of the function to export.
 */
function exportOpaque(m, name) {
  const info = binaryen.getFunctionInfo(m.getFunction(name));
  const params = binaryen.expandType(info.params);
  const opaque = type => {
    if (!binaryen._BinaryenTypeIsNullable(type) && binaryen.expandType(type).length !== 1) return false;
    const heap = binaryen._BinaryenTypeGetHeapType(type);
    if (!heap) return false;
    return binaryen._BinaryenHeapTypeIsSubType(heap, binaryen._BinaryenHeapTypeAny())
      && !binaryen._BinaryenHeapTypeIsSubType(heap, binaryen._BinaryenHeapTypeString());
  };
  const isRef = type => binaryen.expandType(type).length === 1 && type !== binaryen.none
    && ![binaryen.i32, binaryen.i64, binaryen.f32, binaryen.f64, binaryen.v128].includes(type);
  const wrap = type => isRef(type) && opaque(type);
  if (!params.some(wrap) && !wrap(info.results)) return name;
  // binaryen.js's any.convert_extern()/extern.convert_any() return the opcode
  // rather than an expression, so build ref.as through the C API.
  const refAs = (op, value) => binaryen._BinaryenRefAs(m.ptr, op, value);
  const args = params.map((type, i) => (wrap(type)
    ? m.ref.cast(refAs(binaryen.RefAsAnyConvertExtern, m.local.get(i, binaryen.externref)), type)
    : m.local.get(i, type)));
  let body = m.call(name, args, info.results);
  let result = info.results;
  if (wrap(info.results)) {
    body = refAs(binaryen.RefAsExternConvertAny, body);
    result = binaryen.externref;
  }
  const wrapper = `__export_${name}`;
  m.addFunction(wrapper, binaryen.createType(params.map(type => (wrap(type) ? binaryen.externref : type))), result, [], body);
  return wrapper;
}

function requiresConservativeSweep(functions, plan, typeIndex) {
  for (const fn of functions) {
    for (const node of [fn, ...fn.querySelectorAll('*')]) {
      const type = plan?.typeOf(node) ?? node?.attr?.('data-type-name');
      const entry = typeIndex.get(unwrapNullable(type ?? ''));
      if (entry?.kind === 'wasm-array' || /^wasm-gc-/.test(entry?.kind ?? '')
        || entry?.typeRepr === 'wasm-i31' || entry?.scalarFamily === 'v128') return true;
    }
  }
  return false;
}

function readDslWasmImports(root) {
  try {
    return JSON.parse(root.attr('data-dsl-wasm-imports') || '[]');
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
  if (stringMode !== 'native' && stringMode !== 'lowered') {
    throw new Error(`codegen: unknown stringMode ${JSON.stringify(stringMode)} (expected 'lowered' | 'native')`);
  }
  const m = buildModule(doc, { artifacts, sourceMap });
  try {
    validateModule(m, '');
    if (stringMode === 'lowered' && MODULE_REQUIREMENTS.get(m)?.strings) {
      // String lowering changes the ABI itself. Binaryen otherwise protects
      // "public" GC types, including closure environments exposed through
      // closure_new's funcref, and leaves stringref fields behind. Let this
      // representation pass rewrite the whole module, then restore the normal
      // optimizer's world assumptions before any dead-code/type optimization.
      const previousClosedWorld = binaryen.getClosedWorld();
      binaryen.setClosedWorld(true);
      try { m.runPasses(['string-lowering-magic-imports']); }
      finally { binaryen.setClosedWorld(previousClosedWorld); }
      // The lowering removes every stringref instruction. Leaving the proposal
      // enabled makes later optimization conservatively preserve shapes that a
      // reparsed lowered binary can shrink further.
      m.setFeatures(m.getFeatures() & ~binaryen.Features.Strings);
    }
    // -Oz and -O3 run Binaryen's full pipeline; -O0 skips it, for fast
    // development builds.
    const goal = doc.body.firstChild?.attr?.('data-optimize') ?? 'size';
    if (goal !== 'none') optimizeForDistribution(m, goal === 'speed' ? 'speed' : 'size');

    // Feature lowerings deliberately install a complete runtime ABI. The full
    // optimizer normally removes it; this explicit sweep pins that behavior for
    // simple scalar/string modules. See docs/import-reachability.md for the
    // conservative mixed-GC exception.
    if (!MODULE_REQUIREMENTS.get(m)?.conservativeSweep) {
      m.runPasses(['remove-unused-module-elements']);
    }
    validateModule(m, ' after feature lowering and module sweep');
    const sourceMapUrl = sourceMap ? (sourceMap === true ? 'module.wasm.map' : sourceMap) : undefined;
    const emitted = sourceMap ? m.emitBinary(sourceMapUrl) : m.emitBinary();
    const binary = sourceMap ? emitted.binary : emitted;
    noteBinarySize(artifacts, doc.body.firstChild, binary.length);
    return sourceMap ? { binary, sourceMap: emitted.sourceMap } : binary;
  } finally {
    m.dispose();
  }
}

function optimizeForDistribution(module, goal) {
  const previousOptimize = binaryen.getOptimizeLevel();
  const previousShrink = binaryen.getShrinkLevel();
  binaryen.setOptimizeLevel(3);
  binaryen.setShrinkLevel(goal === 'speed' ? 0 : 2);
  try {
    module.optimize();
    // -Oz: Binaryen's speed-maximal pipeline can retain shapes that a dedicated
    // -Oz pipeline makes smaller even when shrink level was already 2. Run the
    // compression pipeline to a second fixed point after -O3 has done its work.
    if (goal === 'speed') return;
    binaryen.setOptimizeLevel(2);
    module.optimize();
  } finally {
    binaryen.setOptimizeLevel(previousOptimize);
    binaryen.setShrinkLevel(previousShrink);
  }
}

/**
 * Compile-time options that callers must pass to WebAssembly.compile (or
 * WebAssembly.compileStreaming) when running a binary produced with the
 * default stringMode='lowered'. Re-exported so test harnesses and embedders
 * stay in sync with the lowering pass we run above.
 */
export const JS_STRING_BUILTINS_COMPILE_OPTIONS = Object.freeze({
  builtins: Object.freeze(['js-string']),
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
  try {
    return m.emitText();
  } finally {
    m.dispose();
  }
}

function validateModule(module, phase) {
  if (!module.validate()) {
    throw new Error(`codegen: binaryen validation failed${phase}\n${module.emitText()}`);
  }
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
