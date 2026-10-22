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

export async function main(command, fileArg, args) {
  if (!fileArg) throw new Error('missing file');
  const file = path.resolve(fileArg);
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
    const at = Math.max(args.indexOf('-o'), args.indexOf('--out'));
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
