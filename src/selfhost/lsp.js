// src/selfhost/lsp.js — a language server on the self-hosted compiler.
//
// Every answer comes from a build of the program whose entry is the file
// asked about: its diagnostics (both builds `utu check` makes, the exports'
// and the tests'), and what its names resolve to (query.js). A build takes
// milliseconds, so there is nothing incremental: the compiler holds one
// program, and a question about another file, or after an edit, builds again.
//
// Nothing here touches a file system or a stream. The host gives the
// compiler, `hostFor(key)` (a compile host for a program whose entry is file
// `key`, as nodeHost makes), `toKey(uri)` and `toUri(key)` (null for a file
// an editor cannot open), and `send(message)`; it calls `handle(message)`
// with each message the editor sends.

import { compile } from './compiler.js';
import { programIndex } from './query.js';
import { docComments, typstToMarkdown } from './docs.js';

const SEMANTIC_TYPES = ['namespace', 'type', 'enum', 'enumMember', 'struct', 'property', 'function', 'method', 'variable', 'parameter', 'interface', 'typeParameter'];
const SEMANTIC_MODIFIERS = ['declaration'];

// resolve.utu's Decl kinds as an editor names them.
const SEMANTIC_KIND = {
  Module: 'namespace', Foreign: 'namespace', ModuleParam: 'typeParameter', Struct: 'struct', Enum: 'enum', IntEnum: 'enum',
  Variant: 'enumMember', Field: 'property', Proto: 'interface', ProtoMember: 'method', TypeDecl: 'type', Distinct: 'type',
  Alias: 'type', Fn: 'function', Main: 'function', Global: 'variable', Mem: 'variable', Param: 'parameter', SelfParam: 'parameter',
  ClosureParam: 'parameter', Local: 'variable', Capture: 'variable', ArmBinding: 'variable', Promoted: 'variable', Caught: 'variable',
};

// LSP's SymbolKind, for the declarations an outline shows.
const SYMBOL_KIND = {
  Module: 2, Foreign: 2, Struct: 23, Enum: 10, IntEnum: 10, Variant: 22, Field: 8, Proto: 11, ProtoMember: 6,
  TypeDecl: 5, Distinct: 5, Fn: 12, Main: 12, Global: 13, Mem: 18,
};

// LSP's CompletionItemKind.
const COMPLETION_KIND = {
  Module: 9, Foreign: 9, ModuleParam: 25, Struct: 22, Enum: 13, IntEnum: 13, Variant: 20, Field: 5, Proto: 8, ProtoMember: 2,
  TypeDecl: 7, Distinct: 7, Alias: 9, Fn: 3, Main: 3, Global: 6, Mem: 6, Param: 6, SelfParam: 6, ClosureParam: 6, Local: 6,
  Capture: 6, ArmBinding: 6, Promoted: 6, Caught: 6,
};

const KEYWORDS = ['mod', 'using', 'struct', 'proto', 'enum', 'fn', 'let', 'mem', 'vec', 'export', 'const', 'type', 'distinct',
  'test', 'bench', 'fun', 'cl', 'await', 'assert', 'not', 'and', 'or', 'xor', 'orelse', 'if', 'else', 'promote', 'try', 'catch',
  'match', 'loop', 'alt', 'for', 'while', 'break', 'continue', 'defer', 'return', 'fatal', 'yield', 'true', 'false', 'null', 'new'];

// What the prelude offers every program by name: its modules and types.
const PRELUDE_KINDS = new Set(['Module', 'Struct', 'Enum', 'IntEnum', 'Proto', 'TypeDecl', 'Distinct']);

// lex.utu's Tok kinds completion offers nothing in: strings, DSL bodies,
// comments, and a template's text.
const QUIET_TOKENS = new Set([5, 6, 7, 8, 9, 10, 11, 12]);

// The name written where one is being typed, for completion's build.
const PLACEHOLDER = '__utu_completing';

