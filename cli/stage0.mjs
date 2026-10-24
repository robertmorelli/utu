// cli/stage0.mjs — the commands that show stage 0's IR and graphs.
//
// Stage 0 (the JavaScript compiler) builds an HTML IR and graphs over it;
// these views are of those, so they run stage 0. `cli/utu.mjs` loads this
// file only for them.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompiler, initParser, formatDiagnostics, renderHighlightedSource } from '../src/index.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const DISPLAY_FILTERS = new Map([
  ['display:tests', new Set(['ir-test'])],
  ['display:benches', new Set(['ir-bench'])],
  ['display:modules', new Set(['ir-module'])],
  ['display:exports', new Set(['ir-export-lib', 'ir-export-main'])],
]);

/** `fail(title, code, notes, command)`: utu.mjs's, which says what went wrong and exits 1. */
export async function main(command, fileArg, args, fail) {
  if (!fileArg || fileArg.startsWith('-')) fail('No file', 'missing-file', [], `utu ${command} <file.utu>`);
  const file = path.resolve(fileArg);
  let stat = null;
  try { stat = await fs.stat(file); } catch {}
  if (!stat) fail(`No file ${fileArg}`, 'file-not-found');
  if (stat.isDirectory()) fail(`${fileArg} is a directory`, 'not-a-file');
  const at = Math.max(args.indexOf('-o'), args.indexOf('--out'));
  if (at >= 0 && command !== 'graph') fail(`${args[at]} is only for graph`, 'unknown-option', [`utu ${command} writes nothing.`]);
  if (at >= 0 && (args[at + 1] === undefined || args[at + 1].startsWith('-'))) {
    fail(`${args[at]} needs a file`, 'missing-output', [], `utu graph ${fileArg} ${args[at]} <out.html>`);
  }
  try {
    await show(command, file, args, at);
  } catch (error) {
    // Stage 0's own errors (an import it cannot find, a module a file lacks) carry a diagnostic.
    if (error?.diagnostic) fail(error.message, error.diagnostic.kind ?? 'error');
    if (error?.code && error.path) fail(`cannot ${error.syscall ?? 'use'} ${error.path}: ${error.code}`, 'file-error');
    throw error;
  }
}

async function show(command, file, args, at) {
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const compiler = createCompiler({
    parser, target: 'analysis',
    readFile: f => fs.readFile(f, 'utf8'),
    readBinaryFile: f => fs.readFile(f),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
    resolvePackage: async (specifier, request) =>
      (await import('../tools/dts/packages.mjs')).nodePackageResolver({ root: process.cwd() })(specifier, request),
  });
  const source = await fs.readFile(file, 'utf8');
  if (command === 'graph') {
    const { renderGraphHtml } = await import('../src/compiler/graph-html.js');
    const out = at >= 0 ? path.resolve(args[at + 1]) : path.resolve(`${path.basename(file, '.utu')}.graph.html`);
    let doc;
    try {
      ({ doc } = await compiler.analyzeFile(file));
    } catch (error) {
      doc = error.doc;
      if (!doc) throw error;
    }
    await fs.writeFile(out, renderGraphHtml(doc, source, file));
    console.error(`wrote ${out}`);
    return;
  }
  const analysis = await compiler.analyzeFile(file);
  if (command === 'display:debug' && analysis.artifacts.diagnostics.length) {
    console.log(await formatDiagnostics(analysis.artifacts.diagnostics, { readFile: f => fs.readFile(f, 'utf8'), snapshot: analysis.snapshot, color: colored() }));
    process.exitCode = 1;
    return;
  }
  const sectionTags = DISPLAY_FILTERS.get(command) ?? null;
  const rendered = renderHighlightedSource({
    file, source, snapshot: analysis.snapshot, sectionTags,
    showLineNumbers: sectionTags != null && !args.includes('--noln'),
    showDiagnostics: false,
    color: colored(),
  });
  if (rendered) console.log(rendered);
}

/** Stage 0's views are colored (as they always were) unless NO_COLOR is set, not empty. */
function colored() {
  return !process.env.NO_COLOR;
}
