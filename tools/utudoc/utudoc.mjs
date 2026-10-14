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
// its doc comment, which is Typst already (src/selfhost/docs.js). A file's
// `//!` comment opens its section. `typst compile` makes the PDF; without
// typst, the .typ is written for later.
//
// This is a tool that uses the compiler: it reads what a build leaves (the
// declarations, the tokens, what names resolve to) and adds nothing to it.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { compile } from '../../src/selfhost/compiler.js';
import { loadNodeCompiler, nodeHost } from '../../src/selfhost/node.js';
import { programIndex } from '../../src/selfhost/query.js';
import { highlighter } from '../../src/selfhost/highlight.js';
import { docComments } from '../../src/selfhost/docs.js';

// What a section documents, and what goes under its parent.
const TOP = new Set(['Module', 'Struct', 'Enum', 'IntEnum', 'Proto', 'TypeDecl', 'Distinct', 'Fn', 'Main', 'Global', 'Mem']);
const MEMBER = new Set(['Field', 'Variant', 'ProtoMember', 'Fn', 'Struct', 'Enum', 'IntEnum', 'TypeDecl', 'Global']);
// Shown whole (their members are part of them), or up to their body.
const WHOLE = new Set(['Struct', 'Enum', 'IntEnum', 'Proto', 'TypeDecl', 'Distinct', 'Mem', 'Field', 'Variant', 'ProtoMember']);

