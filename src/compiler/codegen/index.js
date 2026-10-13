// codegen/index.js — emit a compiled IR document as a wasm binary
//
// Pipeline (the module is built with ../wasm, the backend):
//   1. Register every top-level ir-struct as a heap type via TypeBuilder.
//      (Struct registration + struct.* emit live in ./structs.js — this file
//      stays an orchestrator.)
//   2. Build a fn-id → ir-fn lookup so call sites can resolve their target.
//   3. Walk every top-level ir-fn that isn't a std-lib intrinsic wrapper and
//      emit it into a wasm Module.
//   4. Export each fn marked `data-export="wasm"` (came from `export lib`)
//      and `data-export="main"` (came from `export main`).
//   5. Clean up locals (-Oz, -O3), encode, and validate with the engine.
//      Caller can WebAssembly.instantiate the result.

import {
  wasm,
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
import { optimizeModule } from '../wasm/optimize.js';
import { childrenOf } from '../ir-helpers.js';

/**
 * @param {Document} doc  fully-analysed IR (target='normal')
 * @param {{ artifacts?: object }} [opts]
 * @returns {import('../wasm/module.js').Module}
 */
export function buildModule(doc, { artifacts = null, sourceMap = false } = {}) {
  const m = moduleWithMemories(readMems(doc.body.firstChild));
  populateModule(m, doc, { artifacts, sourceMap });
  // -Oz and -O3 clean up the locals lowerings leave; -O0 emits codegen's output as is.
  if ((doc.body.firstChild?.attr?.('data-optimize') ?? 'size') !== 'none') optimizeModule(m);
  return m;
}

function populateModule(m, doc, { artifacts, sourceMap }) {
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
  const toType             = mapType;
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
    globals: new Map(),
    typeOf: node => plan?.typeOf(node) ?? node?.attr?.('data-type-name') ?? null,
    expectedOf: node => plan?.expectedOf(node) ?? node?.attr?.('data-expect') ?? node?.attr?.('data-expected-type') ?? null,
    bindingIdOf: node => plan?.bindingIdOf(node) ?? node?.attr?.('data-binding-id') ?? null,
    callTargetIdOf: node => plan?.callTargetIdOf(node) ?? node?.attr?.('data-fn-id') ?? null,
    fieldOf: node => plan?.fieldOf(node) ?? null,
    debug: sourceMap ? createDebugInfo(m) : null,
  };

  for (const { spec } of plan?.runtime.dslImports ?? readDslWasmImports(root)) {
    const params = wasm.createType((spec.params ?? []).map(type => toType(type)));
    const result = toType(spec.result ?? 'void');
    m.addFunctionImport(spec.localName ?? spec.name, spec.module, spec.name, params, result);
  }

  declareMemoryGlobals(m, readMems(root));

  // Host closure imports must exist before any body that calls them.
  installClosureImports(m, root, ctx);

  // Wasm globals must have constant initializers. Source globals currently
  // support literal scalar/reference constants; reject richer initializers at
  // codegen with a direct error instead of an invalid module.
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
  for (const fn of emittableFunctions) emitFn(fn, ctx);

  // Exports
  for (const fn of plan?.exports ?? root.querySelectorAll(':scope > ir-fn[data-export]')) {
    const name = fn.getAttribute('name');
    if (name) {
      m.addFunctionExport(exportOpaque(m, name), name);
      noteExport(artifacts, fn, name, fn.attr('data-export') ?? 'unknown');
    }
  }
}

/**
 * utu structs and arrays cross the JS boundary as opaque handles. An export
 * whose signature mentions them gets a wrapper taking and returning externref
 * (the same JS-visible object), so no GC type becomes part of the module's
 * public interface. Returns the name of the function to export.
 */
function exportOpaque(m, name) {
  const fn = m.getFunction(name);
  const params = wasm.expandType(fn.params);
  // A reference to a struct, array, or i31: in the `any` hierarchy.
  const wrap = type => type.kind === 'ref' && wasm.isAnyReference(type);
  if (!params.some(wrap) && !wrap(fn.results)) return name;
  const args = params.map((type, i) => (wrap(type)
    ? m.ref.cast(m.any.convert_extern(m.local.get(i, wasm.externref)), type)
    : m.local.get(i, type)));
  let body = m.call(name, args, fn.results);
  let result = fn.results;
  if (wrap(fn.results)) {
    body = m.extern.convert_any(body);
    result = wasm.externref;
  }
  const wrapper = `__export_${name}`;
  m.addFunction(wrapper, wasm.createType(params.map(type => (wrap(type) ? wasm.externref : type))), result, [], body);
  return wrapper;
}

function readDslWasmImports(root) {
  try {
    return JSON.parse(root.attr('data-dsl-wasm-imports') || '[]');
  } catch {
    return [];
  }
}

/**
 * Build and emit a wasm binary for `doc`; throws if the engine finds it
 * invalid.
 *
 * Strings are JS strings: string operations call the JS string builtins
 * (`wasm:js-string`) and string constants are imported from the `'` module,
 * which engines given JS_STRING_BUILTINS_COMPILE_OPTIONS provide natively.
 *
 * `sourceMap`, when truthy, returns `{ binary, sourceMap }` instead of the
 * bare Uint8Array. Pass a string to control the embedded sourceMappingURL
 * (defaults to 'module.wasm.map').
 *
 * @param {Document} doc
 * @param {{ artifacts?: object, sourceMap?: boolean | string }} [opts]
 * @returns {Uint8Array | { binary: Uint8Array, sourceMap: string }}
 */
export function emitBinary(doc, { artifacts = null, sourceMap = false } = {}) {
  const m = buildModule(doc, { artifacts, sourceMap });
  const sourceMapUrl = sourceMap ? (sourceMap === true ? 'module.wasm.map' : sourceMap) : undefined;
  const emitted = m.emitBinary(sourceMapUrl);
  const binary = sourceMap ? emitted.binary : emitted;
  noteBinarySize(artifacts, doc.body.firstChild, binary.length);
  return sourceMap ? { binary, sourceMap: emitted.sourceMap } : binary;
}

/**
 * Compile-time options that callers pass to WebAssembly.compile (or
 * WebAssembly.compileStreaming) so the engine provides the JS string builtins
 * and string constants a binary imports. Exported so test harnesses and
 * embedders stay in sync with codegen.
 */
export const JS_STRING_BUILTINS_COMPILE_OPTIONS = Object.freeze({
  builtins: Object.freeze(['js-string']),
  importedStringConstants: "'",
});

/**
 * Convenience wrapper around WebAssembly.compile + WebAssembly.instantiate
 * that supplies the JS-String-Builtins compile options.
 *
 * @param {Uint8Array} bytes
 * @param {object} [importObject]
 */
export async function instantiateLowered(bytes, importObject = {}) {
  const mod = await WebAssembly.compile(bytes, JS_STRING_BUILTINS_COMPILE_OPTIONS);
  const instance = await WebAssembly.instantiate(mod, importObject);
  return { module: mod, instance };
}

/** The module for `doc` as wasm text. */
export function emitText(doc, { artifacts = null } = {}) {
  return buildModule(doc, { artifacts }).emitText();
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
