import path from 'node:path';
import fs from 'node:fs/promises';
import { createCompiler, initParser } from '../src/index.js';

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

export async function makeCompiler({ ROOT, target, debugAssertions = false }) {
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  return createCompiler({
    parser,
    target,
    debugAssertions,
    readFile: (p) => fs.readFile(p, 'utf8'),
    resolvePath: (from, rel) => path.resolve(path.dirname(from), rel),
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
  const file = path.join(ROOT, '.tmp', name);
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
    const { instance } = await instantiateLowered(emitBinary(doc), mergeImports(buildImportObject(doc), imports));
    return { doc, instance };
  });
}

export function mergeImports(base, overrides) {
  const merged = { ...base };
  for (const [module, fields] of Object.entries(overrides ?? {})) {
    merged[module] = { ...(merged[module] ?? {}), ...(fields ?? {}) };
  }
  return merged;
}
