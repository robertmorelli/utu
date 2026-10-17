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
const queries = path.join(config, 'runtime', 'queries', 'utu');
const BEGIN = '# >>> utu (editors/helix/install.mjs) >>>';
const END = '# <<< utu <<<';
const remove = process.argv.includes('--remove');

fs.mkdirSync(config, { recursive: true });
const before = fs.existsSync(languages) ? fs.readFileSync(languages, 'utf8') : '';
if (before) fs.copyFileSync(languages, `${languages}.bak.utu`);
const kept = before.replace(new RegExp(`\\n?${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}\\n?`), '\n').trimEnd();

if (remove) {
  fs.writeFileSync(languages, kept ? kept + '\n' : '');
  fs.rmSync(queries, { recursive: true, force: true });
  fs.rmSync(path.join(config, 'runtime', 'grammars', 'utu.so'), { force: true });
  console.log(`removed utu from ${languages}, its queries, and its grammar`);
  process.exit(0);
}

const entry = fs.readFileSync(path.join(here, 'languages.toml'), 'utf8')
  .replace(/^#.*\n/gm, '').trim().replaceAll('@REPO@', repo);
fs.writeFileSync(languages, `${kept ? kept + '\n\n' : ''}${BEGIN}\n${entry}\n${END}\n`);
console.log(`wrote utu's language, language server, and grammar to ${languages}`);

fs.rmSync(queries, { recursive: true, force: true });
fs.cpSync(path.join(here, 'queries', 'utu'), queries, { recursive: true });
console.log(`copied queries to ${queries}`);

// The grammar, built from this repository's src/parser.c and src/scanner.c
// into Helix's runtime (what `hx --grammar build` would do, for utu alone).
const grammars = path.join(config, 'runtime', 'grammars');
fs.mkdirSync(grammars, { recursive: true });
const library = path.join(grammars, process.platform === 'win32' ? 'utu.dll' : 'utu.so');
const cc = spawnSync(process.env.CC ?? 'cc', ['-shared', '-fPIC', '-O2', '-I', path.join(repo, 'src'),
  path.join(repo, 'src', 'parser.c'), path.join(repo, 'src', 'scanner.c'), '-o', library], { encoding: 'utf8' });
if (cc.error || cc.status !== 0) {
  console.error(`could not build the grammar: ${cc.error?.message ?? cc.stderr}`);
  process.exit(1);
}
console.log(`built the grammar: ${library}`);
const health = spawnSync('hx', ['--health', 'utu'], { encoding: 'utf8' });
if (!health.error) console.log(health.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim());
