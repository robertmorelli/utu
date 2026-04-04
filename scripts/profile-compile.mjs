import { readFile } from 'node:fs/promises';
import path from 'node:path';

import bundledGrammarWasm from '../tree-sitter-utu.wasm';
import bundledRuntimeWasm from 'web-tree-sitter/web-tree-sitter.wasm';
import { expandSource } from '../packages/compiler/stage2/api.js';
import { compile } from '../packages/compiler/index.js';
import { createUtuTreeSitterParser } from '../packages/document/index.js';
import { throwOnParseErrors } from '../packages/compiler/analyze-header-snapshot.js';

const DEFAULT_MODE = 'program';
const DEFAULT_ITERATIONS = 6;
const DEFAULT_WARMUP = 1;
const PHASES = [
  'parseOriginal',
  'expand',
  'parseExpanded',
  'compile',
];
const PHASE_LABELS = {
  parseOriginal: 'parse original',
  expand: 'expand',
  parseExpanded: 'parse expanded',
  compile: 'compile',
};

const config = parseArgs(process.argv.slice(2));
if (!config.input) usage('Missing input file.');

const inputPath = path.resolve(config.input);
const source = await readFile(inputPath, 'utf8');

const parserInitStart = performance.now();
const parser = await createUtuTreeSitterParser({
  wasmUrl: bundledGrammarWasm,
  runtimeWasmUrl: bundledRuntimeWasm,
});
const parserInitMs = performance.now() - parserInitStart;

for (let index = 0; index < config.warmup; index += 1) await runOne(parser, source, config.mode);

const runs = [];
for (let index = 0; index < config.iterations; index += 1) {
  runs.push(await runOne(parser, source, config.mode));
}

const phaseTotals = Object.fromEntries(PHASES.map((phase) => [phase, 0]));
let totalMs = 0;
for (const run of runs) {
  totalMs += run.totalMs;
  for (const phase of PHASES) phaseTotals[phase] += run.phases[phase];
}

const averageTotalMs = totalMs / runs.length;
const averagePhases = Object.fromEntries(PHASES.map((phase) => [phase, phaseTotals[phase] / runs.length]));
const latest = runs.at(-1);

console.log(`Input: ${path.relative(process.cwd(), inputPath)} (${source.length} bytes)`);
console.log(`Mode: ${config.mode}`);
console.log(`Warmup: ${config.warmup}`);
console.log(`Iterations: ${config.iterations}`);
console.log(`Init parser: ${formatMs(parserInitMs)}`);
console.log(`Expanded source: ${latest.expanded ? 'yes' : 'no'}`);
console.log(`Wasm bytes: ${latest.wasmBytes}`);
console.log(`Average total: ${formatMs(averageTotalMs)}`);
console.log('');
for (const phase of PHASES) {
  const phaseMs = averagePhases[phase];
  const share = averageTotalMs > 0 ? (phaseMs / averageTotalMs) * 100 : 0;
  console.log(`${PHASE_LABELS[phase].padEnd(20)} ${formatMs(phaseMs).padStart(10)}  ${share.toFixed(1).padStart(5)}%`);
}

async function runOne(parser, source, mode) {
  const phases = Object.fromEntries(PHASES.map((phase) => [phase, 0]));

  const parseOriginalStart = performance.now();
  const tree = parser.parse(source);
  if (!tree) throw new Error('Tree-sitter returned no syntax tree.');
  phases.parseOriginal = performance.now() - parseOriginalStart;

  let expandedTree = null;
  try {
    throwOnParseErrors(tree.rootNode);

    const expandStart = performance.now();
    const expandedSource = await expandSource(tree, source);
    phases.expand = performance.now() - expandStart;

    let activeTree = tree;
    if (expandedSource !== source) {
      const parseExpandedStart = performance.now();
      expandedTree = parser.parse(expandedSource);
      if (!expandedTree) throw new Error('Tree-sitter returned no syntax tree for expanded source.');
      phases.parseExpanded = performance.now() - parseExpandedStart;
      throwOnParseErrors(expandedTree.rootNode);
      activeTree = expandedTree;
    }

    const compileStart = performance.now();
    const { wasm } = await compile(source, {
      mode,
      optimize: true,
      wasmUrl: bundledGrammarWasm,
      runtimeWasmUrl: bundledRuntimeWasm,
    });
    phases.compile = performance.now() - compileStart;

    return {
      phases,
      totalMs: PHASES.reduce((sum, phase) => sum + phases[phase], 0),
      expanded: expandedSource !== source,
      wasmBytes: wasm.length,
    };
  } finally {
    expandedTree?.delete();
    tree.delete();
  }
}

function parseArgs(argv) {
  const config = {
    input: null,
    mode: DEFAULT_MODE,
    iterations: DEFAULT_ITERATIONS,
    warmup: DEFAULT_WARMUP,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      if (config.input) usage('Too many positional arguments.');
      config.input = arg;
      continue;
    }

    const value = argv[index + 1];
    switch (arg) {
      case '--mode':
        if (!value) usage('Missing value for --mode.');
        if (!['program', 'test', 'bench'].includes(value)) usage(`Unsupported mode "${value}".`);
        config.mode = value;
        index += 1;
        break;
      case '--iterations':
        config.iterations = parsePositiveInt(value, '--iterations');
        index += 1;
        break;
      case '--warmup':
        config.warmup = parseNonNegativeInt(value, '--warmup');
        index += 1;
        break;
      case '--help':
        usage();
        break;
      default:
        usage(`Unknown flag "${arg}".`);
    }
  }

  return config;
}

function parsePositiveInt(value, flag) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isInteger(parsed) || parsed < 1) usage(`Invalid value for ${flag}.`);
  return parsed;
}

function parseNonNegativeInt(value, flag) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isInteger(parsed) || parsed < 0) usage(`Invalid value for ${flag}.`);
  return parsed;
}

function formatMs(value) {
  return `${value.toFixed(2)} ms`;
}

function usage(message) {
  if (message) console.error(message);
  console.log('Usage: bun scripts/profile-compile.mjs <file> [--mode program|test|bench] [--iterations N] [--warmup N]');
  process.exit(message ? 1 : 0);
}
