// `bun run test`: the compiler suite in both debug modes, the wasm
// fingerprints at every optimization level, what every program does when run
// (the run differential, at -Oz), the behavior fingerprints (diagnostics,
// editor queries, graphs), utu's parser against tree-sitter, the self-hosted
// lexer, parser, name resolution, and what its builds do against stage 0,
// its bootstrap (it builds itself to the same bytes), and the tool tests,
// all at once. Each command's
// output prints when it finishes.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commands = [
  ['bun', './scripts/run-tests.mjs', '--both-debug-modes'],
  ['node', './scripts/wasm-fingerprints.mjs', '--optimized'],
  ['node', './scripts/run-differential.mjs', '--optimize=size'],
  ['node', './scripts/behavior-fingerprints.mjs'],
  ['node', './scripts/syntax-differential.mjs', '--fuzz=10'],
  ['node', './scripts/selfhost-lexer-differential.mjs', '--fuzz=20'],
  ['node', './scripts/selfhost-parser-differential.mjs', '--fuzz=20'],
  ['node', './scripts/selfhost-resolve-differential.mjs'],
  ['node', './scripts/selfhost-bootstrap.mjs', '--stage-1'],
  ['node', './scripts/test-vec.mjs'],
  ['node', './scripts/test-templates.mjs'],
  ['node', './scripts/test-streams.mjs'],
  ['node', './scripts/test-wat.mjs'],
  ['node', './scripts/test-stdlib.mjs'],
  ['node', './scripts/test-compiler-regressions.mjs'],
  // Optimized early, as an editor's long session would have it.
  ['node', '--wasm-tiering-budget=1000', './scripts/test-selfhost-resident.mjs'],
  ['node', './scripts/selfhost-run-differential.mjs'],
  ['node', './scripts/selfhost-run-differential.mjs', '--optimize=size'],
  ['node', './scripts/selfhost-run-differential.mjs', '--optimize=speed'],
  ['node', './scripts/selfhost-diagnostics-differential.mjs'],
  ['node', './scripts/selfhost-size-differential.mjs'],
  ['node', './scripts/test-source-warnings.mjs'],
  ['node', './scripts/test-query-features.mjs'],
  ['node', './scripts/test-wutu-stencils.mjs'],
  ['node', './scripts/test-formatter.mjs'],
  ['node', './scripts/test-wutu-grammar.mjs'],
  ['node', './scripts/test-wutu-cli.mjs'],
  ['node', './scripts/test-utu-cli.mjs'],
  ['node', './scripts/test-error-messages.mjs'],
  ['node', './scripts/test-lsp.mjs'],
  ['node', './scripts/test-grep.mjs'],
  ['node', './scripts/test-utudoc.mjs'],
  ['node', './scripts/test-vscode-extension.mjs'],
];

const started = performance.now();
const results = await Promise.all(commands.map(([command, ...args]) => new Promise(resolve => {
  const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.on('close', code => {
    const name = args.join(' ');
    process.stdout.write(`\n── ${name} ${code === 0 ? 'passed' : `FAILED (exit ${code})`}\n${output}`);
    resolve({ name, code });
  });
})));
const failed = results.filter(result => result.code !== 0);
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`\n${failed.length ? `FAILED: ${failed.map(result => result.name).join(', ')}` : 'all test commands passed'} in ${seconds} s`);
process.exit(failed.length ? 1 : 0);
