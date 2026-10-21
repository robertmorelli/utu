// What utu says when a program is wrong: every example under
// examples/error_demo/ (one mistake each) run through the CLI as a user would,
// its output and exit status compared with examples/error_demo/messages.txt
// (test timings blanked out).
//
//   node scripts/test-error-messages.mjs            compare
//   node scripts/test-error-messages.mjs --record   rewrite messages.txt
//
// Programs under runtime/ compile, so they are run (`utu test` when they have
// tests, `utu run` otherwise, with the flags a `// Flags:` line gives); every
// other program is checked (`utu check`). The record is the catalog the error
// audit (docs/error-audit.md) reads: change a message on purpose, then record.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'examples', 'error_demo');
const RECORD = path.join(DIR, 'messages.txt');
const record = process.argv.includes('--record');

function programs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? programs(file) : entry.name.endsWith('.utu') ? [file] : [];
  }).sort();
}

function command(file) {
  const source = fs.readFileSync(file, 'utf8');
  const flags = source.match(/^\/\/ Flags: (.*)$/m)?.[1].trim().split(/\s+/) ?? [];
  if (!path.relative(DIR, file).startsWith(`runtime${path.sep}`)) return ['check', file];
  return [/^\s*test\s+"/m.test(source) ? 'test' : 'run', file, ...flags];
}

// The CLI's output for one program, as a user sees it (no colour), with the
// machine's paths and the engine's internal frames left out.
function run(file) {
  const args = command(file);
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(ROOT, 'cli', 'utu.mjs'), ...args], {
      cwd: ROOT, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { out += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const text = out
        .replaceAll(ROOT + path.sep, '')
        .replaceAll(os.tmpdir(), '$TMP')
        .replace(/\(?(file|node):[^\s)]*\)?/g, '')
        .replace(/\(\d+(\.\d+)? ms\)/g, '(… ms)')
        .replace(/[ \t]+$/gm, '')
        .trimEnd();
      const shown = ['utu', args[0], path.relative(ROOT, args[1]), ...args.slice(2)].join(' ');
      resolve(`=== ${shown}\n${text}\n--- exit ${signal ? `killed (${signal})` : code}\n`);
    });
  });
}

const files = programs(DIR);
const results = new Array(files.length);
const jobs = Math.max(1, os.availableParallelism() - 1);
let next = 0;
await Promise.all(Array.from({ length: jobs }, async () => {
  while (next < files.length) {
    const i = next++;
    results[i] = await run(files[i]);
  }
}));
const now = results.join('\n');

if (record) {
  fs.writeFileSync(RECORD, now);
  console.log(`error messages: recorded ${files.length} programs`);
} else {
  const was = fs.existsSync(RECORD) ? fs.readFileSync(RECORD, 'utf8') : '';
  if (was !== now) {
    const split = text => new Map(text.split(/^(?==== )/m).filter(Boolean).map(block => [block.split('\n')[0], block]));
    const before = split(was), after = split(now);
    for (const [key, block] of after) {
      if (before.get(key) !== block) console.log(before.has(key) ? `CHANGED ${key}\n  was:\n${before.get(key)}  now:\n${block}` : `NEW ${key}`);
    }
    for (const key of before.keys()) if (!after.has(key)) console.log(`GONE ${key}`);
    console.log('error messages differ from examples/error_demo/messages.txt (if on purpose: --record)');
    process.exit(1);
  }
  console.log(`error messages: ${files.length} programs say what they said`);
}
