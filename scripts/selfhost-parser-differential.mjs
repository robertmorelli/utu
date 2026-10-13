// The self-hosted parser (selfhost/parse.utu) against the stage 0 parser:
// both accept the same sources, and for each one they accept, the named
// nodes (comments included) are the same, in the same order, with the same
// spans and depths.
//
//   node scripts/selfhost-parser-differential.mjs [files…] [--fuzz=N] [--seed=N] [--show=N]
//
// Defaults to every .utu file under examples/, benchmarks/, std/,
// hand_written_bindings/, and baselines/corpus. --fuzz=N adds N mutants of
// each (characters deleted, duplicated, or swapped, or words and operators
// inserted).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSyntax } from '../src/compiler/syntax/parser.js';
import { loadSelfhost } from './selfhost.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const fuzz = Number(flag('fuzz') ?? 0);
const seedBase = Number(flag('seed') ?? 0);
const show = Number(flag('show') ?? 10);
const inputs = process.argv.slice(2).filter(arg => !arg.startsWith('--'));

const INSERTS = [' -o ', '-o', '?.', '?', ' in ', ' type ', ' test ', ' and ', ' not ', ' return ', ' fatal ',
  '&=', '|=', '=>', '|', '-', 'o', '>>=', '<<=', '>>>=', '..<', '...', '.5', '0x', '0b', 'e5', '"', '\\\\', '/\\', '\\/', '//',
  ' map ', ' fold(0) ', '.{', '[', ']', '(', ')', '{', '}', ',', ';', ':', ' let ', ' if ', ' else ', ' cl() ', '&', '.'];

const utu = await loadSelfhost();
const names = new Map();
const nameOf = kind => names.get(kind) ?? names.set(kind, utu.node_kind_name(kind)).get(kind);

const roots = inputs.length ? inputs : ['examples', 'benchmarks', 'std', 'hand_written_bindings', 'baselines/corpus']
  .map(dir => path.join(ROOT, dir));
const files = roots.flatMap(utuFiles).sort();
let checked = 0;
let differ = 0;
let rejected = 0;
const started = performance.now();
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const [name, text] of [[path.relative(ROOT, file), source], ...mutants(source, fuzz).map((m, i) => [`${path.relative(ROOT, file)}#mutant${i}`, m])]) {
    checked++;
    const tree = parseSyntax(text);
    const problem = compare(tree, parse(text), text);
    if (!tree) rejected++;
    if (problem) {
      differ++;
      if (differ <= show) console.log(`DIFFERS ${name}: ${problem}`);
    }
  }
}
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`${checked - differ}/${checked} sources parse as stage 0 parses them (${rejected} both reject) in ${seconds} s`);
process.exit(differ ? 1 : 0);


/** The self-hosted parser's named nodes for `text`, in preorder, or null when it rejects the source. */
function parse(text) {
  const bytes = new TextEncoder().encode(text);
  utu.source(bytes.length);
  new Uint8Array(utu.src.buffer).set(bytes);
  const root = utu.nodes(bytes.length);
  if (root < 0) return null;
  const view = (mem, Type) => new Type(mem.buffer);
  const kind = view(utu.node_kind, Uint8Array);
  const first = view(utu.node_first, Int32Array);
  const last = view(utu.node_last, Int32Array);
  const child = view(utu.node_child, Int32Array);
  const next = view(utu.node_next, Int32Array);
  const starts = view(utu.tok_start, Int32Array);
  const ends = view(utu.tok_end, Int32Array);
  const utf16 = utf16Offsets(bytes);
  const out = [];
  const visit = (node, depth) => {
    let start = utf16[starts[first[node]]];
    let end = utf16[ends[last[node] - 1]];
    if (depth === 0) {
      // tree-sitter's root starts at its first token or comment and ends with the text.
      start = last[node] > 0 ? start : 0;
      end = text.length;
    }
    out.push({ type: nameOf(kind[node]), start, end, depth });
    for (let c = child[node]; c >= 0; c = next[c]) visit(c, depth + 1);
  };
  visit(root, 0);
  return out;
}

function reference(tree) {
  const out = [];
  const visit = (node, depth) => {
    out.push({ type: node.type, start: node.startIndex, end: node.endIndex, depth });
    for (const child of node.children) if (child.isNamed) visit(child, depth + 1);
  };
  visit(tree.rootNode, 0);
  return out;
}

function compare(tree, nodes, text) {
  if (!tree && !nodes) return null;
  if (!tree) return 'stage 0 rejects it; the self-hosted parser accepts it';
  if (!nodes) return 'the self-hosted parser rejects it';
  const expected = reference(tree);
  const describe = n => n ? `${n.type} @${n.start}-${n.end} depth ${n.depth} "${text.slice(n.start, Math.min(n.end, n.start + 30))}"` : 'nothing';
  for (let i = 0; i < Math.max(expected.length, nodes.length); i++) {
    const a = expected[i];
    const b = nodes[i];
    if (!a || !b || a.type !== b.type || a.start !== b.start || a.end !== b.end || a.depth !== b.depth) {
      return `node ${i}: expected ${describe(a)}, parsed ${describe(b)}`;
    }
  }
  return null;
}

function utf16Offsets(bytes) {
  const out = new Int32Array(bytes.length + 1);
  let unit = 0;
  for (let i = 0; i < bytes.length; i++) {
    out[i] = unit;
    const b = bytes[i];
    if (b < 0x80 || b >= 0xc0) unit += b >= 0xf0 ? 2 : 1;
  }
  out[bytes.length] = unit;
  return out;
}

function utuFiles(entry) {
  if (!fs.existsSync(entry)) return [];
  if (fs.statSync(entry).isFile()) return [entry];
  return fs.readdirSync(entry, { withFileTypes: true }).flatMap(item => {
    if (item.isDirectory()) return ['node_modules', 'dist'].includes(item.name) ? [] : utuFiles(path.join(entry, item.name));
    return item.name.endsWith('.utu') ? [path.join(entry, item.name)] : [];
  });
}

function mutants(source, count) {
  let seed = (source.length * 2654435761 + seedBase * 40503) >>> 0;
  const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  return Array.from({ length: count }, () => {
    const i = Math.floor(random() * source.length);
    const op = random();
    if (op < 0.3) return source.slice(0, i) + source.slice(i + 1);
    if (op < 0.5) return source.slice(0, i) + source[i] + source.slice(i);
    if (op < 0.7) return source.slice(0, i) + (source[i + 1] ?? '') + source[i] + source.slice(i + 2);
    return source.slice(0, i) + INSERTS[Math.floor(random() * INSERTS.length)] + source.slice(i);
  });
}
