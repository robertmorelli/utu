// src/selfhost/lsp.js — a language server on the self-hosted compiler.
//
// Every answer comes from a build of the program whose entry is the file
// asked about: its diagnostics (both builds `utu check` makes, the exports'
// and the tests'), and what its names resolve to (query.js: the tools'
// lsp.utu and query.utu, so `utu` is the tools, loadNodeCompiler). A build takes
// milliseconds, so there is nothing incremental: the compiler holds one
// program, and a question about another file, or after an edit, builds again.
//
// Nothing here touches a file system or a stream. The host gives the
// compiler, `hostFor(key)` (a compile host for a program whose entry is file
// `key`, as nodeHost makes), `toKey(uri)` and `toUri(key)` (null for a file
// an editor cannot open), `send(message)`, and optionally `listFiles(dirs)`
// (the keys of the .utu files under directories `dirs`, for what imports a
// file renamed: an array, or { files, unlisted } as node.js's
// utuFiles gives); it calls `handle(message)` with each message the editor sends.

import { compile } from './compiler.js';
import { importPaths, isNewName, programIndex } from './query.js';

const SEMANTIC_TYPES = ['namespace', 'type', 'enum', 'enumMember', 'struct', 'property', 'function', 'method', 'variable', 'parameter', 'interface', 'typeParameter'];
const SEMANTIC_MODIFIERS = ['declaration'];

// The name written where one is being typed, for completion's build.
const PLACEHOLDER = '__utu_completing';

const ENTRY_POINT = "main is the program's entry point: it is not renamed";

