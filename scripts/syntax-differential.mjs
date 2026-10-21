// utu's parser against tree-sitter-utu: the same concrete syntax tree for
// every valid program, and no tree for an invalid one.
//
//   node scripts/syntax-differential.mjs [files or directories…] [--show=N] [--fuzz=N] [--seed=N] [--keywords]
//
// --fuzz=N also checks N mutants of each file (a token deleted, duplicated,
// or swapped with its neighbour), which mostly exercises the rejection side.
//
// With no arguments, checks every .utu file under examples/, benchmarks/,
// std/, hand_written_bindings/, and baselines/corpus (sources collected from
// test runs). Exits 1 on any disagreement.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initParser } from '../src/index.js';
import { parseSyntax } from '../src/compiler/syntax/parser.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const show = Number(process.argv.find(arg => arg.startsWith('--show='))?.slice(7) ?? 10);
const fuzz = Number(process.argv.find(arg => arg.startsWith('--fuzz='))?.slice(7) ?? 0);
const inputs = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const roots = inputs.length ? inputs : ['examples', 'benchmarks', 'std', 'hand_written_bindings', 'baselines/corpus']
  .map(dir => path.join(ROOT, dir)).filter(dir => fs.existsSync(dir));

function files(entry) {
  if (fs.statSync(entry).isFile()) return [entry];
  return fs.readdirSync(entry, { withFileTypes: true }).flatMap(item => {
    // The error catalog (examples/error_demo/<category>/) has its own test, test-error-messages.mjs.
    if (item.isDirectory()) return ['node_modules', 'dist'].includes(item.name) || path.basename(entry) === 'error_demo' ? [] : files(path.join(entry, item.name));
    return item.name.endsWith('.utu') ? [path.join(entry, item.name)] : [];
  });
}

/** The first difference between two trees, as a path and a description, or null. */
function compare(a, b, at = 'source_file') {
  const describe = (node, field) => `${field ? `${field}: ` : ''}${node.isNamed ? node.type : JSON.stringify(node.type)} ${node.startIndex}-${node.endIndex}`;
  if (a.type !== b.type || a.isNamed !== b.isNamed || a.startIndex !== b.startIndex || a.endIndex !== b.endIndex) {
    return `${at}: tree-sitter ${describe(a)}, ours ${describe(b)}`;
  }
  const count = Math.max(a.childCount, b.childCount);
  for (let i = 0; i < count; i++) {
    const x = a.child(i);
    const y = b.child(i);
    if (!x || !y) return `${at}: child ${i}: tree-sitter ${x ? describe(x, a.fieldNameForChild(i)) : 'none'}, ours ${y ? describe(y, b.fieldNameForChild(i)) : 'none'}`;
    const fx = a.fieldNameForChild(i);
    const fy = b.fieldNameForChild(i);
    if (fx !== fy) return `${at}: child ${i} field: tree-sitter ${fx}, ours ${fy}`;
    const inner = compare(x, y, `${at} > ${x.type}`);
    if (inner) return inner;
  }
  return null;
}

const parser = await initParser({ wasmDir: `${ROOT}/` });
const all = [...new Set(roots.flatMap(files))].sort();
let same = 0, unsupported = 0, invalid = 0;
const problems = [];
const started = performance.now();
// A small deterministic generator, so a reported mutant can be reproduced.
let seed = Number(process.argv.find(arg => arg.startsWith('--seed='))?.slice(7) ?? 12345);
const random = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const TOKEN = /\s+|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*|[0-9][0-9.xXa-fA-F]*|>>>=|\.\.\.|\.\.<|<<=|>>=|>>>|-o|\?\.|=>|~>|==|!=|<=|>=|<<|>>|[-+*\/%&|^]=|./g;
// Every keyword in the grammar: a word replaced by one exercises where keywords are reserved.
const KEYWORDS = ['mod', 'using', 'tag', 'rec', 'struct', 'proto', 'enum', 'fn', 'let', 'mem', 'export', 'const', 'type',
  'distinct', 'lib', 'main', 'test', 'bench', 'measure', 'in', 'out', 'get', 'set', 'yield', 'void', 'fun', 'cl', 'from',
  'map', 'filter', 'flat_map', 'skip_while', 'take_while', 'each', 'any', 'all', 'count_where', 'first_index', 'last_index',
  'fold', 'scan', 'skip', 'take', 'chain', 'repeat', 'zip', 'sort', 'min_by', 'max_by', 'first_where', 'reduce', 'partition',
  'collect', 'group_by', 'distinct_by', 'batched', 'windows', 'bisect', 'sum', 'fast_sum', 'product', 'count',
  'await', 'new', 'assert', 'not', 'and', 'or', 'xor', 'orelse', 'if', 'else', 'promote', 'try', 'catch', 'match', 'loop',
  'alt', 'for', 'while', 'break', 'continue', 'defer', 'return', 'fatal', 'prune', 'true', 'false', 'null'];

function mutants(source, count) {
  const tokens = source.match(TOKEN) ?? [];
  const solid = tokens.map((t, i) => [t, i]).filter(([t]) => !/^\s/.test(t));
  const out = [];
  for (let k = 0; k < count && solid.length > 1; k++) {
    const copy = tokens.slice();
    const [, i] = solid[random(solid.length)];
    const kind = process.argv.includes("--keywords") ? 3 : random(4);
    if (kind === 3) {
      const words = solid.filter(([t]) => /^[A-Za-z_]/.test(t));
      if (!words.length) continue;
      copy[words[random(words.length)][1]] = KEYWORDS[random(KEYWORDS.length)];
    } else if (kind === 0) copy[i] = '';
    else if (kind === 1) copy[i] = `${copy[i]} ${copy[i]}`;
    else {
      const [, j] = solid[random(solid.length)];
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    out.push(copy.join(''));
  }
  return out;
}

const sources = all.flatMap(file => {
  const text = fs.readFileSync(file, 'utf8');
  return [[file, text], ...mutants(text, fuzz).map((mutant, k) => [`${file}#mutant${k}`, mutant])];
});
for (const [file, source] of sources) {
  if (file.includes('#mutant')) fs.writeFileSync(path.join(ROOT, '.tmp', 'last-mutant.utu'), source);
  const reference = parser.parse(source);
  const ours = parseSyntax(source);
  if (reference.rootNode.hasError) {
    invalid++;
    if (ours) {
      problems.push(`${file}: tree-sitter reports errors, ours accepts it`);
      if (file.includes('#mutant')) fs.writeFileSync(path.join(ROOT, '.tmp', `accepts-${problems.length}.utu`), source);
    }
  } else if (!ours) {
    unsupported++;
    problems.push(`${file}: valid, but ours gives up`);
    if (file.includes('#mutant')) fs.writeFileSync(path.join(ROOT, '.tmp', `gives-up-${problems.length}.utu`), source);
  } else {
    const difference = compare(reference.rootNode, ours.rootNode);
    if (difference) {
      problems.push(`${file}: ${difference}`);
      if (file.includes('#mutant')) fs.writeFileSync(path.join(ROOT, '.tmp', `differs-${problems.length}.utu`), source);
    }
    else same++;
  }
  reference.delete();
}
for (const problem of problems.slice(0, show)) console.log(problem.replace(ROOT + path.sep, ''));
if (problems.length > show) console.log(`… ${problems.length - show} more`);
console.log(`${same} identical, ${problems.length} problems (${unsupported} unsupported), ${invalid} invalid sources, ${sources.length} sources in ${((performance.now() - started) / 1000).toFixed(1)} s`);
if (problems.length) process.exit(1);
