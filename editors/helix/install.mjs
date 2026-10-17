#!/usr/bin/env node
// Install utu support into Helix: the language and its language server
// (`utu lsp`), the tree-sitter grammar (built from this repository), and its
// queries (highlights, injections, text objects, indents).
//
//   node editors/helix/install.mjs            install or update
//   node editors/helix/install.mjs --remove   take it out again
//
// Your languages.toml keeps everything else: utu's entry sits between two
// marker lines, replaced on each install, and the file is backed up first.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const config = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'helix');
const languages = path.join(config, 'languages.toml');
const queryDirs = ['utu', 'wutu'].map(name => path.join(config, 'runtime', 'queries', name));
// utu's grammar (the repository root), and Wutu's, injected into `@wutu/\ … \/`.
const grammarSources = { utu: repo, wutu: path.join(repo, 'editors', 'tree-sitter-wutu') };
const BEGIN = '# >>> utu (editors/helix/install.mjs) >>>';
const END = '# <<< utu <<<';
const remove = process.argv.includes('--remove');

fs.mkdirSync(config, { recursive: true });
const before = fs.existsSync(languages) ? fs.readFileSync(languages, 'utf8') : '';
if (before) fs.copyFileSync(languages, `${languages}.bak.utu`);
const kept = before.replace(new RegExp(`\\n?${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}\\n?`), '\n').trimEnd();

if (remove) {
  fs.writeFileSync(languages, kept ? kept + '\n' : '');
  for (const dir of queryDirs) fs.rmSync(dir, { recursive: true, force: true });
  for (const name of Object.keys(grammarSources)) fs.rmSync(path.join(config, 'runtime', 'grammars', `${name}.so`), { force: true });
  console.log(`removed utu and wutu from ${languages}, their queries, and their grammars`);
  process.exit(0);
}

const entry = fs.readFileSync(path.join(here, 'languages.toml'), 'utf8')
  .replace(/^#.*\n/gm, '').trim().replaceAll('@REPO@', repo);
fs.writeFileSync(languages, `${kept ? kept + '\n\n' : ''}${BEGIN}\n${entry}\n${END}\n`);
console.log(`wrote utu's language, language server, and grammar to ${languages}`);

for (const dir of queryDirs) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(path.join(here, 'queries', path.basename(dir)), dir, { recursive: true });
  console.log(`copied queries to ${dir}`);
}

// The grammars, each built from its src/parser.c and src/scanner.c into
// Helix's runtime (what `hx --grammar build` would do, for these alone).
const grammars = path.join(config, 'runtime', 'grammars');
fs.mkdirSync(grammars, { recursive: true });
for (const [name, source] of Object.entries(grammarSources)) {
  const library = path.join(grammars, process.platform === 'win32' ? `${name}.dll` : `${name}.so`);
  const cc = spawnSync(process.env.CC ?? 'cc', ['-shared', '-fPIC', '-O2', '-I', path.join(source, 'src'),
    path.join(source, 'src', 'parser.c'), path.join(source, 'src', 'scanner.c'), '-o', library], { encoding: 'utf8' });
  if (cc.error || cc.status !== 0) {
    console.error(`could not build the ${name} grammar: ${cc.error?.message ?? cc.stderr}`);
    process.exit(1);
  }
  console.log(`built the ${name} grammar: ${library}`);
}
const health = spawnSync('hx', ['--health', 'utu'], { encoding: 'utf8' });
if (!health.error) console.log(health.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim());
