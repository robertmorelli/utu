#!/usr/bin/env node
// tools/utudoc/utudoc.mjs — a codebase as a PDF, from its Typst doc comments.
//
//   node tools/utudoc/utudoc.mjs <paths…> [-o docs.pdf] [--title "…"] [--typ docs.typ]
//
// Every .utu file under the paths is built by the self-hosted compiler, and
// its declarations (modules, types, functions, globals, and their fields,
// variants, and methods) go into one Typst document: each with its
// signature, colored as the compiler reads it (keywords, types, functions,
// strings) and with the names it uses linked to their declarations, then
// its doc comment, which is Typst already (selfhost/tools/docs.utu). A file's
// `//!` comment opens its section; a later `//!` block is set where it is.
// `typst compile` makes the PDF; without typst, the .typ is written for later.
//
// The document is made by selfhost/tools/utudoc.utu, in dist/utu.wasm,
// from what each build leaves (the declarations, the tokens, what names
// resolve to); this reads the files, hands it each build's doc comments and
// colors, writes the .typ, and runs typst.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compile } from '../../src/selfhost/compiler.js';
import { loadNodeCompiler, nodeHost } from '../../src/selfhost/node.js';
import { highlighter } from '../../src/selfhost/highlight.js';

async function main() {
  const args = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const out = path.resolve(option('-o') ?? 'docs.pdf');
  const typFile = path.resolve(option('--typ') ?? out.replace(/\.pdf$/, '') + '.typ');
  const title = option('--title') ?? path.basename(path.resolve(args[0] ?? '.'));
  if (!args.length) {
    console.error('usage: utudoc <paths…> [-o docs.pdf] [--title "…"] [--typ docs.typ]');
    process.exit(2);
  }
  const entries = [];
  const walk = async target => {
    const stat = await fs.stat(target);
    if (stat.isFile()) { if (target.endsWith('.utu')) entries.push(path.resolve(target)); return; }
    for (const entry of await fs.readdir(target, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git'].includes(entry.name) || entry.name.startsWith('.')) continue;
      await walk(path.join(target, entry.name));
    }
  };
  // The files named keep their order (a reading order); a directory's are sorted.
  for (const target of args) {
    const from = entries.length;
    try {
      await walk(target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      console.error(`utudoc: there is no ${target}`);
      process.exit(2);
    }
    entries.push(...entries.splice(from).sort().filter(entry => !entries.includes(entry)));
  }
  // Files are named from the directory all of them are in.
  const base = entries.reduce((dir, file) => {
    while (!file.startsWith(`${dir}${path.sep}`) && dir !== path.dirname(dir)) dir = path.dirname(dir);
    return dir;
  }, path.dirname(entries[0] ?? '.'));

  const utu = await loadNodeCompiler();
  const documented = new Set();
  let declarations = 0;
  for (const entry of entries) {
    const built = await compile(utu, entry, { ...nodeHost({ root: path.dirname(entry) }), target: 'normal', optimize: 'none' });
    // A file that does not parse has nothing to document: say so.
    const unparsed = built.diagnostics.filter(d => d.kind === 'parse-error');
    if (unparsed.length) {
      const { formatDiagnostics } = await import('../../src/selfhost/format.js');
      console.error(formatDiagnostics(unparsed, new Map(built.files.map(f => [f.key, f.text])), { relative: displayPath }));
      console.error(`utudoc: skipping ${displayPath(entry)}, which does not parse`);
      continue;
    }
    const own = built.files.filter(f => f.role !== 2 && !f.key.startsWith('std:') && entries.includes(f.key) && !documented.has(f.key));
    if (!own.length) continue;
    // What the document needs of this build, while the compiler holds it.
    utu.doc_build(built.files.map(f => f.key).join('\n'));
    const paint = highlighter(utu, built.files);
    for (const file of own) {
      documented.add(file.key);
      const n = utu.doc_file(built.files.indexOf(file), path.relative(base, file.key) || path.basename(file.key), displayPath(file.key), file.text);
      utu.doc_pieces(paint(file.key, 0, file.text.length + 1).map(piece => `${piece.start} ${piece.end} ${piece.class}`).join('\n'));
      declarations += n;
    }
  }

  const document = utu.doc_write(title, entries.length);
  await fs.writeFile(typFile, document);
  // Typst reads only the document: its root is a directory holding nothing
  // else, so a doc comment cannot `#read` the machine's files.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'utudoc-'));
  await fs.copyFile(typFile, path.join(root, 'docs.typ'));
  const typst = spawnSync('typst', ['compile', '--root', root, 'docs.typ', out], { encoding: 'utf8', cwd: root });
  await fs.rm(root, { recursive: true, force: true });
  if (typst.error) {
    console.log(`wrote ${displayPath(typFile)} (typst is not installed: \`typst compile ${displayPath(typFile)}\` makes the PDF)`);
    return;
  }
  if (typst.status !== 0) {
    // Its errors name a line of the .typ: each doc comment is marked with
    // where it is, and is its lines as written, so the source line is found.
    const typLines = document.split('\n');
    const sourceOf = line => {
      for (let i = line - 2; i >= 0; i--) {
        const mark = /^\/\/ (.+):(\d+)$/.exec(typLines[i]);
        if (mark) return `${mark[1]}:${Number(mark[2]) + line - i - 2}`;
        if (/^(=|#heading|#block)/.test(typLines[i])) return null;
      }
      return null;
    };
    process.stderr.write(typst.stderr.replace(/docs\.typ:(\d+):(\d+)/g, (_, line, column) => {
      const source = sourceOf(Number(line));
      return `${displayPath(typFile)}:${line}:${column}${source ? ` (the doc comment at ${source})` : ''}`;
    }));
    console.error(`typst could not typeset ${displayPath(typFile)}: a doc comment's Typst is wrong where it says`);
    process.exit(1);
  }
  console.log(`wrote ${displayPath(out)}: ${documented.size} file${documented.size === 1 ? '' : 's'}, ${declarations} declarations`);
}

function displayPath(key) {
  const relative = path.relative(process.cwd(), key);
  return relative.length < key.length ? relative : key;
}

main().catch(error => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
