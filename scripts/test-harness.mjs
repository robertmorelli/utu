import path from 'node:path';
import fs from 'node:fs/promises';
import { createCompiler, initParser } from '../src/index.js';
import { nodePackageResolver } from '../tools/dts/packages.mjs';

/** This process's scratch directory: test runner workers each get their own. */
export function testTmp(ROOT) {
  return path.join(ROOT, '.tmp', process.env.UTU_TEST_WORKER ?? '');
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}

export function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

export function assertThrows(fn, includes) {
  try {
    fn();
  } catch (err) {
    if (!includes || err.message.includes(includes)) return;
    throw new Error(`expected error containing ${JSON.stringify(includes)}, got ${JSON.stringify(err.message)}`);
  }
  throw new Error('expected function to throw');
}

export function assertNoErrors(ir) {
  const errs = ir.querySelectorAll('[data-error]');
  if (errs.length) {
    const msgs = [...errs].map(e => {
      const fn = e.closest?.('ir-fn')?.getAttribute('name');
      return `${fn ? `${fn}: ` : ''}${e.getAttribute('data-error')}`;
    }).join(', ');
    throw new Error(`IR has errors: ${msgs}`);
  }
}

// Loading the grammar costs more than most tests; one parser serves them all.
let sharedParser;

export async function makeCompiler({ ROOT, target, debugAssertions = false, optimize = 'size' }) {
  const parser = await (sharedParser ??= initParser({ wasmDir: `${ROOT}/` }));
  return createCompiler({
    parser,
    target,
    debugAssertions,
    optimize,
    readFile: (p) => fs.readFile(p, 'utf8'),
    readBinaryFile: (p) => fs.readFile(p),
    resolvePath: (from, rel) => path.resolve(path.dirname(from), rel),
    resolvePackage: nodePackageResolver({ root: ROOT }),
  });
}

export function createCompilerEnv({ parser, debugAssertions = false }) {
  return createCompiler({
    parser,
    debugAssertions,
    readFile: (p) => fs.readFile(p, 'utf8'),
    resolvePath: (from, rel) => path.resolve(path.dirname(from), rel),
  });
}

export async function withTempUtu(ROOT, name, source, run) {
  const file = path.join(testTmp(ROOT), name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, source);
  try {
    return await run(file);
  } finally {
    await fs.unlink(file).catch(() => {});
  }
}

export async function compileAndInstantiate({ ROOT, name, source, makeCompiler, assertNoErrors, imports = {} }) {
  const { emitBinary, instantiateLowered } = await import('../src/compiler/codegen/index.js');
  const { buildImportObject } = await import('../src/index.js');
  const compiler = await makeCompiler({ ROOT, target: 'normal' });
  return withTempUtu(ROOT, name, source, async (file) => {
    const doc = await compiler.compileFile(file);
    assertNoErrors(doc);
    const { instance } = await instantiateLowered(emitBinary(doc), mergeImports(await buildImportObject(doc), imports));
    return { doc, instance };
  });
}

// The self-hosted compiler, loaded once per worker: Wutu templates are built
// only by it (stage 0 refuses them).
let selfhost = null;
async function selfhostCompiler() {
  const { loadNodeCompiler } = await import('../src/selfhost/node.js');
  return selfhost ??= loadNodeCompiler();
}

/** A program's self-hosted diagnostics, each with the source text it points at. */
export async function selfhostDiagnostics({ ROOT, name = 'selfhost_diagnostics.utu', source }) {
  const { compileFile } = await import('../src/selfhost/node.js');
  const utu = await selfhostCompiler();
  return withTempUtu(ROOT, name, source, async (file) => {
    const { diagnostics } = await compileFile(utu, file);
    return diagnostics.map(d => ({ ...d, text: d.start == null ? null : source.slice(d.start, d.end) }));
  });
}

/** Build `source` with the self-hosted compiler and instantiate it (its exports as `instance.exports`). */
export async function compileAndInstantiateSelfhost({ ROOT, name, source, mode }) {
  const { compileFile } = await import('../src/selfhost/node.js');
  const { instantiate } = await import('../src/selfhost/compiler.js');
  const utu = await selfhostCompiler();
  return withTempUtu(ROOT, name, source, async (file) => {
    const result = await compileFile(utu, file, mode ? { mode } : {});
    const errors = result.diagnostics.filter(d => d.severity !== 'warning');
    if (!result.wasm || errors.length) throw new Error(errors.map(d => `${d.kind}: ${d.message} at ${source.slice(d.start, d.end)}`).join('\n') || 'no module');
    return { instance: await instantiate(result.wasm, result.spec), diagnostics: result.diagnostics, spec: result.spec };
  });
}

export function mergeImports(base, overrides) {
  const merged = { ...base };
  for (const [module, fields] of Object.entries(overrides ?? {})) {
    merged[module] = { ...(merged[module] ?? {}), ...(fields ?? {}) };
  }
  return merged;
}
