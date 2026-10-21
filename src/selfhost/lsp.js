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
  'match', 'loop', 'alt', 'for', 'while', 'break', 'continue', 'defer', 'return', 'fatal', 'yield', 'true', 'false', 'null'];

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
  let shutdown = false;

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
    const program = { key, generation: patch ? -1 : generation, files: normal.files, index: programIndex(utu, normal.files), diagnostics };
    current = program;
    log(`built ${key}${patch ? ' (patched)' : ''} in ${(performance.now() - started).toFixed(1)} ms`);
    return program;
  }

  const textOf = (program, key) => docs.get(key)?.text ?? program.files.find(f => f.key === key)?.text ?? null;

  function publish(key, program) {
    const doc = docs.get(key);
    if (!doc) return;
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
      data: d.fix && toUri(d.fix.file ?? d.file) ? { fix: { ...d.fix, uri: toUri(d.fix.file ?? d.file) } } : undefined,
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

  /** The program for a request's document, and the offset of its position. */
  async function at(params) {
    const key = toKey(params.textDocument.uri);
    const program = await build(key);
    const text = textOf(program, key);
    if (text == null) return null;
    const offset = params.position ? offsetAt(lineStarts(text), params.position, text.length) : 0;
    return { key, program, text, offset, decl: params.position ? program.index.declarationAt(key, offset) : -1 };
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
    if (index.declarations(q.key).some(d => d.kind === 'Alias' && index.text(index.definition(d.decl) ?? name) === spelling)) return name;
    const definition = index.definition(q.decl);
    return definition && toUri(definition.file) && !definition.file.startsWith('std:') ? name : null;
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
    const alias = index.declarations(q.key).find(d => d.kind === 'Alias' && index.text(index.definition(d.decl) ?? name) === spelling);
    if (alias) {
      return index.names(q.key)
        .filter(n => index.text(n.at) === spelling && (n.decl === alias.decl || index.text(index.definition(n.decl) ?? n.at) !== spelling))
        .map(n => n.at);
    }
    return index.references(q.decl).filter(place => index.text(place) === spelling);
  }

  /** A place as an LSP location, or null when no editor can open its file. */
  function location(program, place) {
    if (!place) return null;
    const uri = toUri(place.file);
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
        const text = docs.get(toKey(fix.uri))?.text ?? current?.files.find(f => toUri(f.key) === fix.uri)?.text;
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
      return location(q.program, q.program.index.definition(q.decl));
    },

    'textDocument/references': async params => {
      const q = await at(params);
      if (!q || q.decl < 0) return [];
      const includeDeclaration = params.context?.includeDeclaration ?? true;
      return q.program.index.references(q.decl, { includeDeclaration }).map(place => location(q.program, place)).filter(Boolean);
    },

    'textDocument/documentHighlight': async params => {
      const q = await at(params);
      if (!q || q.decl < 0) return [];
      const lines = lineStarts(q.text);
      const definition = q.program.index.definition(q.decl);
      return q.program.index.references(q.decl)
        .filter(place => place.file === q.key)
        .map(place => ({ range: range(lines, place.start, place.end), kind: definition && place.start === definition.start && place.file === definition.file ? 3 : 2 }));
    },

    'textDocument/hover': async params => {
      const q = await at(params);
      if (!q || q.decl < 0) return null;
      const contents = hover(q.program, q.decl);
      if (!contents) return null;
      const name = q.program.index.references(q.decl).find(place => place.file === q.key && place.start <= q.offset && q.offset <= place.end);
      return { contents: { kind: 'markdown', value: contents }, ...(name ? { range: range(lineStarts(q.text), name.start, name.end) } : {}) };
    },

    'textDocument/prepareRename': async params => {
      const q = await at(params);
      const name = q && renamed(q);
      return name ? { range: range(lineStarts(q.text), name.start, name.end), placeholder: q.text.slice(name.start, name.end) } : null;
    },

    'textDocument/rename': async params => {
      const q = await at(params);
      const name = q && renamed(q);
      if (!name) throw responseError(-32602, 'only a name declared in a file the editor can change is renamed');
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(params.newName) || KEYWORDS.includes(params.newName)) {
        throw responseError(-32602, `'${params.newName}' is not a name`);
      }
      const changes = {};
      for (const place of occurrences(q, name)) {
        const where = location(q.program, place);
        if (where) (changes[where.uri] ??= []).push({ range: where.range, newText: params.newName });
      }
      return { changes };
    },

    'textDocument/documentSymbol': async params => {
      const q = await at(params);
      if (!q) return [];
      const lines = lineStarts(q.text);
      const { index } = q.program;
      const symbols = new Map();
      const roots = [];
      for (const { decl, kind, owner, span } of index.declarations(q.key)) {
        if (!(kind in SYMBOL_KIND)) continue;
        const name = index.definition(decl);
        if (!name || name.file !== q.key) continue;
        // A module's own type (`struct &`) is known by the module's name.
        const ownerName = owner >= 0 && index.kind(owner) === 'Module' ? index.definition(owner) : null;
        const text = index.text(name) === '&' && ownerName ? index.text(ownerName) : index.text(name);
        const symbol = {
          name: text, kind: SYMBOL_KIND[kind],
          range: range(lines, Math.min(span.start, name.start), Math.max(span.end, name.end)),
          selectionRange: range(lines, name.start, name.end), children: [],
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
      const lines = lineStarts(q.text);
      const { index } = q.program;
      const declared = new Map();
      const data = [];
      let line = 0, character = 0;
      for (const { decl, at: place } of index.names(q.key)) {
        const type = SEMANTIC_TYPES.indexOf(SEMANTIC_KIND[index.kind(decl)]);
        if (type < 0) continue;
        const start = positionAt(lines, place.start);
        const end = positionAt(lines, place.end);
        if (end.line !== start.line) continue;
        if (!declared.has(decl)) declared.set(decl, index.definition(decl));
        const definition = declared.get(decl);
        const modifiers = definition && definition.file === q.key && definition.start === place.start ? 1 : 0;
        data.push(start.line - line, start.line === line ? start.character - character : start.character, end.character - start.character, type, modifiers);
        line = start.line;
        character = start.character;
      }
      return { data };
    },
  };

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
    const member = text[start - 1] === '.';
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
      let r = start - 1;
      while (r > 0 && /\s/.test(text[r - 1])) r--;
      const receiver = index.declarationAt(key, r - 1 >= 0 ? r - 1 : 0);
      if (receiver < 0) return [];
      const rkind = index.kind(receiver);
      // `M.`: what module M holds. `x.`: the fields of x's type, and its module's methods.
      const owner = rkind === 'Module' ? receiver : LOCAL_KINDS.has(rkind) || rkind === 'Global' ? index.typeDeclaration(receiver) : -1;
      if (owner < 0) return [];
      const module = rkind === 'Module' ? receiver : moduleOf(index, owner);
      for (const { decl, kind, owner: o } of all) {
        if (o === owner && (kind === 'Field' || kind === 'Variant' || kind === 'Fn' || kind === 'Global')) add(decl, kind);
        else if (o === module && module !== owner && kind === 'Fn' && (rkind === 'Module' || isMethod(index, program, decl))) add(decl, kind);
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
  function hover(program, decl) {
    const { index } = program;
    const kind = index.kind(decl);
    const definition = index.definition(decl);
    const span = index.span(decl);
    const text = span ? textOf(program, span.file) : null;
    let head;
    if (LOCAL_KINDS.has(kind)) {
      const type = index.type(decl);
      // (A @wat function's body is not checked: its parameters are as written.)
      head = type || !span || text == null ? `${definition ? index.text(definition) : '?'}${type ? `: ${type}` : ''}` : signature(text.slice(span.start, span.end));
    } else if (span && text != null) {
      head = signature(text.slice(span.start, span.end));
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
      generation++;
      if (doc && published.delete(key)) send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: doc.uri, diagnostics: [] } });
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

/** A function called on a value: `fn &.f |self| …`. */
function isMethod(index, program, decl) {
  const span = index.span(decl);
  const text = span && (program.files.find(f => f.key === span.file)?.text);
  return text != null && /^\s*(export\s+)?fn\s+[^\s(]*\.[A-Za-z_]\w*\s*\|/.test(text.slice(span.start, span.end));
}