export function createLanguageServer({ utu, hostFor, toKey, toUri, send, listFiles = null, log = () => {} }) {
  const docs = new Map();  // key → { uri, text, version }
  let generation = 0;
  let current = null;      // the program the compiler holds: { key, generation, index, files, diagnostics }
  let queue = Promise.resolve();
  let refreshTimer = null;
  const published = new Set();  // keys with diagnostics shown
  const unopened = new Map();    // key → the files not open its last build showed mistakes in
  const lastGood = new Map();    // key → its text when it last parsed and its imports resolved
  let shutdown = false;
  let roots = [];                // the workspace's folders, as keys

  // An open document's own URI (an unsaved buffer's `untitled:` one too); else the host's.
  const uriOf = key => docs.get(key)?.uri ?? toUri(key);

  // One build at a time: the compiler holds one program.
  const serial = work => {
    const run = queue.then(work);
    queue = run.catch(() => {});
    return run;
  };

  /** The text a program sees for a file: `patch`'s (its `more` too), or the editor's when it is open. */
  function overlay(host, patch) {
    const text = file => patch?.more?.get(file) ?? (patch?.key === file ? patch.text : docs.get(file)?.text);
    return { ...host, readFile: file => { const t = text(file); return t != null ? Promise.resolve(t) : host.readFile(file); } };
  }

  // The program with entry `key`, built (unless the compiler holds it). With
  // `patch` ({ key, text, more? }), one file's text (and each of `more`'s,
  // a Map key → text) is another for this build only.
  async function build(key, patch = null) {
    const signature = patch && [patch.key, patch.text, ...[...patch.more ?? []].flat()].join('\0');
    if (!patch && current && current.key === key && current.generation === generation) return current;
    if (patch && current && current.key === key && current.patch === signature && current.patchGeneration === generation) return current;
    const host = overlay(hostFor(key), patch);
    const started = performance.now();
    // The tests' build first: the program built last is the one queried.
    const tests = patch ? null : await compile(utu, key, { ...host, target: 'test', optimize: 'none' });
    const normal = await compile(utu, key, { ...host, target: 'normal', optimize: 'none' });
    const analysis = await compile(utu, key, { ...host, target: 'analysis', optimize: 'none' });
    const seen = new Set();
    const diagnostics = [...normal.diagnostics, ...analysis.diagnostics, ...tests?.diagnostics ?? []].filter(d => {
      const id = `${d.file}\0${d.start}\0${d.end}\0${d.message}`;
      return !seen.has(id) && seen.add(id);
    });
    const program = {
      key, generation: patch ? -1 : generation, patch: signature, patchGeneration: generation,
      files: analysis.files, index: programIndex(utu, analysis.files), diagnostics,
    };
    current = program;
    if (!patch && analyzed(program, key)) lastGood.set(key, textOf(program, key));
    log(`built ${key}${patch ? ' (patched)' : ''} in ${(performance.now() - started).toFixed(1)} ms`);
    return program;
  }

  const textOf = (program, key) => docs.get(key)?.text ?? program.files.find(f => f.key === key)?.text ?? null;

  /** Whether a build analyzed file `key`: it parsed, its imports resolved, it declares something. */
  const analyzed = (program, key) =>
    !program.diagnostics.some(d => d.file === key && (d.kind === 'parse-error' || d.kind === 'unknown-import'))
    && program.index.declarations(key).length > 0;

  function publish(key, program) {
    const doc = docs.get(key);
    // A standard library file (where definitions lead) built as a program of
    // its own would declare the prelude's types twice: its mistakes are not shown.
    if (!doc || key.startsWith('std:')) return;
    const lines = lineStarts(doc.text);
    // The diagnostic's own kind, its notes after its message, the other
    // places it is about, and its fix (kept for a quick fix: codeAction).
    const diagnostic = (d, lines, here) => ({
      range: here ? range(lines, d.focus?.start ?? d.start, d.focus?.end ?? d.end) : range(lines, 0, 0),
      severity: d.severity === 'warning' ? 2 : 1,
      source: 'utu',
      code: d.code ?? d.kind,
      message: [d.message, ...(d.notes ?? []).map(note => `note: ${note}`)].join('\n'),
      relatedInformation: (d.related ?? []).flatMap(r => {
        const place = location(program, r);
        return place ? [{ location: place, message: r.label || 'related' }] : [];
      }),
      data: d.fix && uriOf(d.fix.file ?? d.file) ? { fix: { ...d.fix, uri: uriOf(d.fix.file ?? d.file) } } : undefined,
    });
    const diagnostics = program.diagnostics.filter(d => d.file === key || d.file == null).map(d => diagnostic(d, lines, d.file === key));
    if (diagnostics.length) published.add(key);
    if (diagnostics.length || published.delete(key)) {
      send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: doc.uri, version: doc.version, diagnostics } });
    }
    // Mistakes in a file the editor has not opened (one this imports) are
    // shown on it, until a build of this no longer finds them.
    const others = new Map();
    for (const d of program.diagnostics) {
      if (d.file == null || d.file === key || docs.has(d.file) || !toUri(d.file)) continue;
      if (!others.has(d.file)) others.set(d.file, []);
      others.get(d.file).push(d);
    }
    for (const [file, list] of others) {
      const text = program.files.find(f => f.key === file)?.text ?? '';
      const fileLines = lineStarts(text);
      send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: toUri(file), diagnostics: list.map(d => diagnostic(d, fileLines, true)) } });
    }
    for (const file of unopened.get(key) ?? []) {
      if (!others.has(file) && !docs.has(file)) send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: toUri(file), diagnostics: [] } });
    }
    unopened.set(key, new Set(others.keys()));
  }

  // After an edit: the file edited, then every other open file (which may import it).
  function scheduleRefresh(first) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => serial(async () => {
      for (const key of [first, ...[...docs.keys()].filter(k => k !== first)]) {
        if (!docs.has(key)) continue;
        try { publish(key, await build(key)); } catch (error) { log(`build ${key}: ${error?.stack ?? error}`); }
      }
    }), 20);
  }

  /**
   * The program for a request's document, and the offset of its position.
   * While the document does not parse (or an import does not resolve), the
   * answers come from its last text that did (`stale`): `text` and
   * `offset` are that text's, `current` the document's, and `place(p)`
   * moves a place of that text to the document's (null for one in what was
   * edited since; with `clamp`, to the edit's edge).
   */
  async function at(params) {
    const key = toKey(params.textDocument.uri);
    let program = await build(key);
    const current = textOf(program, key);
    if (current == null) return null;
    let text = current, moved = null;
    const good = lastGood.get(key);
    if (good != null && good !== current && !analyzed(program, key)) {
      program = await build(key, { key, text: good });
      text = good;
      moved = shift(good, current);
    }
    const lines = lineStarts(current);
    const here = params.position ? offsetAt(lines, params.position, current.length) : 0;
    const offset = moved ? moved.toOld(here) : here;
    const place = (p, clamp = false) => {
      if (!moved || !p || p.file !== key) return p;
      const start = moved.toNew(p.start, clamp && 'start'), end = moved.toNew(p.end, clamp && 'end');
      return start < 0 || end < 0 ? null : { ...p, start, end };
    };
    const decl = params.position && offset >= 0 ? program.index.declarationAt(key, offset) : -1;
    return { key, program, text, current, lines, offset, decl, stale: !!moved, place };
  }

  /** Whether the name at a request's position is the program's `main`. */
  const entryPoint = q => q.program.index.entryPoint(q.key, q.offset);

  /**
   * The name at a request's position, when renaming it is allowed: it is
   * spelled as a name, and declared in a file the editor can change (not
   * the standard library's): what renaming it changes (see lsp.utu's
   * q_rename). An import's alias is this file's to rename, whatever it
   * names; a protocol's member is renamed with the functions implementing it.
   * Else null.
   */
  function renamed(q) {
    if (q.decl < 0) return null;
    const found = q.program.index.rename(q.key, q.offset);
    return found && (found.alias || found.defs.every(d => d && uriOf(d.file) && !d.file.startsWith('std:'))) ? found : null;
  }

  /** A place as an LSP location (moved to the document's text, for `q`), or null when no editor can open its file. */
  function location(program, place, q = null) {
    if (q) place = q.place(place);
    if (!place) return null;
    const uri = uriOf(place.file);
    const text = textOf(program, place.file);
    if (!uri || text == null) return null;
    return { uri, range: range(lineStarts(text), place.start, place.end) };
  }

  function hierarchyItem(program, item, q = null) {
    const span = location(program, item.span, q), selection = location(program, item.selection, q);
    if (!span || !selection) return null;
    return { name: item.name, kind: 12, detail: item.effects.labels.join(', '), uri: span.uri,
      range: span.range, selectionRange: selection.range,
      data: { entry: program.key, file: item.selection.file, start: item.selection.start } };
  }

  async function hierarchyQuery(item) {
    const key = item?.data?.entry ?? item?.data?.file ?? toKey(item?.uri);
    if (!key) return null;
    const program = await build(key);
    const decl = program.index.declarationNamed(item.data?.file, item.data?.start);
    return decl >= 0 ? { program, decl } : null;
  }

  const requests = {
    initialize: params => {
      roots = (params.workspaceFolders ?? (params.rootUri ? [{ uri: params.rootUri }] : [])).map(f => toKey(f.uri)).filter(Boolean);
      return {
        capabilities: {
          textDocumentSync: { openClose: true, change: 1, save: false },
          definitionProvider: true,
          referencesProvider: true,
          documentHighlightProvider: true,
          hoverProvider: true,
          inlayHintProvider: true,
          callHierarchyProvider: true,
          renameProvider: { prepareProvider: true },
          documentSymbolProvider: true,
          completionProvider: { triggerCharacters: ['.'] },
          semanticTokensProvider: { legend: { tokenTypes: SEMANTIC_TYPES, tokenModifiers: SEMANTIC_MODIFIERS }, full: true },
          codeActionProvider: { codeActionKinds: ['quickfix'] },
        },
        serverInfo: { name: 'utu' },
      };
    },

    shutdown: () => { shutdown = true; return null; },

    // Quick fixes: each diagnostic's fix, as one edit (sent with the diagnostic, in its data).
    'textDocument/codeAction': params => {
      const actions = [];
      for (const d of params.context?.diagnostics ?? []) {
        const fix = d.data?.fix;
        if (!fix) continue;
        const text = docs.get(toKey(fix.uri))?.text ?? current?.files.find(f => uriOf(f.key) === fix.uri)?.text;
        if (text == null) continue;
        const lines = lineStarts(text);
        actions.push({
          title: fix.label || 'Apply the fix', kind: 'quickfix', diagnostics: [d], isPreferred: true,
          edit: { changes: { [fix.uri]: [{ range: range(lines, fix.start, fix.end), newText: fix.text }] } },
        });
      }
      return actions;
    },

    'textDocument/definition': async params => {
      const q = await at(params);
      if (!q || q.decl < 0) return null;
      return location(q.program, q.program.index.definition(q.decl), q);
    },

    'textDocument/references': async params => {
      const q = await at(params);
      if (!q || q.decl < 0) return [];
      const includeDeclaration = params.context?.includeDeclaration ?? true;
      const here = q.program.index.linkedReferences(q.decl, includeDeclaration).map(place => location(q.program, place, q)).filter(Boolean);
      return q.stale ? here : unique([...here, ...(await importers(q, q.decl, null, includeDeclaration)).map(found => found.location)]);
    },

    'textDocument/documentHighlight': async params => {
      const q = await at(params);
      if (!q || q.decl < 0) return [];
      // (A name in a DSL body can be expanded into more than one place of the program: one highlight.)
      return unique(q.program.index.highlights(q.key, q.decl)
        .map(({ at, kind }) => [q.place(at), kind])
        .filter(([place]) => place)
        .map(([place, kind]) => ({ range: range(q.lines, place.start, place.end), kind })));
    },

    'textDocument/hover': async params => {
      const q = await at(params);
      if (!q || q.decl < 0) return null;
      const found = q.program.index.hover(q.key, q.offset);
      if (!found?.value) return null;
      const name = q.place(found.name);
      return { contents: { kind: 'markdown', value: found.value }, ...(name ? { range: range(q.lines, name.start, name.end) } : {}) };
    },

    'textDocument/inlayHint': async params => {
      const q = await at(params);
      if (!q) return [];
      const start = params.range ? offsetAt(q.lines, params.range.start, q.current.length) : 0;
      const end = params.range ? offsetAt(q.lines, params.range.end, q.current.length) : q.current.length;
      return q.program.index.inlayHints(q.key).flatMap(hint => {
        const moved = q.place({ file: q.key, start: hint.position, end: hint.position });
        if (!moved || moved.start < start || moved.start > end) return [];
        return [{ position: positionAt(q.lines, moved.start), label: hint.label, kind: hint.kind === 'type' ? 1 : 2,
          paddingLeft: hint.kind !== 'type' }];
      });
    },

    'textDocument/prepareCallHierarchy': async params => {
      const q = await at(params);
      return q ? q.program.index.prepareCallHierarchy(q.key, q.offset).map(item => hierarchyItem(q.program, item, q)).filter(Boolean) : [];
    },

    'callHierarchy/incomingCalls': async params => {
      const found = await hierarchyQuery(params.item);
      if (!found) return [];
      return found.program.index.incomingCalls(found.decl).flatMap(call => {
        const from = hierarchyItem(found.program, call.from);
        const fromRanges = call.sites.map(site => location(found.program, site)?.range).filter(Boolean);
        return from && fromRanges.length ? [{ from, fromRanges }] : [];
      });
    },

    'callHierarchy/outgoingCalls': async params => {
      const found = await hierarchyQuery(params.item);
      if (!found) return [];
      return found.program.index.outgoingCalls(found.decl).flatMap(call => {
        const to = hierarchyItem(found.program, call.to);
        const fromRanges = call.sites.map(site => location(found.program, site)?.range).filter(Boolean);
        return to && fromRanges.length ? [{ to, fromRanges }] : [];
      });
    },

    'textDocument/prepareRename': async params => {
      const q = await at(params);
      if (q?.stale) throw responseError(-32602, 'the file does not parse: rename once it does');
      if (q && entryPoint(q)) throw responseError(-32602, ENTRY_POINT);
      const name = q && renamed(q)?.name;
      return name ? { range: range(q.lines, name.start, name.end), placeholder: q.text.slice(name.start, name.end) } : null;
    },

    'textDocument/rename': async params => {
      const q = await at(params);
      if (q?.stale) throw responseError(-32602, 'the file does not parse: rename once it does');
      if (q && entryPoint(q)) throw responseError(-32602, ENTRY_POINT);
      // Names resolve past an import not found, but are not checked: a rename could not be.
      const stop = q?.program.diagnostics.find(d => d.kind === 'unknown-import' || d.kind === 'import-cycle');
      if (stop) throw responseError(-32602, `the program does not build (${stop.message}): no rename`);
      const found = q && renamed(q);
      if (!found) throw responseError(-32602, 'only a name declared in a file the editor can change is renamed');
      const { name } = found;
      if (!isNewName(utu, params.newName)) {
        throw responseError(-32602, `'${params.newName}' is not a name`);
      }
      const newName = params.newName;
      const spelling = q.text.slice(name.start, name.end);
      // Each place renamed, by file (start → end), and each file's text.
      const texts = new Map(), spans = new Map();
      const add = (place, text) => {
        if (!uriOf(place.file) || text == null) return;
        texts.set(place.file, text);
        if (!spans.has(place.file)) spans.set(place.file, new Map());
        spans.get(place.file).set(place.start, place.end);
      };
      for (const place of found.occurrences) add(place, place.file === q.key ? q.text : textOf(q.program, place.file));
      // The programs edited: this file's, and each importing the name's file.
      const entries = new Map([[q.key, { text: q.text, before: null }]]);
      if (!found.alias) {
        const found = await importers(q, q.decl, spelling, true, true);
        for (const place of found) add(place, place.text);
        for (const [key, entry] of found.entries) entries.set(key, entry);
      }
      const changes = {}, renamedTexts = new Map();
      for (const [file, list] of spans) {
        const sorted = [...list].sort((a, b) => a[0] - b[0]);
        spans.set(file, sorted);
        const text = texts.get(file), lines = lineStarts(text);
        changes[uriOf(file)] = sorted.map(([start, end]) => ({ range: range(lines, start, end), newText: newName }));
        let out = '', last = 0;
        for (const [start, end] of sorted) { out += text.slice(last, start) + newName; last = end; }
        renamedTexts.set(file, out + text.slice(last));
      }
      // An offset of a file before the rename, after it.
      const moved = (file, offset) => {
        let by = 0;
        for (const [start, end] of spans.get(file) ?? []) if (end <= offset) by += newName.length - (end - start);
        return offset + by;
      };
      // Each program the rename edits, as it was (an importer's, as found) and built after.
      for (const [key, entry] of entries) {
        const { text } = entry;
        const { errors: failed, files, was: bound } = entry.before ?? before(await build(key, { key, text }));
        const edited = [...renamedTexts.keys()].filter(file => bound.has(file));
        const was = edited.map(file => bound.get(file));
        const more = new Map([...renamedTexts].filter(([file]) => files.has(file)));
        const after = await build(key, { key, text: renamedTexts.get(key) ?? text, more });
        // A name that would then mean something else (a keyword, a type, a
        // name already there): the file renamed makes a mistake it did not.
        const made = after.diagnostics.filter(d => d.severity !== 'warning');
        if (made.length > failed.length) {
          const known = new Set(failed.map(d => d.message));
          const first = made.find(d => !known.has(d.message)) ?? made[0];
          throw responseError(-32602, `renaming to '${newName}' breaks the program: ${first.message}`);
        }
        // Or a name that would mean another declaration with no mistake: one
        // renamed, captured by a declaration nearer it, or another's, by this one.
        const textAfter = file => renamedTexts.get(file) ?? textOf(after, file) ?? '';
        const lineOf = (file, offset) => positionAt(lineStarts(textAfter(file)), offset).line + 1;
        const what = (kind, place, file) => {
          const words = `the ${kind.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`;
          if (!place) return words;
          return `${words} on line ${lineOf(place.file, place.start)}${place.file === file ? '' : ` of ${place.file.split(/[\\/]/).at(-1)}`}`;
        };
        edited.forEach((file, i) => {
          const now = new Map(after.index.bindings(file).map(b => [b.at.start, b]));
          for (const b of was[i]) {
            const n = now.get(moved(file, b.at.start));
            const meant = b.meant && { file: b.meant.file, start: moved(b.meant.file, b.meant.start) };
            if (!n || (meant?.file === n.meant?.file && meant?.start === n.meant?.start)) continue;
            throw responseError(-32602, `renaming to '${newName}' changes what a name means: '${textAfter(file).slice(n.at.start, n.at.end)}' on line ${lineOf(file, n.at.start)} would name ${what(n.kind, n.meant, file)}, not ${what(b.kind, meant, file)}`);
          }
        });
      }
      return { changes };
    },

    'textDocument/documentSymbol': async params => {
      const q = await at(params);
      if (!q) return [];
      const symbols = new Map();
      const roots = [];
      for (const { decl, owner, kind, name: text, span: whole, selection } of q.program.index.symbols(q.key)) {
        const name = q.place(selection), span = q.place(whole, true);
        if (!name || !span) continue;
        const symbol = {
          name: text, kind,
          range: range(q.lines, Math.min(span.start, name.start), Math.max(span.end, name.end)),
          selectionRange: range(q.lines, name.start, name.end), children: [],
        };
        symbols.set(decl, symbol);
        const parent = symbols.get(owner);
        (parent ? parent.children : roots).push(symbol);
      }
      return roots;
    },

    'textDocument/completion': async params => {
      const key = toKey(params.textDocument.uri);
      const text = docs.get(key)?.text;
      if (text == null) return [];
      const offset = offsetAt(lineStarts(text), params.position, text.length);
      return complete(key, text, offset);
    },

    'textDocument/semanticTokens/full': async params => {
      const q = await at(params);
      if (!q) return { data: [] };
      const data = [];
      let line = 0, character = 0;
      for (const { at: written, type: name, declaration: modifiers } of q.program.index.semanticTokens(q.key)) {
        const type = SEMANTIC_TYPES.indexOf(name);
        const place = q.place(written);
        if (!place) continue;
        const start = positionAt(q.lines, place.start);
        const end = positionAt(q.lines, place.end);
        if (end.line !== start.line) continue;
        data.push(start.line - line, start.line === line ? start.character - character : start.character, end.character - start.character, type, modifiers);
        line = start.line;
        character = start.character;
      }
      return { data };
    },
  };

  /**
   * Where declaration `decl` (of `q`'s program, with its family) is named in
   * the other programs that have its file: each open file's, and each file's
   * on disk that imports it (see onDisk). Spelled `spelling` (any, for
   * null): each place, with its `location` and the `text` of its file; and
   * `entries`, each such program's entry → its text and (see before) what
   * it is before the rename. With `strict` (a rename), a folder that cannot
   * be listed, or a file that cannot be read or (importing it) parsed, is an
   * error, not skipped. Each such program is built, so `q`'s index is not
   * read after.
   */
  async function importers(q, decl, spelling, includeDeclaration, strict = false) {
    // (A protocol's implementations import its file: found from the member's.)
    const definition = q.program.index.rootDefinition(decl);
    const out = Object.assign([], { entries: new Map() });
    if (!definition || definition.file.startsWith('std:')) return out;
    const disk = await onDisk(definition.file);
    const refuse = why => responseError(-32602, `${why}: no rename`);
    if (strict && disk.unlisted.length) throw refuse(`folder ${disk.unlisted[0]} cannot be listed`);
    if (strict && disk.unread.length) throw refuse(`${nameOf(disk.unread[0])} cannot be read`);
    const importing = new Set(disk.files);
    for (const key of new Set([...docs.keys(), ...disk.files])) {
      if (key === q.key) continue;
      let program;
      if (docs.has(key)) program = await build(key);
      else {
        let text;
        try { text = await hostFor(key).readFile(key); } catch {
          if (strict) throw refuse(`${nameOf(key)} cannot be read`);
          continue;
        }
        program = await build(key, { key, text });
      }
      // (One that does not parse, or whose build stops at an import, may
      // import it: its `using` says so.)
      const has = program.files.some(f => f.key === definition.file);
      if (strict && (has || importing.has(key))) {
        const imports = `${nameOf(key)}, which imports ${nameOf(definition.file)},`;
        if (program.diagnostics.some(d => d.file === key && d.kind === 'parse-error')) throw refuse(`${imports} does not parse`);
        // (Its names resolve, but are not checked.)
        const stop = program.diagnostics.find(d => d.kind === 'unknown-import' || d.kind === 'import-cycle');
        if (stop) throw refuse(`${imports} does not build (${stop.message})`);
      }
      if (!has) continue;
      out.entries.set(key, { text: textOf(program, key), before: strict ? before(program) : null });
      const same = program.index.declarationNamed(definition.file, definition.start, true);
      if (same < 0) continue;
      for (const place of program.index.linkedReferences(same, includeDeclaration, spelling ?? '')) {
        const where = location(program, place);
        if (where) out.push({ ...place, location: where, text: textOf(program, place.file) });
      }
    }
    return out;
  }

  /**
   * The files on disk (open or not) that import `file`, directly or through
   * another: of the .utu files under the workspace's folders (else the open
   * files' folders), each whose `using … from "…"` leads to it. `unread`:
   * those that cannot be read; `unlisted`: the folders that cannot be listed.
   * None when the host lists no files.
   */
  async function onDisk(file) {
    if (!listFiles) return { files: [], unread: [], unlisted: [] };
    const dirOf = key => /^[a-z][\w+.-]+:/i.test(key) ? null : key.replace(/[\\/][^\\/]*$/, '');
    const dirs = roots.length ? roots : [...new Set([file, ...docs.keys()].map(dirOf).filter(Boolean))];
    const importedBy = new Map();  // file → the files importing it
    const unread = [];
    const listed = await listFiles(dirs);
    const { files, unlisted = [] } = Array.isArray(listed) ? { files: listed } : listed;
    for (const key of new Set([...files, ...[...docs.keys()].filter(dirOf)])) {
      const host = hostFor(key);
      let text = docs.get(key)?.text;
      if (text == null) try { text = await host.readFile(key); } catch { unread.push(key); continue; }
      const targets = importPaths(utu, String(text)).filter(path => !/^[a-z][\w+.-]+:/i.test(path))
        .map(path => host.resolvePath ? host.resolvePath(key, path) : path);
      for (const target of targets) {
        if (!importedBy.has(target)) importedBy.set(target, new Set());
        importedBy.get(target).add(key);
      }
    }
    const found = new Set([file]);
    for (const f of found) for (const by of importedBy.get(f) ?? []) found.add(by);
    found.delete(file);
    return { files: [...found], unread, unlisted };
  }

  /**
   * What a rename checks a program (the one the compiler holds) against
   * after: its `errors`, its `files`, and the bindings of each file an
   * editor can change (`was`, file → bindings).
   */
  function before(program) {
    const files = new Set(program.files.map(f => f.key));
    const was = new Map([...files].filter(f => !f.startsWith('std:') && uriOf(f)).map(f => [f, program.index.bindings(f)]));
    return { errors: program.diagnostics.filter(d => d.severity !== 'warning'), files, was };
  }

  /**
   * What may be written at `offset` (see lsp.utu's q_completions). The text
   * there rarely parses, so the build is of the text with a name where the
   * one being typed is (and a `;` after it, when that is needed).
   */
  async function complete(key, text, offset) {
    // Nothing is written in a comment, a string, or a DSL's body.
    const start = (await build(key)).index.completionStart(key, offset);
    if (start < 0) return [];
    let program = null;
    for (const tail of ['', ';', ');', ' }']) {
      const patched = `${text.slice(0, start)}${PLACEHOLDER}${tail}${text.slice(offset)}`;
      program = await build(key, { key, text: patched });
      if (!program.diagnostics.some(d => d.kind === 'parse-error')) break;
    }
    return program.index.completions(key, start, PLACEHOLDER);
  }

  async function notify(message) {
    const { method, params } = message;
    if (method === 'textDocument/didOpen') {
      const { uri, text, version } = params.textDocument;
      docs.set(toKey(uri), { uri, text, version });
      generation++;
      scheduleRefresh(toKey(uri));
    } else if (method === 'textDocument/didChange') {
      const key = toKey(params.textDocument.uri);
      const doc = docs.get(key);
      if (!doc) return;
      // Full sync: the last change is the whole text.
      const change = params.contentChanges?.at(-1);
      if (change && change.range == null) doc.text = change.text;
      doc.version = params.textDocument.version;
      generation++;
      scheduleRefresh(key);
    } else if (method === 'textDocument/didClose') {
      const key = toKey(params.textDocument.uri);
      const doc = docs.get(key);
      docs.delete(key);
      lastGood.delete(key);
      generation++;
      if (doc && published.delete(key)) send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: doc.uri, diagnostics: [] } });
      // What only this file's builds showed on files not open goes with it.
      const shown = unopened.get(key) ?? new Set();
      unopened.delete(key);
      const still = new Set([...unopened.values()].flatMap(files => [...files]));
      for (const file of shown) {
        if (!still.has(file) && !docs.has(file) && toUri(file)) send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: toUri(file), diagnostics: [] } });
      }
      // The other open files saw its unsaved text, or showed its mistakes: built again.
      if (docs.size) scheduleRefresh([...docs.keys()][0]);
    }
  }

  return {
    /** Answer one message from the editor. Resolves when `exit` should end the process (with its code). */
    async handle(message) {
      if (message?.method === 'exit') return { exit: shutdown ? 0 : 1 };
      if (message?.id == null) {
        // A notification the server cannot follow is dropped: it has no one to answer.
        try { await notify(message ?? {}); } catch (error) { log(`${message?.method}: ${error?.stack ?? error}`); }
        return null;
      }
      const answer = requests[message.method];
      const fail = (code, text) => send({ jsonrpc: '2.0', id: message.id, error: { code, message: text } });
      if (shutdown) return fail(-32600, 'the server is shut down'), null;
      if (!answer) return fail(-32601, `${message.method} is not supported`), null;
      try {
        const result = message.method === 'initialize' || message.method === 'shutdown'
          ? await answer(message.params ?? {})
          : await serial(() => answer(message.params ?? {}));
        send({ jsonrpc: '2.0', id: message.id, result: result ?? null });
      } catch (error) {
        // A response error is a number and a message; anything else thrown is internal.
        if (typeof error?.code === 'number') fail(error.code, error.message);
        else fail(error instanceof TypeError ? -32602 : -32603, String(error?.message ?? error));
        log(`${message.method}: ${error?.stack ?? error}`);
      }
      return null;
    },
    /** Builds and answers still running (for tests). */
    idle: () => new Promise(resolve => setTimeout(() => resolve(queue), 30)),
  };
}

