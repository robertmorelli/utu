#!/usr/bin/env node
// Build the documentation website (docs/src/main.utu, written in utu and Wutu)
// into docs/ for GitHub Pages. The site is built in a temporary directory and
// only its outputs are copied, so the markdown files in docs/ are left alone.
// The playground (docs/playground/) ships the self-hosted compiler from dist/,
// so run `bun run build` first.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = path.join(root, 'docs/src/main.utu');
const target = path.join(root, 'docs');
const outputs = ['index.html', 'app.js', 'app.wasm'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 12);

/**
 * Pages caches each file for ten minutes, so a new index.html can meet an old
 * app.js or app.wasm. Each reference carries its file's hash: a page only ever
 * loads the script and module built with it.
 */
async function stampVersions(directory) {
  const file = (name) => path.join(directory, name);
  const replace = async (name, from, to) => {
    const text = await fs.readFile(file(name), 'utf8');
    if (!text.includes(from)) throw new Error(`${name} does not reference ${from}`);
    await fs.writeFile(file(name), text.replaceAll(from, to));
  };
  const play = (name) => file(path.join('playground', name));
  const stamp = async (name) => `./${name}?v=${hash(await fs.readFile(play(name)))}`;
  const playground = path.join('playground', 'playground.js');
  for (const name of ['vendor/utu.wasm', 'vendor/utu.host.json', 'vendor/selfhost/utu.js', 'preview-runtime.js']) {
    await replace(playground, `'./${name}'`, `'${await stamp(name)}'`);
  }
  const catalog = hash(await fs.readFile(play('vendor/selfhost/catalog/catalog.json')));
  await replace(playground, '/catalog/${name}`', `/catalog/\${name}?v=${catalog}\``);
  await replace('app.js', '"./playground/playground.js"', `"./playground/playground.js?v=${hash(await fs.readFile(play('playground.js')))}"`);
  await replace('app.js', '"./app.wasm"', `"./app.wasm?v=${hash(await fs.readFile(file('app.wasm')))}"`);
  await replace('index.html', '"./app.js"', `"./app.js?v=${hash(await fs.readFile(file('app.js')))}"`);
}

/** docs/playground/: the compiler, its glue, and the preview frame's runtime. */
async function buildPlayground(directory) {
  const out = path.join(directory, 'playground');
  const dist = path.join(root, 'dist');
  await fs.mkdir(path.join(out, 'vendor'), { recursive: true });
  await fs.cp(path.join(dist, 'selfhost'), path.join(out, 'vendor', 'selfhost'), { recursive: true });
  await fs.copyFile(path.join(dist, 'utu.wasm'), path.join(out, 'vendor', 'utu.wasm'));
  await fs.copyFile(path.join(dist, 'utu.host.json'), path.join(out, 'vendor', 'utu.host.json'));
  await fs.copyFile(path.join(root, 'docs/src/playground/playground.js'), path.join(out, 'playground.js'));
  await build({
    entryPoints: [path.join(root, 'docs/src/playground/preview-runtime.js')],
    outfile: path.join(out, 'preview-runtime.js'),
    bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true, logLevel: 'warning',
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)));
  });
}

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'utu-docs-'));
try {
  const args = ['cli/wutu.mjs', 'build', entry, '--out', temp, '--title', 'utu'];
  if (process.argv.includes('--no-prerender')) args.push('--no-prerender');
  await run(process.execPath, args);
  await buildPlayground(temp);
  await stampVersions(temp);
  for (const name of outputs) await fs.copyFile(path.join(temp, name), path.join(target, name));
  // The playground, and each lazy page's chunk (wutu.lazy), replace last build's.
  for (const directory of ['playground', 'chunks']) {
    await fs.rm(path.join(target, directory), { recursive: true, force: true });
    await fs.cp(path.join(temp, directory), path.join(target, directory), { recursive: true });
  }
  await fs.writeFile(path.join(target, '.nojekyll'), '');
  const sizes = await Promise.all(outputs.map(async (name) => `${name} ${(await fs.stat(path.join(target, name))).size} bytes`));
  console.log(`docs/: ${sizes.join(', ')}`);
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
