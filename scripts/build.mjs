// scripts/build.mjs — Utu build script
//
// Usage:
//   bun run build           — regenerate platform-sources.generated.js only
//   bun run build --grammar — also regenerate src/parser.c + tree-sitter-utu.wasm
//                             from src/grammar.json (requires tree-sitter CLI)
//   bun run build --wasm    — regenerate wasm only (skips grammar.json → parser.c)
//
// Grammar source of truth:
//   grammar.cjs + grammar/rules/*.cjs  →  (manual: tree-sitter generate src/grammar.json)
//                                              ↓
//                                       src/parser.c, src/node-types.json
//                                              ↓  (--wasm)
//                                       tree-sitter-utu.wasm
//
// When you change grammar.cjs / grammar/rules/*.cjs:
//   1. Apply the same change to src/grammar.json (it is the canonical parser input)
//   2. Run `bun run build --grammar` to regenerate parser.c + wasm

import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const STD_DIR = path.join(ROOT, 'std');
const GRAMMAR_JSON = path.join(ROOT, 'src', 'grammar.json');
const OUT_FILE = path.join(ROOT, 'src', 'compiler', 'platform-sources.generated.js');

const args = new Set(process.argv.slice(2));
const buildGrammar = args.has('--grammar') || args.has('--wasm');
const buildWasm    = args.has('--wasm');

async function main() {
  if (buildGrammar) await generateParser();
  await generatePlatformSources();
}

// ── Parser (parser.c + wasm) ──────────────────────────────────────────────────

async function generateParser() {
  console.log('Regenerating parser from src/grammar.json…');
  execSync(`tree-sitter generate ${GRAMMAR_JSON}`, { cwd: ROOT, stdio: 'inherit' });

  if (buildWasm) {
    console.log('Building wasm…');
    try {
      execSync('tree-sitter build --wasm', { cwd: ROOT, stdio: 'inherit' });
    } catch {
      console.warn('Warning: wasm build failed (emscripten may not be installed). Skipping.');
    }
  }
}

// ── Platform sources ──────────────────────────────────────────────────────────

async function generatePlatformSources() {
  const entries = await loadStdEntries();
  const lines = [
    '// Generated platform source registry.',
    '// Run `bun run build` to refresh from std/*.utu.',
    '',
    'export const PLATFORM_SOURCES = new Map([',
    ...entries.map(({ key, source }) => `  [${JSON.stringify(key)}, ${JSON.stringify(source)}],`),
    ']);',
    '',
  ];
  await fs.writeFile(OUT_FILE, lines.join('\n'));
}

async function loadStdEntries() {
  let dirents = [];
  try {
    dirents = await fs.readdir(STD_DIR, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const files = dirents
    .filter(dirent => dirent.isFile() && dirent.name.endsWith('.utu'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const entries = [];
  for (const file of files) {
    const name = path.basename(file.name, '.utu');
    const key = `std:${name}`;
    const source = await fs.readFile(path.join(STD_DIR, file.name), 'utf8');
    entries.push({ key, source });
  }
  return entries;
}

await main();
