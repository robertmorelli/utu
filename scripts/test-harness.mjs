import path from 'node:path';
import fs from 'node:fs/promises';
import { compileFile, instantiateNode, loadNodeCompiler } from '../src/selfhost/node.js';

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

export function assertNoErrors(result) {
  const errors = result.diagnostics?.filter(diagnostic => diagnostic.severity === 'error') ?? [];
  if (errors.length || !result.wasm) throw new Error(errors.map(diagnostic => diagnostic.message).join(', ') || 'no module');
}

let selfhost = null;
async function selfhostCompiler() {
  return selfhost ??= loadNodeCompiler();
}

export async function makeCompiler({ ROOT, target = 'normal', debugAssertions = false, optimize = 'size' }) {
  const utu = await selfhostCompiler();
  const options = { root: ROOT, target: target === 'analysis' ? 'normal' : target, optimize, safe: debugAssertions };
  const compile = async file => {
    const result = await compileFile(utu, file, options);
    const diagnostics = result.diagnostics.map(diagnostic => ({
      ...diagnostic,
      primary: diagnostic.file ? {
        file: diagnostic.file, row: diagnostic.line,
        column: diagnostic.column, start: diagnostic.start, end: diagnostic.end,
      } : null,
    }));
    return { ...result, diagnostics, artifacts: { diagnostics } };
  };
  return { compileFile: compile, analyzeFile: compile };
}

export async function createCompilerEnv({ ROOT, debugAssertions = false }) {
  return makeCompiler({ ROOT, debugAssertions });
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
  const compiler = await makeCompiler({ ROOT, target: 'normal' });
  return withTempUtu(ROOT, name, source, async file => {
    const result = await compiler.compileFile(file);
    assertNoErrors(result);
    const built = await instantiateNode(result.wasm, result.spec, {
      root: ROOT,
      wrap: base => Object.assign(base, mergeImports(base, imports)),
    });
    return { doc: result, instance: { exports: built.exports }, result };
  });
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
