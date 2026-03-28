import { readFile } from 'node:fs/promises';
import path from 'node:path';

import bundledGrammarWasm from '../tree-sitter-utu.wasm';
import bundledRuntimeWasm from 'web-tree-sitter/web-tree-sitter.wasm';
import { expandSource } from '../packages/compiler/frontend/expand.js';
import { jsgen } from '../packages/compiler/backends/jsgen.js';
import { createUtuTreeSitterParser } from '../packages/document/index.js';
import { throwOnParseErrors } from '../packages/compiler/frontend/tree.js';
import { watgen } from '../packages/compiler/backends/watgen.js';

const DEFAULT_MODE = 'program';
const DEFAULT_ITERATIONS = 6;
const DEFAULT_WARMUP = 1;
const PHASES = [
  'parseOriginal',
  'expand',
  'parseExpanded',
  'watgen',
  'binaryenParse',
  'validatePre',
  'optimize',
  'validatePost',
  'emitBinary',
  'jsgen',
];
const PHASE_LABELS = {
  parseOriginal: 'parse original',
  expand: 'expand',
  parseExpanded: 'parse expanded',
  watgen: 'watgen',
  binaryenParse: 'binaryen parseText',
  validatePre: 'validate pre-opt',
  optimize: 'binaryen optimize',
  validatePost: 'validate post-opt',
  emitBinary: 'emit binary',
  jsgen: 'jsgen',
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

const binaryenLoadStart = performance.now();
const binaryen = (await import('binaryen')).default;
const binaryenLoadMs = performance.now() - binaryenLoadStart;

for (let index = 0; index < config.warmup; index += 1) runOne(parser, binaryen, source, config.mode);

const runs = [];
for (let index = 0; index < config.iterations; index += 1) {
  runs.push(runOne(parser, binaryen, source, config.mode));
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
console.log(`Load binaryen: ${formatMs(binaryenLoadMs)}`);
console.log(`Expanded source: ${latest.expanded ? 'yes' : 'no'}`);
console.log(`WAT bytes: ${latest.watBytes}`);
console.log(`Wasm bytes: ${latest.wasmBytes}`);
console.log(`Average total: ${formatMs(averageTotalMs)}`);
console.log('');
for (const phase of PHASES) {
  const phaseMs = averagePhases[phase];
  const share = averageTotalMs > 0 ? (phaseMs / averageTotalMs) * 100 : 0;
  console.log(`${PHASE_LABELS[phase].padEnd(20)} ${formatMs(phaseMs).padStart(10)}  ${share.toFixed(1).padStart(5)}%`);
}

function runOne(parser, binaryen, source, mode) {
  const phases = Object.fromEntries(PHASES.map((phase) => [phase, 0]));

  const parseOriginalStart = performance.now();
  const tree = parser.parse(source);
  if (!tree) throw new Error('Tree-sitter returned no syntax tree.');
  phases.parseOriginal = performance.now() - parseOriginalStart;

  let expandedTree = null;
  try {
    throwOnParseErrors(tree.rootNode);

    const expandStart = performance.now();
    const expandedSource = expandSource(tree, source);
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

    const watgenStart = performance.now();
    const { wat, metadata } = watgen(activeTree, { mode });
    phases.watgen = performance.now() - watgenStart;

    const parseTextStart = performance.now();
    const mod = binaryen.parseText(wat);
    phases.binaryenParse = performance.now() - parseTextStart;
    mod.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes | binaryen.Features.Multivalue);

    try {
      const validatePreStart = performance.now();
      const preValidationError = getValidationError(mod);
      phases.validatePre = performance.now() - validatePreStart;
      if (preValidationError) throw new Error(preValidationError);

      const optimizeStart = performance.now();
      binaryen.setOptimizeLevel(3);
      binaryen.setShrinkLevel(2);
      mod.optimize();
      phases.optimize = performance.now() - optimizeStart;

      const validatePostStart = performance.now();
      const postValidationError = getValidationError(mod);
      phases.validatePost = performance.now() - validatePostStart;
      if (postValidationError) throw new Error(postValidationError);

      const emitBinaryStart = performance.now();
      const wasm = mod.emitBinary();
      phases.emitBinary = performance.now() - emitBinaryStart;

      const jsgenStart = performance.now();
      jsgen(activeTree, wasm, { mode, where: 'external', moduleFormat: 'esm', metadata });
      phases.jsgen = performance.now() - jsgenStart;

      return {
        phases,
        totalMs: PHASES.reduce((sum, phase) => sum + phases[phase], 0),
        expanded: expandedSource !== source,
        watBytes: wat.length,
        wasmBytes: wasm.length,
      };
    } finally {
      mod.dispose();
    }
  } finally {
    expandedTree?.delete();
    tree.delete();
  }
}

function getValidationError(mod) {
  if (mod.validate()) return null;
  try {
    new WebAssembly.Module(mod.emitBinary());
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return 'Binaryen validation failed.';
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
