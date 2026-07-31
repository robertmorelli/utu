import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCompiler, emitBinary, initParser } from '../src/index.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BENCH = path.join(ROOT, 'benchmarks', 'engines');
const TMP = path.join(ROOT, '.tmp', 'wasmgc-engine-benchmark');
const SAMPLES = Number(process.env.ENGINE_SAMPLES ?? 20);
const WARMUPS = Number(process.env.ENGINE_WARMUPS ?? 5);
await fs.mkdir(TMP, { recursive: true });

const parser = await initParser({ wasmDir: `${ROOT}/` });
const compiler = createCompiler({ parser, target: 'normal', readFile: name => fs.readFile(name, 'utf8'), resolvePath: (from, relative) => path.resolve(path.dirname(from), relative) });
const modules = [
  ['scalar', path.join(ROOT, 'benchmarks/suite/scalar.utu')],
  ['strings', path.join(ROOT, 'benchmarks/suite/strings.utu')],
  ['analyzer', path.join(ROOT, 'benchmarks/suite/analyzer.utu')],
  ['sieve', path.join(ROOT, 'benchmarks/suite/sieve.utu')],
  ['deltablue', path.join(ROOT, 'benchmarks/deltablue/deltablue.utu')],
];
const hashes = [];
for (const [stem, file] of modules) {
  const bytes = await compileUtu(file);
  await fs.writeFile(path.join(TMP, `${stem}-utu.wasm`), bytes);
  hashes.push(`${stem}:${createHash('sha256').update(bytes).digest('hex')}`);
}

const runtimeHarness = path.join(BENCH, 'utu-all-runtime.mjs');
const shellHarness = path.join(BENCH, 'utu-all-shell.js');
const common = [TMP, String(SAMPLES), String(WARMUPS)];
const home = os.homedir();
const jscRoot = path.join(ROOT, '.tmp', 'jsc', 'out', 'Release');
const candidates = [
  runtime('Bun', process.execPath, [runtimeHarness, ...common], () => `Bun ${Bun.version} / JSC`),
  runtime('Node', find('node'), [runtimeHarness, ...common], () => `${line(find('node'), ['--version'])} / V8 ${line(find('node'), ['-p', 'process.versions.v8'])}`),
  runtime('Deno', find('deno'), ['run', '--allow-read', runtimeHarness, ...common], () => lines(find('deno'), ['--version'], 2).replace('deno ', 'Deno ').replace('\n', ' / ')),
  runtime('V8 d8', path.join(home, '.jsvu', 'bin', 'v8'), [shellHarness, '--', ...common], () => line(path.join(home, '.jsvu', 'bin', 'v8'), ['--version'])),
  runtime('SpiderMonkey', path.join(home, '.jsvu', 'bin', 'sm'), [shellHarness, ...common], () => line(path.join(home, '.jsvu', 'bin', 'sm'), ['--version'])),
  runtime('JavaScriptCore', path.join(jscRoot, 'jsc'), [shellHarness, '--', ...common], () => 'WebKit r318158', { DYLD_FRAMEWORK_PATH: jscRoot, DYLD_LIBRARY_PATH: jscRoot }),
];

const rows = [];
for (const candidate of candidates) {
  if (!candidate.command || !(await exists(candidate.command))) { console.warn(`skip ${candidate.name}: runtime not found`); continue; }
  const result = spawnSync(candidate.command, candidate.args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...candidate.env } });
  if (result.status !== 0) { console.warn(`skip ${candidate.name}: ${result.stderr.trim() || result.stdout.trim()}`); continue; }
  rows.push({ name: candidate.name, version: candidate.version(), ...JSON.parse(result.stdout.trim().split('\n').at(-1)) });
}
if (!rows.length) throw new Error('no JavaScript runtimes completed the benchmark');
const workloads = Object.keys(rows[0].results);
console.log(`All utu benchmarks across JavaScript runtimes: ${SAMPLES} samples, ${WARMUPS} warmups`);
for (const workload of workloads) {
  console.log(`\n${workload}`);
  for (const row of rows) console.log(`  ${row.name.padEnd(16)} ${ms(row.results[workload].median)}`);
}
await fs.writeFile(path.join(BENCH, 'RESULTS.md'), render(rows, workloads));
console.log(`\nReport: ${path.relative(ROOT, path.join(BENCH, 'RESULTS.md'))}`);

function runtime(name, command, args, version, env = {}) { return { name, command, args, version, env }; }
function find(name) { const result = spawnSync('which', [name], { encoding: 'utf8' }); return result.status === 0 ? result.stdout.trim() : ''; }
function line(command, args) { return lines(command, args, 1); }
function lines(command, args, count) { const result = spawnSync(command, args, { encoding: 'utf8' }); return (result.stdout || result.stderr).trim().split('\n').slice(0, count).join('\n'); }
async function exists(file) { return fs.access(file).then(() => true, () => false); }
function ms(value) { return `${value.toFixed(3)} ms`; }
function render(rows, workloads) {
  const bun = rows.find(row => row.name === 'Bun');
  let text = `# utu across JavaScript runtimes\n\nGenerated ${new Date().toISOString()} on arm64 macOS. ${WARMUPS} warmups and ${SAMPLES} samples per workload. Compilation and instantiation are excluded; all results were validated. Every runtime used the same compiled utu modules.\n\n`;
  text += '| workload | ' + rows.map(row => row.name).join(' | ') + ' |\n|---|' + rows.map(() => '---:').join('|') + '|\n';
  for (const workload of workloads) text += `| ${workload} | ${rows.map(row => ms(row.results[workload].median)).join(' | ')} |\n`;
  text += '\n## Relative to Bun\n\n| workload | ' + rows.map(row => row.name).join(' | ') + ' |\n|---|' + rows.map(() => '---:').join('|') + '|\n';
  for (const workload of workloads) text += `| ${workload} | ${rows.map(row => `${(row.results[workload].median / bun.results[workload].median).toFixed(2)}×`).join(' | ')} |\n`;
  text += `\n## Runtime versions\n\n${rows.map(row => `- **${row.name}:** ${row.version}`).join('\n')}\n\nModule SHA-256: ${hashes.map(hash => `\`${hash}\``).join(', ')}. Lower ratios are faster. This report measures utu only. See [../suite/RESULTS.md](../suite/RESULTS.md) for the separate Bun-only cross-language comparison.\n`;
  return text;
}
async function compileUtu(file) {
  const doc = await compiler.compileFile(file);
  const errors = [...doc.querySelectorAll('[data-error]')];
  if (errors.length) throw new Error(`${file}: ${errors.map(node => node.dataset.errorMessage).join('; ')}`);
  return emitBinary(doc);
}
