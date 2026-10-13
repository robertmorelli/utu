// The self-hosted lexer (selfhost/syntax.utu) against the stage 0 parser:
// for every source the JavaScript parser accepts, the lexer's tokens must be
// exactly the leaves of its syntax tree, in order, with the same spans.
//
//   node scripts/selfhost-lexer-differential.mjs [files…] [--fuzz=N] [--seed=N] [--show=N]
//
// Defaults to every .utu file under examples/, benchmarks/, std/,
// hand_written_bindings/, and baselines/corpus. --fuzz=N adds N mutants of
// each (characters deleted, duplicated, or swapped, or words and operators
// inserted), which reach odd corners of the lexer. A source the JavaScript parser rejects is only checked to lex
// to an end (or an error) without trapping.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompiler, emitBinary, initParser, instantiateLowered, buildImportObject } from '../src/index.js';
import { parseSyntax } from '../src/compiler/syntax/parser.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const fuzz = Number(flag('fuzz') ?? 0);
const seedBase = Number(flag('seed') ?? 0);
const show = Number(flag('show') ?? 10);
const inputs = process.argv.slice(2).filter(arg => !arg.startsWith('--'));

// Words and operators whose lexing depends on what precedes them.
const INSERTS = [' -o ', '-o', '?.', '?', ' in ', ' type ', ' test ', ' and ', ' not ', ' return ', ' fatal ',
  '&=', '|=', '=>', '|', '-', 'o', '>>=', '<<=', '>>>=', '..<', '...', '.5', '0x', '0b', 'e5', '"', '\\\\', '/\\', '\\/', '//'];

// Token kinds, in selfhost/syntax.utu's order.
const KINDS = ['End', 'Error', 'Word', 'Int', 'Float', 'String', 'MultilineLine', 'DslBody', 'Comment'];
const PUNCT = KINDS.length;

const lexer = await loadLexer();

const roots = inputs.length ? inputs : ['examples', 'benchmarks', 'std', 'hand_written_bindings', 'baselines/corpus']
  .map(dir => path.join(ROOT, dir));
const files = roots.flatMap(utuFiles).sort();
let checked = 0;
let differ = 0;
let skipped = 0;
const started = performance.now();
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const [name, text] of [[path.relative(ROOT, file), source], ...mutants(source, fuzz).map((m, i) => [`${path.relative(ROOT, file)}#mutant${i}`, m])]) {
    const tree = parseSyntax(text);
    if (!tree) {
      // Whatever the source, the lexer finishes: its last token is End or Error.
      const last = lex(text).at(-1);
      if (last?.kind !== 0 && last?.kind !== 1) {
        differ++;
        if (differ <= show) console.log(`DIFFERS ${name}: lexing did not finish`);
      }
      skipped++;
      continue;
    }
    checked++;
    const problem = compare(leaves(tree.rootNode), lex(text), text);
    if (problem) {
      differ++;
      if (differ <= show) console.log(`DIFFERS ${name}: ${problem}`);
    }
  }
}
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`${checked - differ}/${checked} sources lex as stage 0 parses them (${skipped} it rejects) in ${seconds} s`);
process.exit(differ ? 1 : 0);

// ── The lexer ────────────────────────────────────────────────────────────────

async function loadLexer() {
  const parser = await initParser({ wasmDir: `${ROOT}/` });
  const compiler = createCompiler({
    parser, target: 'normal', optimize: 'speed',
    readFile: file => fs.promises.readFile(file, 'utf8'),
    resolvePath: (from, relative) => path.resolve(path.dirname(from), relative),
  });
  const doc = await compiler.compileFile(path.join(ROOT, 'selfhost', 'syntax.utu'));
  const errors = [...doc.querySelectorAll('[data-error]')].map(node => node.getAttribute('data-error-message'));
  if (errors.length) throw new Error(`selfhost/syntax.utu:\n${errors.join('\n')}`);
  const wasm = emitBinary(doc);
  const { instance } = await instantiateLowered(wasm, await buildImportObject(doc, { wasm, projectRoot: ROOT }));
  return instance.exports;
}