// Declarations of values that live in a function: their hover shows the type checked.
const LOCAL_KINDS = new Set(['Param', 'SelfParam', 'ClosureParam', 'Local', 'Capture', 'ArmBinding', 'Promoted', 'Caught']);

export function createLanguageServer({ utu, hostFor, toKey, toUri, send, log = () => {} }) {
  const docs = new Map();  // key → { uri, text, version }
  let generation = 0;
  let current = null;      // the program the compiler holds: { key, generation, index, files, diagnostics }
  let queue = Promise.resolve();
  let refreshTimer = null;
  const published = new Set();  // keys with diagnostics shown
  const unopened = new Map();    // key → the files not open its last build showed mistakes in
  const lastGood = new Map();    // key → its text when it last parsed and its imports resolved
  let shutdown = false;

  // An open document's own URI (an unsaved buffer's `untitled:` one too); else the host's.
  const uriOf = key => docs.get(key)?.uri ?? toUri(key);

  // One build at a time: the compiler holds one program.
  const serial = work => {
    const run = queue.then(work);
    queue = run.catch(() => {});
    return run;
  };

  /** The text a program sees for a file: the editor's when it is open, or `patch`'s. */
  function overlay(host, patch) {
    const text = file => patch?.key === file ? patch.text : docs.get(file)?.text;
    return { ...host, readFile: file => { const t = text(file); return t != null ? Promise.resolve(t) : host.readFile(file); } };
  }

  // The program with entry `key`, built (unless the compiler holds it). With
  // `patch` ({ key, text }), one file's text is another for this build only.
  async function build(key, patch = null) {
    if (!patch && current && current.key === key && current.generation === generation) return current;
    if (patch && current && current.key === key && current.patch === patch.text && current.patchGeneration === generation) return current;
    const host = overlay(hostFor(key), patch);
    const started = performance.now();
    // The tests' build first: the program built last is the one queried.
    const tests = patch ? null : await compile(utu, key, { ...host, target: 'test', optimize: 'none' });
    const normal = await compile(utu, key, { ...host, target: 'normal', optimize: 'none' });
    const seen = new Set();
    const diagnostics = [...normal.diagnostics, ...tests?.diagnostics ?? []].filter(d => {
      const id = `${d.file}\0${d.start}\0${d.end}\0${d.message}`;
      return !seen.has(id) && seen.add(id);
    });
    const program = {
      key, generation: patch ? -1 : generation, patch: patch?.text ?? null, patchGeneration: generation,
      files: normal.files, index: programIndex(utu, normal.files), diagnostics,
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

  /**
   * The name at a request's position, when renaming it is allowed: it is
   * spelled as a name, and declared in a file the editor can change (not
   * the standard library's). Else null.
   */
  function renamed(q) {
    if (q.decl < 0) return null;
    const { index } = q.program;
    const name = index.references(q.decl).find(place => place.file === q.key && place.start <= q.offset && q.offset <= place.end);
    const spelling = name ? q.text.slice(name.start, name.end) : '';
    if (!/^[A-Za-z_]\w*$/.test(spelling)) return null;
    // An alias is this file's to rename, whatever it names.
    if (isAlias(q, name)) return name;
    const definition = index.definition(q.decl);
    return definition && uriOf(definition.file) && !definition.file.startsWith('std:') ? name : null;
  }

  /**
   * Where the name at a request's position (`name`) is written. An import's
   * alias (`using shapes |Point| …`) is its file's own name for the module
   * or its type: each place this file spells it so, whatever it resolves
   * to there (the alias, the type, the module). Any other name: its
   * references, as it is spelled (not the `&` a module declares its type by).
   */
  function occurrences(q, name) {
    const { index } = q.program;
    const spelling = q.text.slice(name.start, name.end);
    const alias = isAlias(q, name);
    if (alias) {
      return index.names(q.key)
        .filter(n => index.text(n.at) === spelling && (n.decl === alias.decl || index.text(index.definition(n.decl) ?? n.at) !== spelling))
        .map(n => n.at);
    }
    return index.references(q.decl).filter(place => index.text(place) === spelling);
  }

  /** The import alias (`using m |Point| …`) of `q`'s file that the name at `name` spells, or undefined. */
  function isAlias(q, name) {
    const { index } = q.program;
    const spelling = q.text.slice(name.start, name.end);
    return index.declarations(q.key).find(d => d.kind === 'Alias' && index.text(index.definition(d.decl) ?? name) === spelling);
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

  const requests = {
    initialize: () => ({
      capabilities: {
        textDocumentSync: { openClose: true, change: 1, save: false },
        definitionProvider: true,
        referencesProvider: true,
        documentHighlightProvider: true,
        hoverProvider: true,
        renameProvider: { prepareProvider: true },
        documentSymbolProvider: true,
        completionProvider: { triggerCharacters: ['.'] },
        semanticTokensProvider: { legend: { tokenTypes: SEMANTIC_TYPES, tokenModifiers: SEMANTIC_MODIFIERS }, full: true },
        codeActionProvider: { codeActionKinds: ['quickfix'] },
      },
      serverInfo: { name: 'utu' },
    }),

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
      const here = q.program.index.references(q.decl, { includeDeclaration }).map(place => location(q.program, place, q)).filter(Boolean);
      return q.stale ? here : unique([...here, ...await importers(q, q.decl, null, includeDeclaration)]);
    },

    'textDocument/documentHighlight': async params => {
      const q = await at(params);
      if (!q || q.decl < 0) return [];
      const definition = q.program.index.definition(q.decl);
      return q.program.index.references(q.decl)
        .filter(place => place.file === q.key)
        .map(place => [q.place(place), definition && place.start === definition.start && place.file === definition.file ? 3 : 2])
        .filter(([place]) => place)
        .map(([place, kind]) => ({ range: range(q.lines, place.start, place.end), kind }));
    },

    'textDocument/hover': async params => {
      const q = await at(params);
      if (!q || q.decl < 0) return null;
      const contents = hover(q.program, q.decl, q);
      if (!contents) return null;
      const name = q.place(q.program.index.references(q.decl).find(place => place.file === q.key && place.start <= q.offset && q.offset <= place.end));
      return { contents: { kind: 'markdown', value: contents }, ...(name ? { range: range(q.lines, name.start, name.end) } : {}) };
    },

    'textDocument/prepareRename': async params => {
      const q = await at(params);
      if (q?.stale) throw responseError(-32602, 'the file does not parse: rename once it does');
      const name = q && renamed(q);
      return name ? { range: range(q.lines, name.start, name.end), placeholder: q.text.slice(name.start, name.end) } : null;
    },

    'textDocument/rename': async params => {
      const q = await at(params);
      if (q?.stale) throw responseError(-32602, 'the file does not parse: rename once it does');
      const name = q && renamed(q);
      if (!name) throw responseError(-32602, 'only a name declared in a file the editor can change is renamed');
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(params.newName) || KEYWORDS.includes(params.newName)) {
        throw responseError(-32602, `'${params.newName}' is not a name`);
      }
      const spelling = q.text.slice(name.start, name.end);
      const alias = isAlias(q, name);
      const places = occurrences(q, name);
      const edits = [...places.map(place => location(q.program, place)), ...alias ? [] : await importers(q, q.decl, spelling, true)];
      const changes = {};
      for (const where of unique(edits.filter(Boolean))) (changes[where.uri] ??= []).push({ range: where.range, newText: params.newName });
      // A name that would then mean something else (a keyword, a type, a
      // name already there): the file renamed makes a mistake it did not.
      const renamedText = applyEdits(q.text, (changes[uriOf(q.key)] ?? []).map(e => e.range), q.lines, params.newName);
      const errors = program => program.diagnostics.filter(d => d.severity !== 'warning');
      const before = errors(await build(q.key, { key: q.key, text: q.text }));
      const known = new Set(before.map(d => d.message));
      const made = errors(await build(q.key, { key: q.key, text: renamedText }));
      if (made.length > before.length) {
        const first = made.find(d => !known.has(d.message)) ?? made[0];
        throw responseError(-32602, `renaming to '${params.newName}' breaks the program: ${first.message}`);
      }
      return { changes };
    },

    'textDocument/documentSymbol': async params => {
      const q = await at(params);
      if (!q) return [];
      const { index } = q.program;
      const symbols = new Map();
      const roots = [];
      for (const { decl, kind, owner, span: whole } of index.declarations(q.key)) {
        if (!(kind in SYMBOL_KIND)) continue;
        const declared = index.definition(decl);
        if (!declared || declared.file !== q.key) continue;
        const name = q.place(declared), span = q.place(whole, true);
        if (!name || !span) continue;
        // A module's own type (`struct &`) is known by the module's name.
        const ownerName = owner >= 0 && index.kind(owner) === 'Module' ? index.definition(owner) : null;
        const text = index.text(declared) === '&' && ownerName ? index.text(ownerName) : index.text(declared);
        const symbol = {
          name: text, kind: SYMBOL_KIND[kind],
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
      const { index } = q.program;
      const declared = new Map();
      const data = [];
      let line = 0, character = 0;
      for (const { decl, at: written } of index.names(q.key)) {
        const type = SEMANTIC_TYPES.indexOf(SEMANTIC_KIND[index.kind(decl)]);
        const place = q.place(written);
        if (type < 0 || !place) continue;
        const start = positionAt(q.lines, place.start);
        const end = positionAt(q.lines, place.end);
        if (end.line !== start.line) continue;
        if (!declared.has(decl)) declared.set(decl, index.definition(decl));
        const definition = declared.get(decl);
        const modifiers = definition && definition.file === q.key && definition.start === written.start ? 1 : 0;
        data.push(start.line - line, start.line === line ? start.character - character : start.character, end.character - start.character, type, modifiers);
        line = start.line;
        character = start.character;
      }
      return { data };
    },
  };

  /**
   * Where declaration `decl` (of `q`'s program) is named in the other open
   * programs that have its file (the files that import it): as locations,
   * spelled `spelling` (any, for null). Each such program is built, so `q`'s
   * index is not read after.
   */
  async function importers(q, decl, spelling, includeDeclaration) {
    const definition = q.program.index.definition(decl);
    if (!definition || definition.file.startsWith('std:')) return [];
    const out = [];
    for (const key of [...docs.keys()]) {
      if (key === q.key) continue;
      const program = await build(key);
      if (!program.files.some(f => f.key === definition.file)) continue;
      const { index } = program;
      const same = index.declarations(definition.file).find(d => {
        const p = index.definition(d.decl);
        return p && p.file === definition.file && p.start === definition.start;
      });
      if (!same) continue;
      for (const place of index.references(same.decl, { includeDeclaration })) {
        if (spelling == null || index.text(place) === spelling) out.push(location(program, place));
      }
    }
    return out.filter(Boolean);
  }

  /**
   * What may be written at `offset`: after `x.`, the members of x's type (or
   * of the module x names); elsewhere, the names in scope and the keywords.
   * The text there rarely parses, so the build is of the text with a name
   * where the one being typed is (and a `;` after it, when that is needed).
   */
  async function complete(key, text, offset) {
    // Nothing is written in a comment, a string, or a DSL's body.
    const token = (await build(key)).index.tokenAt(key, offset);
    if (token && QUIET_TOKENS.has(token.kind)) return [];
    let start = offset;
    while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start--;
    // (`r. ` is `r.` too.)
    let dot = start;
    while (dot > 0 && /[ \t]/.test(text[dot - 1])) dot--;
    const member = text[dot - 1] === '.';
    let program = null;
    for (const tail of ['', ';', ');', ' }']) {
      const patched = `${text.slice(0, start)}${PLACEHOLDER}${tail}${text.slice(offset)}`;
      program = await build(key, { key, text: patched });
      if (!program.diagnostics.some(d => d.kind === 'parse-error')) break;
    }
    const { index } = program;
    const all = index.declarations();
    const label = decl => { const d = index.definition(decl); return d ? index.text(d) : ''; };
    const item = (decl, kind) => {
      const name = label(decl);
      const span = index.span(decl);
      // (Spans are the patched text's.)
      const source = span ? program.files.find(f => f.key === span.file)?.text ?? null : null;
      const detail = LOCAL_KINDS.has(kind) ? index.type(decl) : source != null ? signature(source.slice(span.start, span.end)) : '';
      return { label: name, kind: COMPLETION_KIND[kind] ?? 6, ...(detail ? { detail } : {}) };
    };
    const items = new Map();
    const add = (decl, kind) => {
      const name = label(decl);
      if (name && name !== PLACEHOLDER && /^[A-Za-z_]\w*$/.test(name) && !items.has(name)) items.set(name, item(decl, kind));
    };
    if (member) {
      // `x?.`: the members of what x holds when it is not null.
      const optional = text[dot - 2] === '?';
      let r = dot - 1 - (optional ? 1 : 0);
      while (r > 0 && /\s/.test(text[r - 1])) r--;
      const receiver = r > 0 ? index.declarationAt(key, r - 1) : -1;
      const rkind = receiver >= 0 ? index.kind(receiver) : null;
      // `M.`: what module M holds. `T.`: a type's variants and functions.
      // Any other `e.`: the fields of e's type, and its module's methods.
      const statics = rkind === 'Struct' || rkind === 'Enum' || rkind === 'IntEnum';
      let owner = rkind === 'Module' || statics ? receiver : index.typeDeclarationOfExpressionBefore(key, r, optional);
      if (owner < 0 && (LOCAL_KINDS.has(rkind) || rkind === 'Global') && (optional || !index.type(receiver).startsWith('?'))) owner = index.typeDeclaration(receiver);
      if (owner < 0) return [];
      const module = rkind === 'Module' ? receiver : moduleOf(index, owner);
      // A type outside a module has the functions written `fn T.f`: called on a value when they take |self|.
      const typeName = module < 0 ? label(owner) : null;
      for (const { decl, kind, owner: o } of all) {
        if (o === owner && ((kind === 'Field' && !statics) || kind === 'Variant' || kind === 'Fn' || kind === 'Global')) add(decl, kind);
        else if (typeName && o < 0 && kind === 'Fn' && writtenFor(index, program, decl, typeName) && isMethod(index, program, decl) !== statics) add(decl, kind);
        else if (module >= 0 && o === module && module !== owner && kind === 'Fn' && (rkind === 'Module' || isMethod(index, program, decl))) add(decl, kind);
        else if (o === module && rkind === 'Module' && (kind === 'Struct' || kind === 'Enum' || kind === 'TypeDecl' || kind === 'Global')) add(decl, kind);
      }
      return [...items.values()];
    }
    // The locals of the function the cursor is in, declared before it.
    const fns = all.filter(d => d.span.file === key && (d.kind === 'Fn' || d.kind === 'Main') && d.span.start <= start && start <= d.span.end);
    const within = fns.sort((a, b) => (a.span.end - a.span.start) - (b.span.end - b.span.start))[0];
    // What this file declares, and what the prelude does (imports are named by their alias).
    const prelude = new Set(program.files.filter(f => f.role === 2).map(f => f.key));
    for (const { decl, kind, owner, span } of all) {
      if (span.file !== key && !(prelude.has(span.file) && PRELUDE_KINDS.has(kind))) continue;
      if (span.file === key && LOCAL_KINDS.has(kind)) {
        if (within && span.start >= within.span.start && span.start < start) add(decl, kind);
      } else if (span.file === key ? owner < 0 || index.kind(owner) === 'Module' && !LOCAL_KINDS.has(kind) && kind !== 'Field' && kind !== 'Variant' : owner < 0 && kind !== 'Main') {
        add(decl, kind);
      }
    }
    for (const word of KEYWORDS) if (!items.has(word)) items.set(word, { label: word, kind: 14 });
    return [...items.values()];
  }

  /** What hovering a name shows: its declaration, its type, its doc comment. */
  function hover(program, decl, q) {
    const { index } = program;
    const kind = index.kind(decl);
    const definition = index.definition(decl);
    const span = index.span(decl);
    const text = !span ? null : span.file === q.key ? q.text : textOf(program, span.file);
    let head;
    if (LOCAL_KINDS.has(kind)) {
      const type = index.type(decl);
      // (A @wat function's body is not checked: its parameters are as written.)
      head = type || !span || text == null ? `${definition ? index.text(definition) : '?'}${type ? `: ${type}` : ''}` : signature(text.slice(span.start, span.end));
    } else if (span && text != null) {
      head = signature(text.slice(span.start, span.end))
        // A built-in type's representation is the compiler's business.
        .replace(/\s*=\s*@ir\s*\/\\[\s\S]*$/, '');
      // A module's own type, `&`, by the module's name.
      const module = moduleOf(index, decl);
      const name = module >= 0 ? index.definition(module) : null;
      if (name) head = head.replace(/(^|[^&\w])&(?![&\w])/g, `$1${index.text(name)}`);
    }
    if (!head) return null;
    const docs = LOCAL_KINDS.has(kind) ? '' : typstToMarkdown(docComments(utu, program.files).declaration(decl));
    const where = span?.file.startsWith('std:') ? ` · ${span.file}` : '';
    return `\`\`\`utu\n${head}\n\`\`\`\n*${kind.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}*${where}${docs ? `\n\n---\n\n${docs}` : ''}`;
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

/** `text` with each of `ranges` (LSP ranges over `lines`) written `newText`. */
function applyEdits(text, ranges, lines, newText) {
  const spans = ranges.map(r => [offsetAt(lines, r.start, text.length), offsetAt(lines, r.end, text.length)]).sort((a, b) => b[0] - a[0]);
  for (const [start, end] of spans) text = text.slice(0, start) + newText + text.slice(end);
  return text;
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

function responseError(code, message) {
  return Object.assign(new Error(message), { code });
}

/** Where each line of `text` starts (UTF-16 offsets). */
function lineStarts(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
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

/** A declaration's first line, without its body: `fn area(self: Shape) F64`. */
function signature(source) {
  const text = source.replace(/\/\/[^\n]*/g, '');
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && (c === '{' || c === ';')) return collapse(text.slice(0, i));
    else if (depth === 0 && c === '=' && text[i + 1] === '>') return collapse(text.slice(0, i));
  }
  return collapse(text);
}

function collapse(text) {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}


/** The module a declaration is in, or -1. */
function moduleOf(index, decl) {
  let d = decl;
  while (d >= 0 && index.kind(d) !== 'Module') d = index.owner(d);
  return d;
}

/** A function written `fn T.f …` for type name `T`. */
function writtenFor(index, program, decl, typeName) {
  const span = index.span(decl);
  const text = span && (program.files.find(f => f.key === span.file)?.text);
  return text != null && new RegExp(`^\\s*(export\\s+)?fn\\s+${typeName}\\.`).test(text.slice(span.start, span.end));
}

/** A function called on a value: `fn &.f |self| …`. */
function isMethod(index, program, decl) {
  const span = index.span(decl);
  const text = span && (program.files.find(f => f.key === span.file)?.text);
  return text != null && /^\s*(export\s+)?fn\s+[^\s(]*\.[A-Za-z_]\w*\s*\|/.test(text.slice(span.start, span.end));
}
