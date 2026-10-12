// Diagnostics across file boundaries: missing files and modules, syntax
// errors inside imported files, and recovered syntax in export surfaces.
import fs from 'node:fs/promises';
import path from 'node:path';
import { testTmp } from './test-harness.mjs';

async function tempDir(ROOT, prefix) {
  await fs.mkdir(path.join(testTmp(ROOT)), { recursive: true });
  return fs.mkdtemp(path.join(testTmp(ROOT), prefix));
}

/** Write `files` into a fresh directory under .tmp and analyze `entry`. */
async function analyzeProject(compiler, ROOT, files, entry = 'main.utu') {
  const dir = await tempDir(ROOT, 'imports-');
  try {
    for (const [name, source] of Object.entries(files)) await fs.writeFile(path.join(dir, name), source);
    let diagnostics;
    try {
      diagnostics = (await compiler.analyzeFile(path.join(dir, entry))).artifacts.diagnostics;
    } catch (error) {
      diagnostics = error.artifacts?.diagnostics ?? [error.diagnostic ?? { kind: 'crash', message: error.message }];
    }
    return diagnostics.map(d => ({
      ...d,
      fileName: d.primary?.file ? path.basename(d.primary.file) : null,
      text: d.primary?.start == null ? null : files[path.basename(d.primary.file ?? '')]?.slice(d.primary.start, d.primary.end),
    }));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export function registerImportDiagnosticTests({ test, assert, assertEq, makeCompiler }) {
  const kinds = diagnostics => diagnostics.map(d => `${d.kind}@${d.fileName}:${d.primary?.row}`).join(', ');

  test('imports: missing files report unknown-import at the using declaration', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const diagnostics = await analyzeProject(compiler, ROOT, {
      'main.utu': 'using ui from "./does-not-exist.utu";\nexport main() I32 { 1; }\n',
    });
    const missing = diagnostics.find(d => d.kind === 'unknown-import');
    assert(missing, kinds(diagnostics));
    assert(missing.text.startsWith('using ui from "./does-not-exist.utu"'), missing.text);
    assert(missing.message.includes('file not found'), missing.message);
  });

  test('imports: a missing module names the modules the file does define', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const diagnostics = await analyzeProject(compiler, ROOT, {
      'main.utu': 'using shapes from "./lib.utu";\nexport main() I32 { 1; }\n',
      'lib.utu': 'mod shape {\n    fn one() I32 { 1; }\n}\nmod color {\n    fn two() I32 { 2; }\n}\n',
    });
    const missing = diagnostics.find(d => d.kind === 'unknown-import');
    assert(missing, kinds(diagnostics));
    assertEq(missing.fileName, 'main.utu');
    assert(missing.message.includes("defines 'shape', 'color'"), missing.message);
  });

  test('imports: syntax errors inside imported files are reported in that file, once', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    for (const lib of [
      'mod lib {\n    fn f() I32 { let x = ; x; }\n}\n',
      'fn stray( {\n',
    ]) {
      const diagnostics = await analyzeProject(compiler, ROOT, {
        'main.utu': 'using lib from "./lib.utu";\nexport main() I32 { 1; }\n',
        'lib.utu': lib,
      });
      const errors = diagnostics.filter(d => d.severity === 'error');
      assert(errors.length >= 1 && errors.every(d => d.kind === 'parse-error' && d.fileName === 'lib.utu'), kinds(diagnostics));
      assert(!errors.some(d => /parse error\(s\)/.test(d.message)), 'no generic summary alongside the located errors');
    }
  });

  test('syntax: an entry-file parse error is reported once, at its location', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'analysis' });
    const diagnostics = await analyzeProject(compiler, ROOT, { 'main.utu': 'export main() I32 {\n    let x = ;\n}\n' });
    const errors = diagnostics.filter(d => d.severity === 'error');
    assertEq(errors.length, 1, kinds(diagnostics));
    assertEq(errors[0].primary.row, 2);
  });

  test('export lib: recovered syntax errors report parse errors under the codegen target', async ({ ROOT }) => {
    const compiler = await makeCompiler({ ROOT, target: 'normal' });
    for (const source of ['export lib { fn a() I32 { 1; } ) }', 'export lib { 5; fn b() I32 { 2; } }']) {
      const dir = await tempDir(ROOT, 'lib-');
      try {
        await fs.writeFile(path.join(dir, 'main.utu'), source);
        const doc = await compiler.compileFile(path.join(dir, 'main.utu'));
        assertEq(doc.body.firstChild?.dataset.error, 'parse-error', source);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });
}