/** The lexer's tokens for `text`: `{ kind, start, end }`, offsets in UTF-16 code units. */
function lex(text) {
  const bytes = new TextEncoder().encode(text);
  lexer.source(bytes.length);
  new Uint8Array(lexer.src.buffer).set(bytes);
  const count = lexer.tokens(bytes.length);
  const kinds = new Uint8Array(lexer.tok_kind.buffer, 0, count);
  const starts = new Int32Array(lexer.tok_start.buffer, 0, count);
  const ends = new Int32Array(lexer.tok_end.buffer, 0, count);
  const utf16 = utf16Offsets(bytes);
  return Array.from({ length: count }, (_, i) => ({ kind: kinds[i], start: utf16[starts[i]], end: utf16[ends[i]] }));
}

/** UTF-16 offset of every UTF-8 byte offset (and of the end). */
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

// ── The reference ────────────────────────────────────────────────────────────

function leaves(root) {
  const out = [];
  const visit = node => {
    if (node.children.length === 0) out.push(node);
    else node.children.forEach(visit);
  };
  visit(root);
  return out.sort((a, b) => a.startIndex - b.startIndex);
}

/** What kind of token the lexer should have made for a tree leaf. */
function expectedKind(leaf, text) {
  switch (leaf.type) {
    case 'comment': return 'Comment';
    case 'int_lit': return 'Int';
    case 'float_lit': return 'Float';
    case 'string_lit': return 'String';
    case 'multiline_string_line': return 'MultilineLine';
    case 'dsl_body': return 'DslBody';
    case 'identifier': case 'type_ident': return 'Word';
    default: break;
  }
  const source = text.slice(leaf.startIndex, leaf.endIndex);
  // Keywords, and named leaves that are a keyword (`void_type`).
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(source)) return 'Word';
  if (!leaf.isNamed) return 'Punct';
  throw new Error(`no token kind for leaf ${leaf.type} "${text.slice(leaf.startIndex, leaf.endIndex)}"`);
}

function compare(expected, tokens, text) {
  const describe = token => `${token.kind < PUNCT ? KINDS[token.kind] : 'Punct'} "${text.slice(token.start, token.end)}" @${token.start}`;
  const last = tokens[tokens.length - 1];
  if (last?.kind !== 0) return `lexer stopped: ${last ? describe(last) : 'no tokens'}`;
  let t = 0;
  for (const leaf of expected) {
    const token = tokens[t];
    if (!token || token.kind === 0) return `missing token for ${leaf.type} @${leaf.startIndex}`;
    if (leaf.type === 'platform_path') {
      // `std:Str` is one leaf; the parser joins its three tokens.
      const parts = tokens.slice(t, t + 3);
      if (parts.length !== 3 || parts[0].start !== leaf.startIndex || parts[2].end !== leaf.endIndex
        || parts[0].end !== parts[1].start || parts[1].end !== parts[2].start) return `platform path @${leaf.startIndex}`;
      t += 3;
      continue;
    }
    if (/^(and|or|xor)=$/.test(leaf.type)) {
      // `x and= y`: the parser joins the word and the `=` after it.
      const [word, eq] = tokens.slice(t, t + 2);
      if (!eq || word.start !== leaf.startIndex || eq.end !== leaf.endIndex || word.end !== eq.start) return `${leaf.type} @${leaf.startIndex}`;
      t += 2;
      continue;
    }
    const kind = expectedKind(leaf, text);
    const got = token.kind < PUNCT ? KINDS[token.kind] : 'Punct';
    if (got !== kind || token.start !== leaf.startIndex || token.end !== leaf.endIndex) {
      return `expected ${kind} "${text.slice(leaf.startIndex, leaf.endIndex)}" @${leaf.startIndex}, lexed ${describe(token)}`;
    }
    t++;
  }
  if (tokens[t]?.kind !== 0) return `extra token ${describe(tokens[t])}`;
  return null;
}

// ── Inputs ───────────────────────────────────────────────────────────────────

function utuFiles(entry) {
  if (!fs.existsSync(entry)) return [];
  if (fs.statSync(entry).isFile()) return [entry];
  return fs.readdirSync(entry, { withFileTypes: true }).flatMap(item => {
    if (item.isDirectory()) return ['node_modules', 'dist'].includes(item.name) ? [] : utuFiles(path.join(entry, item.name));
    return item.name.endsWith('.utu') ? [path.join(entry, item.name)] : [];
  });
}

/** `count` small mutations of `source`, the same ones every run. */
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
