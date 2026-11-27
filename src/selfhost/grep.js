// src/selfhost/grep.js — semantic grep: utu code by its syntax, names, and types.
//
// The matching is selfhost/tools/grep.utu's, in dist/utu.wasm (on
// the compiler's own tree and types): this runs it over a build of each
// entry file, and reads what it found.

import { compile } from './compiler.js';

/**
 * Run a query over each entry file: a pattern (with `where`), or the
 * references of a name. `utu` is loadNodeCompiler()'s. Returns
 * { matches: [{ at, bindings?, kind?, declaration? }], texts, skipped, unmatched, error }.
 */
export async function grep(utu, entries, hostFor, { pattern = null, where = {}, references = null } = {}) {
  let parsed = 0;
  try { parsed = utu.grep_pattern(pattern ?? ''); } catch {}
  if (pattern && !parsed) return { matches: [], error: `the pattern is not utu: ${pattern}` };
  const stray = Object.keys(where).find(name => !utu.grep_where(name, where[name]));
  if (stray !== undefined) return { matches: [], error: `--where names $${stray}, which the pattern has not` };
  const skipped = new Set();
  const seen = new Set();
  const matches = [];
  const add = match => {
    const key = `${match.at.file}\0${match.at.start}\0${match.at.end}`;
    if (!seen.has(key)) { seen.add(key); matches.push(match); }
  };
  const texts = new Map();
  for (const entry of entries) {
    // Both builds: the exports' functions are checked in one, the tests in the other.
    for (const target of ['normal', 'test']) {
      const built = await compile(utu, entry, { ...hostFor(entry), target, optimize: 'none' });
      for (const file of built.files) texts.set(file.key, file.text);
      // A file that does not parse has no tree to search.
      for (const d of built.diagnostics) if (d.kind === 'parse-error' && d.file != null) skipped.add(d.file);
      const place = (f, start, end) => f === '-' ? null : { file: built.files[f].key, start: Number(start), end: Number(end) };
      if (pattern) {
        let match = null;
        for (const line of utu.grep_match().split('\n')) {
          const [tag, name, ...at] = line.split(' ');
          if (tag === 'm') add(match = { at: place(name, ...at), bindings: {} });
          else if (tag === 'b') match.bindings[name] = place(...at);
        }
      }
      if (!references) continue;
      for (const line of utu.grep_refs(references).split('\n')) {
        const [tag, kind, ...at] = line.split(' ');
        if (tag) add({ at: place(...at), kind, ...tag === 'd' && { declaration: true } });
      }
    }
  }
  matches.sort((a, b) => a.at.file.localeCompare(b.at.file) || a.at.start - b.at.start);
  // A constraint no candidate met: its type is likely misspelled.
  const unmatched = utu.grep_unmatched().split('\n').filter(Boolean)
    .map(line => { const [hole, type, ...seen] = line.split('\t'); return { hole, type, seen }; });
  return { matches, texts, skipped: [...skipped], unmatched };
}