const COLORS = { keyword: '#8b2fa3', type: '#0b7285', function: '#1c5fbf', string: '#2b8a3e', number: '#b35c00', comment: '#868e96', constant: '#b35c00', parameter: '#495057', dsl: '#2b8a3e' };

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
  for (const target of args) await walk(target);
  entries.sort();

  const utu = await loadNodeCompiler();
  const sections = new Map();  // file key → its section's Typst
  const labels = new Map();    // `${file}\0${start}` → label
  const label = (file, start) => {
    const key = `${file}\0${start}`;
    if (!labels.has(key)) labels.set(key, `utu-${labels.size}`);
    return labels.get(key);
  };
  // Labels are given out before any section is written, so a name can link
  // to a declaration in a file documented later: two passes.
  const plans = [];
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
    const own = built.files.filter(f => f.role !== 2 && !f.key.startsWith('std:') && entries.includes(f.key) && !sections.has(f.key));
    if (!own.length) continue;
    const index = programIndex(utu, built.files);
    const docs = docComments(utu, built.files);
    const paint = highlighter(utu, built.files);
    for (const file of own) {
      sections.set(file.key, null);
      const items = documentable(index, file.key);
      for (const item of items) label(file.key, item.definition.start);
      plans.push({ file, items: items.map(item => ({
        ...item,
        doc: docs.declaration(item.decl),
        signature: signature(file.text, item),
        pieces: null,
      })), fileDoc: docs.file(file.key), paint, index });
      // The signature's colors and links, while this build is the one the compiler holds.
      for (const item of plans.at(-1).items) {
        const { start, end } = item.signature;
        item.pieces = paint(file.key, start, end);
        item.links = index.names(file.key)
          .filter(name => name.at.start >= start && name.at.end <= end)
          .map(name => ({ at: name.at, target: index.definition(name.decl) }))
          .filter(link => link.target && !(link.target.file === file.key && link.target.start === link.at.start));
      }
    }
  }

  // Files are named from the directory all of them are in.
  const base = entries.reduce((dir, file) => {
    while (!file.startsWith(`${dir}${path.sep}`) && dir !== path.dirname(dir)) dir = path.dirname(dir);
    return dir;
  }, path.dirname(entries[0] ?? '.'));

  // Which declarations get a section: a field or variant is in its parent's
  // signature, and on its own only with something to say. Only these are linked to.
  const shown = new Set();
  for (const { file, items } of plans) {
    const docBelow = new Set(items.filter(item => item.doc).map(item => item.parent));
    for (const item of items) {
      if (item.parent >= 0 && WHOLE.has(item.kind) && !item.doc && !docBelow.has(item.decl)) continue;
      shown.add(label(file.key, item.definition.start));
    }
  }

  // `@Name` in a doc comment links to the declaration named so (in its own file first).
  const named = new Map();
  for (const { file, items } of plans) for (const item of items) {
    if (!shown.has(label(file.key, item.definition.start))) continue;
    if (!named.has(item.name)) named.set(item.name, []);
    named.get(item.name).push(label(file.key, item.definition.start));
  }
  const ownNames = new Map(plans.map(({ file, items }) => [file.key, new Map(items
    .filter(item => shown.has(label(file.key, item.definition.start)))
    .map(item => [item.name, label(file.key, item.definition.start)]))]));
  const references = (key, doc) => doc.replace(/(^|[^\w@\\])@([A-Za-z_]\w*)/g, (_, before, name) => {
    const target = ownNames.get(key).get(name) ?? named.get(name)?.[0];
    return `${before}${target ? `#link(<${target}>)[#raw(${typstString(name)})]` : `#raw(${typstString(name)})`}`;
  });

  for (const { file, items, fileDoc } of plans) {
    const lines = [`= ${typstText(path.relative(base, file.key) || path.basename(file.key))} <${label(file.key, -1)}>`, ''];
    if (fileDoc) lines.push(references(file.key, fileDoc), '');
    const children = new Map();
    for (const item of items) {
      if (item.parent >= 0) {
        if (!children.has(item.parent)) children.set(item.parent, []);
        children.get(item.parent).push(item);
      }
    }
    const write = (item, depth) => {
      if (!shown.has(label(file.key, item.definition.start))) return;
      const heading = '='.repeat(Math.min(depth, 4));
      lines.push(`${heading} #raw(${typstString(item.name)}) #h(0.5em) #text(size: 0.7em, fill: luma(120), smallcaps[${kindName(item.kind)}]) <${label(file.key, item.definition.start)}>`);
      lines.push(`#block(fill: luma(246), inset: (x: 8pt, y: 6pt), radius: 3pt, width: 100%, breakable: true)[${signatureMarkup(file, item, labels, shown)}]`);
      if (item.doc) lines.push('', references(file.key, item.doc));
      lines.push('');
      for (const child of children.get(item.decl) ?? []) write(child, depth + 1);
    };
    for (const item of items.filter(item => item.parent < 0)) write(item, 2);
    sections.set(file.key, lines.join('\n'));
  }

  const document = [
    `#set document(title: ${typstString(title)})`,
    '#set page(numbering: "1", margin: (x: 2cm, y: 2.2cm))',
    '#set text(size: 10pt)',
    '#set heading(numbering: "1.1")',
    '#show heading.where(level: 1): it => { pagebreak(weak: true); it; v(0.3em) }',
    '#show raw: set text(size: 9pt)',
    '#show link: set text(fill: rgb("#1c5fbf"))',
    '',
    `#align(center)[#text(size: 22pt, weight: "bold")[${typstText(title)}] \\ #text(fill: luma(120))[${entries.length} file${entries.length === 1 ? '' : 's'}, documented by utudoc]]`,
    '#v(1em)',
    '#outline(depth: 2, title: none)',
    '',
    ...[...sections.values()].filter(Boolean),
  ].join('\n');
  await fs.writeFile(typFile, document);
  const typst = spawnSync('typst', ['compile', '--root', '/', typFile, out], { encoding: 'utf8' });
  if (typst.error) {
    console.log(`wrote ${displayPath(typFile)} (typst is not installed: \`typst compile ${displayPath(typFile)}\` makes the PDF)`);
    return;
  }
  if (typst.status !== 0) {
    process.stderr.write(typst.stderr);
    console.error(`typst could not typeset ${displayPath(typFile)}: a doc comment's Typst is wrong where it says`);
    process.exit(1);
  }
  const count = plans.reduce((n, plan) => n + plan.items.length, 0);
  console.log(`wrote ${displayPath(out)}: ${plans.length} file${plans.length === 1 ? '' : 's'}, ${count} declarations`);
}

