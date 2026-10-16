#!/usr/bin/env node
// Build the documentation website (docs/src/main.utu, written in utu and Wutu)
// into docs/ for GitHub Pages. The site is built in a temporary directory and
// only its outputs are copied, so the markdown files in docs/ are left alone.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = path.join(root, 'docs/src/main.utu');
const target = path.join(root, 'docs');
const outputs = ['index.html', 'app.js', 'app.wasm'];

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
  for (const name of outputs) await fs.copyFile(path.join(temp, name), path.join(target, name));
  await fs.writeFile(path.join(target, '.nojekyll'), '');
  const sizes = await Promise.all(outputs.map(async (name) => `${name} ${(await fs.stat(path.join(target, name))).size} bytes`));
  console.log(`docs/: ${sizes.join(', ')}`);
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
