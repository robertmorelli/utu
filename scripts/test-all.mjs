// `bun run test`: the compiler suite in both debug modes, the wasm
// fingerprints at every optimization level, what every program does when run
// (at every level), its diagnostics, its sizes, the editor queries at every
// name, the lexer and parser against tree-sitter-utu, the bootstrap (the
// compiler builds itself to the same bytes) and stage 0's provenance, and the
// tool tests, all at once. Each command's output prints when it finishes.
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commands = [
  ['bun', './scripts/run-tests.mjs', '--both-debug-modes'],
  ['node', './scripts/wasm-fingerprints.mjs', '--optimized'],
  ['node', './scripts/editor-query-fingerprints.mjs'],
  ['node', './scripts/selfhost-lexer-differential.mjs', '--fuzz=20'],
  ['node', './scripts/selfhost-parser-differential.mjs'],
  ['node', './scripts/selfhost-bootstrap.mjs'],
  ['node', './scripts/stage0.mjs', '--verify'],
  ['node', './scripts/test-vec.mjs'],
  ['node', './scripts/test-templates.mjs'],
  ['node', './scripts/test-streams.mjs'],
  ['node', './scripts/test-wat.mjs'],
  ['node', './scripts/test-loader-conversions.mjs'],
  ['node', './scripts/test-stdlib.mjs'],
  ['node', './scripts/test-bytes.mjs'],
  ['node', './scripts/test-compiler-regressions.mjs'],
  ['node', './scripts/test-profile.mjs'],
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
  ['node', './scripts/test-wutu-surface-positions.mjs'],
  ['node', './scripts/test-formatter.mjs'],
  ['node', './scripts/test-wutu-grammar.mjs'],
  ['node', './scripts/test-wutu-cli.mjs'],
  // Browsers: Wutu's regressions and hydration (Playwright Chromium and WebKit).
  ['node', './scripts/test-wutu-smoke.mjs'],
  ['node', './scripts/test-wutu-components.mjs'],
  ['node', './scripts/test-wutu-fragments.mjs'],
  ['node', './scripts/test-utu-cli.mjs'],
  ['node', './scripts/test-blame.mjs'],
  ['node', './scripts/test-error-messages.mjs'],
  ['node', './scripts/test-lsp.mjs'],
  ['node', './scripts/test-grep.mjs'],
  ['node', './scripts/test-utudoc.mjs'],
  ['node', './scripts/test-vscode-extension.mjs'],
];

const started = performance.now();
const concurrency = process.env.CI ? Math.min(os.cpus().length, 4) : Math.min(os.cpus().length, 8);
const results = new Array(commands.length);
let next = 0;
const worker = async () => {
  while (next < commands.length) {
    const i = next++;
    const [command, ...args] = commands[i];
    results[i] = await new Promise(resolve => {
      const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      child.on('close', (code, signal) => {
        const name = args.join(' ');
        const status = code === 0 ? 'passed' : `FAILED (exit ${code ?? signal})`;
        process.stdout.write(`\n── ${name} ${status}\n${output}`);
        resolve({ name, code: code ?? 1 });
      });
    });
  }
};
await Promise.all(Array.from({ length: concurrency }, worker));
const failed = results.filter(result => result.code !== 0);
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`\n${failed.length ? `FAILED: ${failed.map(result => result.name).join(', ')}` : 'all test commands passed'} in ${seconds} s`);
process.exit(failed.length ? 1 : 0);