/** A file's declarations worth a section, in source order: { decl, kind, name, definition, span, parent }. */
function documentable(index, key) {
  const items = [];
  const kept = new Set();
  for (const { decl, kind, owner, span } of index.declarations(key)) {
    const definition = index.definition(decl);
    if (!definition || definition.file !== key) continue;
    const name = index.text(definition);
    if (!/^[A-Za-z_]\w*$/.test(name)) continue;
    const parent = owner >= 0 && kept.has(owner) && MEMBER.has(kind) ? owner : -1;
    if (parent < 0 && (!TOP.has(kind) || owner >= 0 && index.kind(owner) !== 'Module')) continue;
    kept.add(decl);
    items.push({ decl, kind, name, definition, span, parent });
  }
  return items.sort((a, b) => a.span.start - b.span.start);
}

/** Where a declaration's signature is: all of it, or up to its body. */
function signature(text, item) {
  const { start, end } = item.span;
  if (WHOLE.has(item.kind)) return { start, end: trimEnd(text, start, end) };
  let depth = 0;
  for (let i = start; i < end; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && (c === '{' || (c === '=' && item.kind === 'Global'))) return { start, end: trimEnd(text, start, i) };
  }
  return { start, end: trimEnd(text, start, end) };
}

function trimEnd(text, start, end) {
  while (end > start && /[\s;]/.test(text[end - 1])) end--;
  return end;
}

/** A signature as Typst: monospace, colored, its names linked, its lines as written (dedented). */
function signatureMarkup(file, item, labels, shown) {
  const { start, end } = item.signature;
  const text = file.text;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const indent = start - lineStart;
  const linkAt = new Map(item.links.map(link => [link.at.start, link]));
  const pieceAt = new Map(item.pieces.map(piece => [piece.start, piece]));
  const out = [];
  let plain = '';
  const flush = () => { if (plain) out.push(`#raw(${typstString(plain)})`); plain = ''; };
  for (let i = start; i < end;) {
    if (text[i] === '\n') {
      flush();
      out.push('#linebreak()');
      i++;
      // The declaration's own indentation, off each later line.
      let k = 0;
      while (k < indent && (text[i] === ' ' || text[i] === '\t')) { i++; k++; }
      continue;
    }
    const piece = pieceAt.get(i);
    const link = linkAt.get(i);
    // Doc comments are typeset below the signature, not in it: their lines go.
    if (piece?.class === 'comment' && text.startsWith('///', i)) {
      flush();
      while (out.length && /^#raw\("\s*"\)$/.test(out.at(-1))) out.pop();
      if (out.at(-1) === '#linebreak()') out.pop();
      i = piece.end;
      continue;
    }
    if (piece || link) {
      flush();
      const stop = Math.min(end, (piece ?? link.at).end);
      let markup = `#raw(${typstString(text.slice(i, stop))})`;
      const color = COLORS[piece?.class ?? (link ? 'type' : '')];
      if (color) markup = `#text(fill: rgb("${color}"))[${markup}]`;
      const target = link && labels.get(`${link.target.file}\0${link.target.start}`);
      if (target && shown.has(target)) markup = `#link(<${target}>)[${markup}]`;
      out.push(markup);
      i = stop;
      continue;
    }
    plain += text[i] === '\t' ? '    ' : text[i];
    i++;
  }
  flush();
  return out.join('');
}

function kindName(kind) {
  return { Fn: 'function', Main: 'main', Module: 'module', Struct: 'struct', Enum: 'enum', IntEnum: 'enum', Proto: 'protocol',
    TypeDecl: 'type', Distinct: 'type', Global: 'constant', Mem: 'mem', Field: 'field', Variant: 'variant', ProtoMember: 'requirement' }[kind] ?? kind.toLowerCase();
}

/** A Typst string literal. */
function typstString(text) {
  return `"${[...text].map(c => c === '\\' ? '\\\\' : c === '"' ? '\\"' : c === '\n' ? '\\n' : c === '\t' ? '\\t'
    : c.charCodeAt(0) < 32 ? `\\u{${c.charCodeAt(0).toString(16)}}` : c).join('')}"`;
}

/** Text in Typst markup, its markup characters escaped. */
function typstText(text) {
  return text.replace(/[\\#*_`$<>@=\[\]~/-]/g, c => `\\${c}`);
}

function displayPath(key) {
  const relative = path.relative(process.cwd(), key);
  return relative.length < key.length ? relative : key;
}

main().catch(error => {
  console.error(error?.stack ?? error);
  process.exit(1);
});