/** Locations, each once. */
function unique(locations) {
  const seen = new Set();
  return locations.filter(l => { const id = JSON.stringify(l); return !seen.has(id) && seen.add(id); });
}

/**
 * Offsets between `before` and `after`, one text edited into the other, by
 * the lines they share (in order, the longest such run). toOld (of an
 * offset of `after`) and toNew (of one of `before`) give -1 on a line the
 * edit changed, or with `clamp` ('start' or 'end') the nearest shared
 * line's start after it, or end before it.
 */
function shift(before, after) {
  const lines = text => {
    const starts = lineStarts(text);
    return { starts, rows: starts.map((s, i) => text.slice(s, i + 1 < starts.length ? starts[i + 1] : text.length)) };
  };
  const b = lines(before), a = lines(after);
  const toA = new Int32Array(b.rows.length).fill(-1), toB = new Int32Array(a.rows.length).fill(-1);
  let head = 0;
  while (head < b.rows.length && head < a.rows.length && b.rows[head] === a.rows[head]) { toA[head] = head; toB[head] = head; head++; }
  let tail = 0;
  while (tail < b.rows.length - head && tail < a.rows.length - head && b.rows[b.rows.length - 1 - tail] === a.rows[a.rows.length - 1 - tail]) {
    toA[b.rows.length - 1 - tail] = a.rows.length - 1 - tail;
    toB[a.rows.length - 1 - tail] = b.rows.length - 1 - tail;
    tail++;
  }
  // The lines between: matched by their longest common run, when that is not too costly.
  const n = b.rows.length - head - tail, m = a.rows.length - head - tail;
  if (n > 0 && m > 0 && n * m <= 4e6) {
    const table = new Int32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * (m + 1) + j] = b.rows[head + i] === a.rows[head + j] ? table[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(table[(i + 1) * (m + 1) + j], table[i * (m + 1) + j + 1]);
      }
    }
    for (let i = 0, j = 0; i < n && j < m;) {
      if (b.rows[head + i] === a.rows[head + j]) { toA[head + i] = head + j; toB[head + j] = head + i; i++; j++; }
      else if (table[(i + 1) * (m + 1) + j] >= table[i * (m + 1) + j + 1]) i++;
      else j++;
    }
  }
  const lineOf = (starts, o) => positionAt(starts, o).line;
  const move = (from, to, map, o, clamp) => {
    const line = lineOf(from.starts, o);
    if (map[line] >= 0) return to.starts[map[line]] + (o - from.starts[line]);
    if (clamp === 'start') { for (let k = line + 1; k < map.length; k++) if (map[k] >= 0) return to.starts[map[k]]; }
    if (clamp === 'end') { for (let k = line - 1; k >= 0; k--) if (map[k] >= 0) return to.starts[map[k]] + to.rows[map[k]].length; }
    return -1;
  };
  return { toOld: o => move(a, b, toB, o), toNew: (o, clamp) => move(b, a, toA, o, clamp) };
}

/** A file's name, without its folder. */
function nameOf(key) {
  return key.split(/[\\/]/).at(-1);
}

function responseError(code, message) {
  return Object.assign(new Error(message), { code });
}

/** Where each line of `text` starts (UTF-16 offsets): a line ends at \n, \r\n, or a lone \r. */
function lineStarts(text) {
  const starts = [0];
  for (const m of text.matchAll(/\r\n?|\n/g)) starts.push(m.index + m[0].length);
  return starts;
}

function positionAt(lines, offset) {
  let lo = 0, hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return { line: lo, character: offset - lines[lo] };
}

/** A position's offset; one past its line's end is its end, one past the text's is the text's. */
function offsetAt(lines, { line, character }, length = Infinity) {
  if (line < 0) return 0;
  if (line >= lines.length) return length === Infinity ? lines[lines.length - 1] : length;
  const end = line + 1 < lines.length ? lines[line + 1] - 1 : length;
  return lines[line] + Math.max(0, Math.min(character, end - lines[line]));
}

function range(lines, start, end) {
  return { start: positionAt(lines, start), end: positionAt(lines, end) };
}
