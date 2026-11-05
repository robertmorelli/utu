import * as vscode from 'vscode';
import { cssProjection } from '../wutu/css-stencil.js';
import { createSyntaxShape, formatUtu, wutuCompletions } from '../wutu/wutu-tooling.js';

const LANGUAGE_ID = 'utu';
const DOCUMENT_SELECTOR = Object.freeze({ language: LANGUAGE_ID, scheme: '*' });
const decoder = new TextDecoder('utf-8');

let activeService;
let extensionRoot;

export async function activate(context) {
  extensionRoot = context.extensionUri;
  const output = vscode.window.createOutputChannel('UTU');
  const diagnostics = vscode.languages.createDiagnosticCollection(LANGUAGE_ID);
  const generated = new GeneratedDocuments();
  const service = createCompilerService(output);
  const xray = new SemanticXrayPanel(service, output);
  activeService = service;

  const validate = debounceByUri(200, document => validateDocument(document, service, diagnostics, output));
  const syncMainContext = document => vscode.commands.executeCommand(
    'setContext',
    'utu.hasRunnableMain',
    document?.languageId === LANGUAGE_ID && /\bexport\s+main\s*\(/u.test(document.getText()),
  );

  context.subscriptions.push(
    output,
    diagnostics,
    generated,
    validate,
    xray,
    vscode.workspace.registerTextDocumentContentProvider('utu-generated', generated),
    vscode.workspace.onDidOpenTextDocument(document => isUtu(document) && validationMode() !== 'off' && validate(document)),
    vscode.workspace.onDidChangeTextDocument(({ document }) => {
      if (!isUtu(document)) return;
      service.invalidate();
      if (validationMode() === 'onType') validate(document);
    }),
    vscode.workspace.onDidSaveTextDocument(document => isUtu(document) && validationMode() !== 'off' && validate.flush(document)),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('utu.validation.mode')) return;
      if (validationMode() === 'off') diagnostics.clear();
      else for (const document of vscode.workspace.textDocuments) if (isUtu(document)) validate.flush(document);
    }),
    vscode.workspace.onDidCloseTextDocument(document => {
      validate.delete(document.uri);
      diagnostics.delete(document.uri);
    }),
    vscode.window.onDidChangeActiveTextEditor(editor => void syncMainContext(editor?.document)),
    vscode.window.onDidChangeTextEditorSelection?.(event => isUtu(event.textEditor.document) && xray.follow(event.textEditor)),
    vscode.languages.registerDocumentFormattingEditProvider(DOCUMENT_SELECTOR, {
      async provideDocumentFormattingEdits(document) {
        const source = document.getText();
        // Source that does not parse is kept intact; diagnostics identify the syntax error.
        const formatted = await service.format(source);
        if (formatted == null || source === formatted) return [];
        const whole = new vscode.Range(document.positionAt(0), document.positionAt(source.length));
        return [{ range: whole, newText: formatted }];
      },
    }),
    vscode.languages.registerCompletionItemProvider(DOCUMENT_SELECTOR, {
      provideCompletionItems(document, position) {
        return wutuCompletions(document.getText(), document.offsetAt(position));
      },
    }, '<', ':', '@'),
    vscode.languages.registerHoverProvider(DOCUMENT_SELECTOR, semanticHoverProvider(service)),
    vscode.languages.registerCodeActionsProvider(DOCUMENT_SELECTOR, quickFixes, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.languages.registerDefinitionProvider(DOCUMENT_SELECTOR, definitionProvider(service)),
    vscode.languages.registerReferenceProvider(DOCUMENT_SELECTOR, referenceProvider(service)),
    vscode.languages.registerInlayHintsProvider(DOCUMENT_SELECTOR, inlayHintsProvider(service)),
    vscode.languages.registerCallHierarchyProvider(DOCUMENT_SELECTOR, callHierarchyProvider(service)),
  );

  registerCommand(context, output, 'utu.showCssStencil', async target => {
    const document = await utuDocument(target);
    if (!document) return;
    await revealGenerated(generated, document, 'css', cssProjection(document.getText()), 'css');
  });

  registerCommand(context, output, 'utu.createWutuWebsite', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) throw new Error('Open a workspace folder to create a Wutu website.');
    const name = await vscode.window.showInputBox({
      prompt: 'Name for the new Wutu website folder',
      value: 'my-wutu-site',
      validateInput: value => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)
        ? undefined : 'Use letters, numbers, underscores, or hyphens; start with a letter.',
    });
    if (!name) return;
    const directory = vscode.Uri.joinPath(folder.uri, name);
    const entry = vscode.Uri.joinPath(directory, 'main.utu');
    try {
      await vscode.workspace.fs.stat(entry);
      throw new Error(`${name}/main.utu already exists.`);
    } catch (error) {
      if (error?.code !== 'FileNotFound') throw error;
    }
    await vscode.workspace.fs.createDirectory(directory);
    await vscode.workspace.fs.writeFile(entry, new TextEncoder().encode(wutuStarter(name)));
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(entry));
    return entry;
  });

  registerCommand(context, output, 'utu.previewWutuWebsite', async target => {
    const document = await utuDocument(target);
    if (!document) return;
    if (document.uri.scheme !== 'file') throw new Error('Save the Wutu entry file locally before previewing it.');
    if (document.isDirty && !await document.save()) return;
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) throw new Error('Open the Wutu website folder as a VS Code workspace.');
    const cli = vscode.Uri.joinPath(folder.uri, 'cli', 'wutu.mjs');
    try { await vscode.workspace.fs.stat(cli); }
    catch { throw new Error('Open the utu repository as the VS Code workspace to preview Wutu websites.'); }
    const terminal = vscode.window.createTerminal({ name: 'Wutu Website', cwd: folder.uri.fsPath });
    const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
    terminal.sendText(`node ${quote(cli.fsPath)} dev ${quote(document.uri.fsPath)} --out ${quote(vscode.Uri.joinPath(folder.uri, 'dist', 'wutu-preview').fsPath)} --port 0`);
    terminal.show();
    output.appendLine(`[wutu] Previewing ${displayName(document)}; open the localhost link in the Wutu Website terminal.`);
    return terminal;
  });

  registerCommand(context, output, 'utu.compileCurrentFile', async target => {
    const document = await utuDocument(target);
    if (!document) return;
    const { wasm: binary } = await service.build(document);
    output.appendLine(`[utu] Compiled ${displayName(document)}: ${binary.byteLength} wasm bytes`);
    vscode.window.setStatusBarMessage(`UTU compiled ${displayName(document)}`, 3000);
    return binary;
  });

  registerCommand(context, output, 'utu.showGeneratedWat', async target => {
    const document = await utuDocument(target);
    if (!document) return;
    await revealGenerated(generated, document, 'wat', await service.wat(document), 'wat');
  });

  registerCommand(context, output, 'utu.showSyntaxTree', async target => {
    const document = await utuDocument(target);
    if (!document) return;
    await revealGenerated(generated, document, 'syntax', await service.syntax(document), 'plaintext');
  });

  registerCommand(context, output, 'utu.showSemanticXray', async target => {
    const editor = target?.document ? target : vscode.window.activeTextEditor;
    if (!isUtu(editor?.document)) return utuDocument(target);
    await xray.show(editor);
  });

  registerCommand(context, output, 'utu.showCompilerGraphs', async target => {
    const document = await utuDocument(target?.document ?? target);
    if (!document) return;
    const html = await service.graphs(document);
    const panel = vscode.window.createWebviewPanel(
      'utuCompilerGraphs',
      `UTU Graphs — ${displayName(document)}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = html;
  });

  registerCommand(context, output, 'utu.runMain', async target => {
    const document = await utuDocument(target);
    if (!document) return;
    const { exports } = await service.instantiate(document);
    if (typeof exports.main !== 'function') {
      throw new Error('The active file does not export main().');
    }
    const result = await exports.main();
    output.appendLine(`[utu] ${displayName(document)} main${result === undefined ? '' : ` => ${String(result)}`}`);
    output.show(true);
    return result;
  });

  for (const document of vscode.workspace.textDocuments) {
    if (isUtu(document) && validationMode() !== 'off') validate(document);
  }
  await syncMainContext(vscode.window.activeTextEditor?.document);

  return Object.freeze({ compiler: service });
}

export function deactivate() {
  activeService?.dispose();
  activeService = undefined;
}

/**
 * Everything comes from the self-hosted compiler (dist/utu.wasm), which
 * holds one program at a time. A document's program is built for its tests,
 * for its exports and for analysis (every function checked, the last build):
 * diagnostics come from all three, and hover, inlay hints, definitions,
 * references, the call hierarchy, the X-Ray, the syntax tree and the graphs
 * read the analysis build's tables, kept until the next build or edit.
 */
export function createCompilerService(output = null) {
  let loading;
  let queue = Promise.resolve();
  let current = null;
  let generation = 0;
  const load = () => (loading ??= (async () => {
    const dist = extensionRoot ? vscode.Uri.joinPath(extensionRoot, 'dist') : null;
    if (!dist) throw new Error('no extension directory');
    const read = name => vscode.workspace.fs.readFile(vscode.Uri.joinPath(dist, name));
    const [api, wasm, spec] = await Promise.all([
      import(vscode.Uri.joinPath(dist, 'selfhost', 'utu.js').toString()),
      read('utu.wasm'),
      read('utu.host.json').then(bytes => JSON.parse(decoder.decode(bytes))),
    ]);
    const utu = await api.loadCompiler(wasm, spec);
    const host = {
      // The platform's declarations, read ready from dist/selfhost/catalog.
      stdlib: api.catalogStdlib(api.PLATFORM_SOURCES, async name => new Uint8Array(await read(`selfhost/catalog/${name}`))),
      readFile: readWorkspaceFile,
      readBinaryFile: file => vscode.workspace.fs.readFile(vscode.Uri.parse(file, true)),
      resolvePath: resolveImport,
    };
    return { api, utu, host };
  })().catch(error => {
    output?.appendLine(`[utu] The self-hosted compiler could not load here (${firstErrorLine(error)}); it needs WasmGC and the JS string builtins.`);
    throw error;
  }));
  // Each use runs alone, after the ones before it.
  const exclusive = task => {
    const run = queue.then(() => load().then(task));
    queue = run.catch(() => {});
    return run;
  };
  // A build replaces the program the compiler holds.
  const compileAs = ({ api, utu, host }, document, options) => {
    current = null;
    return api.compile(utu, document.uri.toString(), { ...host, ...options });
  };
  async function analyzed(ctx, document) {
    const uri = document.uri.toString();
    if (current && current.uri === uri && current.version === document.version && current.generation === generation) return current;
    const seen = new Set();
    const diagnostics = [];
    let files = [];
    for (const target of ['test', 'normal', 'analysis']) {
      const built = await compileAs(ctx, document, { target, optimize: 'none' });
      files = built.files;
      for (const d of built.diagnostics) {
        const key = `${d.file}\u0000${d.start}\u0000${d.end}\u0000${d.message}`;
        if (!seen.has(key)) { seen.add(key); diagnostics.push(d); }
      }
    }
    current = { uri, version: document.version, generation, files, diagnostics, index: ctx.api.programIndex(ctx.utu, files) };
    return current;
  }
  const withProgram = (document, answer) => exclusive(async ctx => answer(await analyzed(ctx, document), ctx));
  const build = document => exclusive(ctx => compileAs(ctx, document, { target: 'normal' }));
  const throwOn = ({ wasm, diagnostics }) => {
    if (!wasm) throw new Error(diagnostics.find(d => d.severity === 'error')?.message ?? diagnostics[0]?.message ?? 'Compilation failed');
  };
  const declarationAt = (program, document, offset) => program.index.declarationAt(document.uri.toString(), offset);
  const call = (program, document, item) => item && { ...callRef(program, item), entry: document };

  return {
    selfhosted: () => load().then(() => true, () => false),
    // What the program's tests, exports and analysis say about this file.
    diagnostics(document) {
      const uri = document.uri.toString();
      return withProgram(document, program => program.diagnostics.filter(d => d.file === uri).map(d => ({
        // The diagnostic's own kind, its notes after the message, the other
        // places it is about, and its fix (a quick fix, below).
        severity: d.severity,
        message: [d.message, ...(d.notes ?? []).map(note => `note: ${note}`)].join('\n'),
        code: d.code ?? d.kind,
        primary: { start: d.focus?.start ?? d.start, end: d.focus?.end ?? d.end },
        related: (d.related ?? []).map(r => ({ file: r.file, start: r.start, end: r.end, label: r.label })),
        fix: d.fix && d.fix.file === uri ? { start: d.fix.start, end: d.fix.end, text: d.fix.text, label: d.fix.label } : null,
      })));
    },
    async build(document) {
      const built = await build(document);
      throwOn(built);
      return built;
    },
    async instantiate(document) {
      const built = await build(document);
      throwOn(built);
      const { api } = await load();
      return api.instantiate(built.wasm, built.spec);
    },
    definition(document, offset) {
      return withProgram(document, program => {
        const decl = declarationAt(program, document, offset);
        return decl < 0 ? null : program.index.definition(decl);
      });
    },
    references(document, offset, includeDeclaration) {
      return withProgram(document, program => {
        const decl = declarationAt(program, document, offset);
        return decl < 0 ? [] : program.index.references(decl, { includeDeclaration });
      });
    },
    explain(document, offset) {
      return withProgram(document, program => describe(program, document.uri.toString(), offset));
    },
    inlayHints(document) {
      return withProgram(document, program => program.index.inlayHints(document.uri.toString()));
    },
    prepareCallHierarchy(document, offset) {
      return withProgram(document, program => call(program, document, program.index.prepareCallHierarchy(document.uri.toString(), offset)[0]));
    },
    incomingCalls(document, decl) {
      return withProgram(document, program => program.index.incomingCalls(decl).map(group => ({
        item: call(program, document, group.from), sites: group.sites.map(site => placeRef(program.files, site)),
      })));
    },
    outgoingCalls(document, decl) {
      return withProgram(document, program => program.index.outgoingCalls(decl).map(group => ({
        item: call(program, document, group.to), sites: group.sites.map(site => placeRef(program.files, site)),
      })));
    },
    syntax(document) {
      return withProgram(document, (program, { api, utu }) => api.syntaxTree(utu, program.files, document.uri.toString()));
    },
    graphs(document) {
      return withProgram(document, (program, { api, utu }) => api.renderGraphHtml(utu, program.files, document.uri.toString()));
    },
    // The module as code generation leaves it, its functions named, each with its source lines.
    wat(document, { source = true } = {}) {
      return exclusive(async ctx => {
        const built = await compileAs(ctx, document, { target: 'normal', optimize: 'none', debugNames: true, sourceMap: source });
        throwOn(built);
        return ctx.api.printWat(built.wasm, { map: built.map, files: built.files, source });
      });
    },
    // One function's WAT, as `wat` prints it (without source lines), or null when it is not emitted.
    async emission(document, name) {
      return functionWat(await this.wat(document, { source: false }), name);
    },
    // `source` laid out, or null when the formatter cannot read it.
    format(source) {
      return exclusive(async ({ utu }) => {
        current = null;
        return (await formatUtu(source, { shape: createSyntaxShape(utu) })).text;
      }).catch(() => null);
    },
    invalidate() {
      generation++;
      current = null;
    },
    dispose() {
      current = null;
    },
  };
}

const CONVERSIONS = { 1: 'nullable-widen', 2: 'variant-to-enum', 3: 'protocol', 4: 'closure-decay', 5: 'null', 6: 'host' };

/** What the X-Ray and hover show at a cursor: plain data, read while the program is current. */
function describe(program, uri, offset) {
  const { index, files } = program;
  const info = index.explainAt(uri, offset);
  if (!info) return null;
  const declRef = decl => {
    if (decl == null || decl < 0) return null;
    const at = index.definition(decl);
    return at ? { ...placeRef(files, at), kind: index.kind(decl) } : null;
  };
  const text = info.at ? index.text(info.at) : '';
  const enclosing = index.declarations(uri)
    .filter(d => ['Fn', 'Main'].includes(d.kind) && d.span.start <= offset && offset <= d.span.end)
    .sort((a, b) => (a.span.end - a.span.start) - (b.span.end - b.span.start))[0];
  const fnName = enclosing ? index.text(index.definition(enclosing.decl) ?? enclosing.span) : null;
  return {
    title: text && text.length <= 48 && !text.includes('\n') ? text : info.kind,
    kind: info.kind, at: info.at, type: info.type, expectedType: info.expectedType,
    declaration: declRef(info.declaration), callTarget: declRef(info.callTarget),
    field: info.field ? { owner: declRef(info.field.owner)?.name ?? '?', index: info.field.index } : null,
    conversions: info.conversions.map(c => ({ from: c.from, to: c.to, kind: CONVERSIONS[c.kind] ?? String(c.kind) })),
    captures: info.captures.map(declRef).filter(Boolean),
    effects: info.effects.labels, wasmType: info.wasmType,
    function: fnName && /^[A-Za-z_]\w*$/.test(fnName) ? fnName : null,
  };
}

/** A call hierarchy entry as data. */
function callRef(program, item) {
  return {
    decl: item.decl, name: item.name, kind: item.kind, effects: item.effects.labels,
    span: placeRef(program.files, item.span), selection: placeRef(program.files, item.selection),
  };
}

/** A place in a loaded file, with its text, line and column, and the line as a snippet. */
function placeRef(files, at) {
  const file = files.find(f => f.key === at.file);
  if (!file) return { ...at, name: '', row: 0 };
  const text = file.text;
  const position = offset => {
    const before = text.slice(0, offset);
    const line = before.split('\n').length - 1;
    return { line, character: offset - (before.lastIndexOf('\n') + 1) };
  };
  const start = position(at.start), end = position(at.end);
  const lineStart = at.start - start.character;
  const lineEnd = text.indexOf('\n', lineStart) < 0 ? text.length : text.indexOf('\n', lineStart);
  return {
    file: at.file, start: at.start, end: at.end, name: text.slice(at.start, at.end), row: start.line + 1,
    startPosition: start, endPosition: end,
    snippet: { text: text.slice(lineStart, lineEnd), focusStart: at.start - lineStart, focusEnd: Math.min(at.end, lineEnd) - lineStart, tokens: [] },
  };
}

/** The `(func $name …)` of printed WAT: a top-level function named `name` (or `….name`). */
function functionWat(wat, name) {
  const lines = wat.split('\n');
  const head = new RegExp(`^  \\(func \\$(?:[^\\s()]*\\.)?${name.replace(/[$.*+?^()[\]{}|\\]/g, '\\$&')}[\\s)]`);
  const at = lines.findIndex(line => head.test(line));
  if (at < 0) return null;
  let end = at + 1;
  while (end < lines.length && !/^  \S/.test(lines[end]) && lines[end] !== ')') end++;
  if (lines[end] === '  )') end++;
  return lines.slice(at, end).join('\n');
}

async function readWorkspaceFile(file) {
  const open = vscode.workspace.textDocuments.find(document => document.uri.toString() === file);
  if (open) return open.getText();
  return decoder.decode(await vscode.workspace.fs.readFile(vscode.Uri.parse(file, true)));
}

function resolveImport(from, relative) {
  try {
    return new URL(relative, from).toString();
  } catch {
    return vscode.Uri.joinPath(vscode.Uri.parse(from, true), '..', relative).toString();
  }
}

function semanticHoverProvider(service) {
  return {
    async provideHover(document, position) {
      const info = await service.explain(document, document.offsetAt(position));
      if (!info) return null;
      const markdown = new vscode.MarkdownString(renderHover(info));
      markdown.isTrusted = { enabledCommands: ['utu.showSemanticXray'] };
      markdown.supportHtml = true;
      markdown.supportThemeIcons = true;
      return new vscode.Hover(markdown, rangeForRef(document, info.at));
    },
  };
}

function definitionProvider(service) {
  return {
    async provideDefinition(document, position) {
      return sourceLocation(await service.definition(document, document.offsetAt(position)), document);
    },
  };
}

function referenceProvider(service) {
  return {
    async provideReferences(document, position, context) {
      const refs = await service.references(document, document.offsetAt(position), context.includeDeclaration);
      return Promise.all(refs.map(ref => sourceLocation(ref, document))).then(values => values.filter(Boolean));
    },
  };
}

function inlayHintsProvider(service) {
  return {
    async provideInlayHints(document, range) {
      if (!vscode.workspace.getConfiguration('utu').get('inlayHints.enabled', true)) return [];
      const from = document.offsetAt(range.start), to = document.offsetAt(range.end);
      return (await service.inlayHints(document))
        .filter(item => item.position >= from && item.position <= to)
        .map(item => {
          const hint = new vscode.InlayHint(
            document.positionAt(item.position),
            item.label,
            item.kind === 'type' ? vscode.InlayHintKind.Type : vscode.InlayHintKind.Parameter,
          );
          hint.paddingLeft = item.kind !== 'type';
          return hint;
        });
    },
  };
}

// Items in the standard library have no document to open: they are left out.
const openable = value => value && !value.span.file.startsWith('std:');

function callHierarchyProvider(service) {
  return {
    async prepareCallHierarchy(document, position) {
      const value = await service.prepareCallHierarchy(document, document.offsetAt(position));
      return openable(value) ? callHierarchyItem(value) : null;
    },
    async provideCallHierarchyIncomingCalls(item) {
      return (await service.incomingCalls(item._utuEntry, item._utuId)).filter(group => openable(group.item))
        .map(group => new vscode.CallHierarchyIncomingCall(callHierarchyItem(group.item), group.sites.map(rangeOfRef)));
    },
    async provideCallHierarchyOutgoingCalls(item) {
      return (await service.outgoingCalls(item._utuEntry, item._utuId)).filter(group => openable(group.item))
        .map(group => new vscode.CallHierarchyOutgoingCall(callHierarchyItem(group.item), group.sites.map(rangeOfRef)));
    },
  };
}

function callHierarchyItem(value) {
  const detail = [value.kind, value.effects.length ? `effects: ${value.effects.join(', ')}` : 'pure'].join(' · ');
  const item = new vscode.CallHierarchyItem(
    vscode.SymbolKind.Function,
    value.name || 'function',
    detail,
    vscode.Uri.parse(value.span.file, true),
    rangeOfRef(value.span),
    rangeOfRef(value.selection),
  );
  // Declarations are numbered by the program of the document asked about.
  item._utuId = value.decl;
  item._utuEntry = value.entry;
  return item;
}

/** A range from a placeRef's own line and column. */
function rangeOfRef(ref) {
  const at = position => new vscode.Position(position?.line ?? 0, position?.character ?? 0);
  return new vscode.Range(at(ref.startPosition), at(ref.endPosition ?? ref.startPosition));
}

function renderHover(info) {
  const lines = [info.type ? `\`\`\`utu\n${info.title}: ${info.type}\n\`\`\`` : `### $(symbol-variable) ${escapeMarkdown(info.title)}`];
  if (info.expectedType && info.expectedType !== info.type) lines.push('', `$(type-hierarchy) **Expected** ${inlineCode(info.expectedType)}`);
  if (info.declaration) lines.push(`$(references) **Resolves to** ${sourceLabel(info.declaration)}`);
  if (info.callTarget) lines.push(`$(call-outgoing) **Call target** ${sourceLabel(info.callTarget)}`);
  if (info.field) lines.push(`$(symbol-field) **Field** ${inlineCode(`${info.field.owner}.${info.title}: ${info.type}`)} · heap slot ${info.field.index}`);
  if (info.conversions.length) lines.push(`$(replace) **Conversion** ${info.conversions.map(item => `${inlineCode(`${item.from} → ${item.to}`)} (${displayTerm(item.kind)})`).join(', ')}`);
  if (info.effects.length) lines.push(`$(zap) **Effects** ${info.effects.map(inlineCode).join(' ')}`);
  if (info.captures.length) lines.push(`$(package) **Closure environment** ${info.captures.map(item => inlineCode(item.name)).join(', ')}`);
  if (info.wasmType) lines.push(`$(chip) **Wasm** ${inlineCode(info.wasmType)}`);
  lines.push('', '[Open Semantic X-Ray](command:utu.showSemanticXray)');
  return lines.join('  \n');
}

class SemanticXrayPanel {
  constructor(service, output) {
    this.service = service;
    this.output = output;
    this.panel = null;
    this.following = false;
  }
  async show(editor) {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'utuSemanticXray', 'UTU Semantic X-Ray', vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => { this.panel = null; this.following = false; });
      this.panel.webview.onDidReceiveMessage(message => void this.navigate(message));
    }
    this.following = true;
    this.panel.reveal?.(vscode.ViewColumn.Beside, true);
    await this.update(editor);
  }
  async follow(editor) {
    if (!this.panel || !this.following || !this.panel.visible) return;
    await this.update(editor);
  }
  async update(editor) {
    const { document } = editor;
    const version = document.version;
    try {
      const info = await this.service.explain(document, document.offsetAt(editor.selection.active));
      const emission = info?.function ? await this.service.emission(document, info.function).catch(() => null) : null;
      if (!this.panel || document.version !== version) return;
      this.panel.webview.html = renderXrayHtml(info, emission, displayName(document));
    } catch (error) {
      this.output.appendLine(`[utu] Semantic X-Ray failed: ${error?.stack || error}`);
    }
  }
  async navigate(message) {
    if (message?.type !== 'open' || !message.file) return;
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(message.file, true));
    const editor = await vscode.window.showTextDocument(document);
    const start = document.positionAt(message.start ?? 0);
    editor.selection = new vscode.Selection(start, start);
    editor.revealRange(new vscode.Range(start, document.positionAt(message.end ?? message.start ?? 0)));
  }
  dispose() { this.panel?.dispose(); this.panel = null; }
}

async function sourceLocation(ref, currentDocument) {
  if (!ref?.file || ref.start == null) return null;
  try {
    const document = await documentForRef(ref, currentDocument);
    return new vscode.Location(document.uri, rangeForRef(document, ref));
  } catch {
    return null;
  }
}

async function documentForRef(ref, currentDocument) {
  if (ref.file === currentDocument.uri.toString()) return currentDocument;
  return vscode.workspace.openTextDocument(vscode.Uri.parse(ref.file, true));
}

function rangeForRef(document, ref) {
  const length = document.getText().length;
  const start = clampOffset(ref?.start, length);
  const end = Math.max(start, clampOffset(ref?.end ?? start, length));
  return new vscode.Range(document.positionAt(start), document.positionAt(end));
}

async function validateDocument(document, service, collection, output) {
  const { uri, version } = document;
  try {
    const found = await service.diagnostics(document);
    if (document.version !== version) return;
    collection.set(uri, found.map(diagnostic => toVscodeDiagnostic(document, diagnostic)));
  } catch (error) {
    if (document.version !== version) return;
    collection.set(uri, [new vscode.Diagnostic(fullRange(document), firstErrorLine(error), vscode.DiagnosticSeverity.Error)]);
    output.appendLine(`[utu] Validation failed for ${uri.toString()}: ${error?.stack || error}`);
  }
}

/** The fix the compiler gave each diagnostic it shows: an edit, offered as a quick fix. */
const FIXES = new WeakMap();

/** Quick fixes: each diagnostic's fix in the range asked about, as one edit. */
const quickFixes = {
  provideCodeActions(document, _range, context) {
    return context.diagnostics.flatMap(diagnostic => {
      const fix = FIXES.get(diagnostic);
      if (!fix) return [];
      const action = new vscode.CodeAction(fix.label || 'Apply the fix', vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, new vscode.Range(document.positionAt(fix.start), document.positionAt(fix.end)), fix.text);
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      return [action];
    });
  },
};

function toVscodeDiagnostic(document, diagnostic) {
  const primary = diagnostic.primary ?? {};
  const start = clampOffset(primary.start, document.getText().length);
  const end = Math.max(start + 1, clampOffset(primary.end, document.getText().length));
  const severity = diagnostic.severity === 'warning'
    ? vscode.DiagnosticSeverity.Warning
    : diagnostic.severity === 'info'
      ? vscode.DiagnosticSeverity.Information
      : vscode.DiagnosticSeverity.Error;
  const value = new vscode.Diagnostic(
    new vscode.Range(document.positionAt(start), document.positionAt(Math.min(end, document.getText().length))),
    diagnostic.message || diagnostic.code || 'UTU compilation error',
    severity,
  );
  value.source = 'utu';
  value.code = diagnostic.code || diagnostic.kind || undefined;
  if (diagnostic.fix) FIXES.set(value, diagnostic.fix);
  value.relatedInformation = (diagnostic.related ?? []).flatMap(related => {
    if (!related?.file) return [];
    const uri = vscode.Uri.parse(related.file, true);
    const range = related.file === document.uri.toString()
      ? rangeForRef(document, related)
      : rangeFromRows(related);
    return [new vscode.DiagnosticRelatedInformation(
      new vscode.Location(uri, range),
      related.label || 'Contributes to this diagnostic',
    )];
  });
  return value;
}

function registerCommand(context, output, name, handler) {
  context.subscriptions.push(vscode.commands.registerCommand(name, async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      output.appendLine(`[utu] ${name} failed: ${error?.stack || error}`);
      output.show(true);
      await vscode.window.showErrorMessage(`UTU: ${firstErrorLine(error)}`);
      return undefined;
    }
  }));
}

function wutuStarter(name) {
  return `using Browser from std:Browser;

export main() void {
    Browser.document.body.append(@wutu/\\
    main {
        font-family: system-ui;
        max-width: 40rem;
        margin: 4rem auto;
        padding: 1rem;
        h1 { "${name}"; }
        p { "Edit main.utu and watch this page update."; }
    }
    \\/);
}
`;
}

async function utuDocument(target) {
  const document = target instanceof vscode.Uri
    ? await vscode.workspace.openTextDocument(target)
    : target?.languageId
      ? target
      : vscode.window.activeTextEditor?.document;
  if (isUtu(document)) return document;
  await vscode.window.showWarningMessage('Open a .utu file to use UTU commands.');
  return undefined;
}

async function revealGenerated(store, source, kind, content, language) {
  const uri = store.set(source.uri, kind, content);
  let document = await vscode.workspace.openTextDocument(uri);
  if (document.languageId !== language) document = await vscode.languages.setTextDocumentLanguage(document, language);
  await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside });
}

class GeneratedDocuments {
  constructor() {
    this.values = new Map();
    this.emitter = new vscode.EventEmitter();
    this.onDidChange = this.emitter.event;
  }
  provideTextDocumentContent(uri) { return this.values.get(uri.toString()) ?? ''; }
  set(sourceUri, kind, content) {
    const uri = vscode.Uri.parse(`utu-generated:${encodeURIComponent(sourceUri.toString())}.${kind}`);
    this.values.set(uri.toString(), content);
    this.emitter.fire(uri);
    return uri;
  }
  dispose() { this.values.clear(); this.emitter.dispose(); }
}

function debounceByUri(delay, run) {
  const pending = new Map();
  const clear = uri => {
    const key = uri.toString();
    clearTimeout(pending.get(key));
    pending.delete(key);
  };
  const schedule = document => {
    clear(document.uri);
    pending.set(document.uri.toString(), setTimeout(() => {
      pending.delete(document.uri.toString());
      void run(document);
    }, delay));
  };
  schedule.flush = document => { clear(document.uri); return run(document); };
  schedule.delete = clear;
  schedule.dispose = () => {
    for (const timeout of pending.values()) clearTimeout(timeout);
    pending.clear();
  };
  return schedule;
}

function throwOnDiagnostics(diagnostics) {
  const error = diagnostics.find(item => item.severity === 'error');
  if (error) throw new Error(error.message || error.code || 'Compilation failed');
}

function renderXrayHtml(info, emission, fileName) {
  if (!info) return xrayShell(fileName, '<div class="empty"><b>NO SEMANTIC SIGNAL</b><span>Place the cursor on an expression, declaration, call, or field.</span></div>');
  const actual = info.type ? `<span class="type">${escapeHtml(info.type)}</span>` : '<span class="muted">untyped structural node</span>';
  const identity = [
    fact('Declaration', refLink(info.declaration)),
    fact('Call target', refLink(info.callTarget)),
    fact('Field', info.field ? `${escapeHtml(info.field.owner)}.${escapeHtml(info.title)} · ${escapeHtml(info.type)} · slot ${info.field.index}` : ''),
    fact('Effects', chips(info.effects)),
  ].join('');
  const expected = info.expectedType && info.expectedType !== info.type
    ? `<article class="expect"><div>${code(info.expectedType)}<small>expected here</small></div></article>`
    : '<p class="muted">No contextual constraint. This value stands on its inferred type.</p>';
  const coercions = info.conversions.map(item => `<article class="coercion">${code(item.from)}<b>→</b>${code(item.to)}<small>${escapeHtml(displayTerm(item.kind))}</small></article>`).join('');
  const captures = info.captures.length
    ? info.captures.map(item => `<article class="capture"><b>${escapeHtml(item.name)}</b>${refLink(item)}</article>`).join('')
    : '<p class="muted">No closure environment at this point.</p>';
  const wat = emission
    ? `<pre class="source-code"><code>${escapeHtml(emission)}</code></pre>`
    : `<p class="muted">${info.function ? `${escapeHtml(info.function)} is not in the module the exports build.` : 'Not inside a function.'}</p>`;
  return xrayShell(fileName, `
    <div class="hero"><div class="kicker">SEMANTIC X-RAY / LIVE ANALYSIS</div><h1>${escapeHtml(info.title)}</h1><div class="actual">${actual}</div><div class="tag">${escapeHtml(displayTerm(info.kind))}</div></div>
    <main>
      <section><header><em>01</em><h2>Identity</h2></header><div class="facts">${identity || '<p class="muted">Structural node with no resolved identity.</p>'}</div></section>
      <section><header><em>02</em><h2>Context demands</h2></header><div class="expectations">${expected}</div>${coercions}</section>
      <section><header><em>03</em><h2>Closure environment</h2></header><div class="captures">${captures}</div></section>
      <section><header><em>04</em><h2>Emission</h2></header><div class="facts">${fact('Wasm type', code(info.wasmType))}</div>${wat}</section>
    </main>`);
}

function xrayShell(fileName, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
  :root{--ink:var(--vscode-foreground);--paper:var(--vscode-editor-background);--line:var(--vscode-widget-border);--dim:var(--vscode-descriptionForeground);--signal:var(--vscode-charts-yellow,#e8bd52);--cold:var(--vscode-charts-blue,#58a6ff);--hot:var(--vscode-charts-red,#f47067)}
  *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:13px/1.5 var(--vscode-editor-font-family,monospace)}body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.035;background:repeating-linear-gradient(0deg,currentColor 0 1px,transparent 1px 4px)}
  .mast{height:34px;padding:8px 14px;border-bottom:1px solid var(--line);color:var(--dim);font-size:10px;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hero{position:relative;padding:30px 20px 24px;border-bottom:4px solid var(--ink);overflow:hidden}.hero:after{content:"UTU";position:absolute;right:-8px;bottom:-38px;font:900 96px/1 Georgia,serif;opacity:.045}.kicker{color:var(--signal);font-size:10px;letter-spacing:.18em}.hero h1{margin:7px 0 4px;font:700 31px/1.05 Georgia,serif}.actual{font-size:16px}.type{color:var(--cold);font-weight:700}.tag{position:absolute;right:18px;top:17px;border:1px solid var(--line);padding:3px 7px;color:var(--dim);font-size:9px;text-transform:uppercase}
  main{padding:0 20px 60px}section{padding:22px 0;border-bottom:1px solid var(--line)}section>header{display:flex;align-items:baseline;gap:10px;margin-bottom:14px}section>header em{color:var(--signal);font-size:10px;font-style:normal}h2{margin:0;font:700 17px/1 Georgia,serif}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}.fact{background:var(--paper);padding:11px}.fact small,.expect small,.coercion small{display:block;color:var(--dim);font-size:9px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
  code,.chip{background:var(--vscode-textCodeBlock-background);padding:2px 5px;border-radius:2px}.chip{display:inline-block;margin:0 4px 3px 0;color:var(--hot)}a{color:var(--cold);text-decoration:none;cursor:pointer}.source-link{display:block;min-width:180px;margin-top:5px}.source-link>span{display:inline-block;border-bottom:1px dotted currentColor;margin-bottom:4px}.source-code{margin:0;padding:8px 10px;overflow-x:auto;background:var(--vscode-textCodeBlock-background);border-left:2px solid var(--cold);color:var(--ink);font:12px/1.45 var(--vscode-editor-font-family,monospace);white-space:pre}.source-code code{padding:0;background:none}.tok.keyword{color:var(--vscode-symbolIcon-keywordForeground,#c586c0)}.tok.function{color:var(--vscode-symbolIcon-functionForeground,#dcdcaa)}.tok.type-token{color:var(--vscode-symbolIcon-classForeground,#4ec9b0)}.tok.string{color:var(--vscode-symbolIcon-stringForeground,#ce9178)}.tok.number,.tok.constant{color:var(--vscode-symbolIcon-numberForeground,#b5cea8)}.tok.comment{color:var(--vscode-descriptionForeground);font-style:italic}.tok.operator{color:var(--vscode-symbolIcon-operatorForeground,#d4d4d4)}.tok.property{color:var(--vscode-symbolIcon-propertyForeground,#9cdcfe)}.tok.focus{background:var(--vscode-editor-findMatchHighlightBackground);outline:1px solid var(--vscode-editor-findMatchBorder,transparent)}.trace{list-style:none;padding:0;margin:0}.trace li{display:grid;grid-template-columns:31px 1fr;gap:10px;position:relative;padding-bottom:15px}.trace li:not(:last-child):before{content:"";position:absolute;left:14px;top:19px;bottom:1px;border-left:1px solid var(--signal)}.trace i{font-style:normal;color:var(--signal);font-size:9px;border:1px solid var(--signal);width:29px;height:19px;text-align:center;padding-top:2px}.trace li>div>strong{display:block}.trace-detail{margin-top:5px;color:var(--dim)}
  .expectations,.captures{display:grid;gap:7px}.expect,.capture,.rewrite{border-left:3px solid var(--signal);background:var(--vscode-textBlockQuote-background);padding:9px 11px;display:flex;justify-content:space-between;gap:10px}.expect small{display:inline;margin-left:8px}.capture{border-color:var(--cold)}.capture code{margin-left:8px}.capture small,.capture-summary span,.capture-source>small{display:block;color:var(--dim)}.capture-summary{padding:10px 12px;border:1px solid var(--line)}.capture-summary b,.capture-summary span{display:block}.capture-source{margin-top:5px}.coercion{display:flex;align-items:center;gap:9px;margin-top:10px;padding:10px;border:1px dashed var(--signal)}.coercion small{margin:0 0 0 auto}.rewrite{border-color:var(--hot);margin-bottom:6px}.rewrite span{color:var(--dim)}.muted{color:var(--dim);margin:0}.empty{height:calc(100vh - 34px);display:grid;place-content:center;text-align:center;gap:8px;color:var(--dim)}.empty b{font:700 20px Georgia,serif;color:var(--ink)}
  </style></head><body><div class="mast">${escapeHtml(fileName)}</div>${body}<script>const vscode=acquireVsCodeApi();document.addEventListener('click',e=>{const a=e.target.closest('a[data-file]');if(!a)return;e.preventDefault();vscode.postMessage({type:'open',file:a.dataset.file,start:Number(a.dataset.start),end:Number(a.dataset.end)})});</script></body></html>`;
}

function fact(label, value) { return value ? `<div class="fact"><small>${escapeHtml(label)}</small>${value}</div>` : ''; }
function code(value) { return value ? `<code>${escapeHtml(value)}</code>` : ''; }
function chips(values = []) { return values.map(value => `<span class="chip">${escapeHtml(value)}</span>`).join(''); }
function refLink(ref, suffix = '') {
  if (!ref) return '';
  const label = ref.displayName || ref.name || displayTerm(ref.localName) || 'source';
  const heading = `${escapeHtml(label)}${suffix ? ` · ${escapeHtml(displayTerm(suffix))}` : ''}`;
  return `<a class="source-link" href="#" data-file="${escapeHtml(ref.file || '')}" data-start="${Number(ref.start ?? 0)}" data-end="${Number(ref.end ?? ref.start ?? 0)}"><span>${heading}</span>${highlightedSnippet(ref.snippet)}</a>`;
}
function highlightedSnippet(snippet) {
  if (!snippet?.text) return '';
  const boundaries = new Set([0, snippet.text.length, snippet.focusStart, snippet.focusEnd]);
  for (const token of snippet.tokens ?? []) { boundaries.add(token.start); boundaries.add(token.end); }
  const points = [...boundaries].filter(value => value >= 0 && value <= snippet.text.length).sort((a, b) => a - b);
  let html = '';
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i], end = points[i + 1];
    if (end <= start) continue;
    const candidates = (snippet.tokens ?? []).filter(token => token.start <= start && token.end >= end);
    candidates.sort((a, b) => Number(b.semantic) - Number(a.semantic) || (a.end - a.start) - (b.end - b.start));
    const role = tokenClass(candidates[0]?.role);
    const focus = start < snippet.focusEnd && end > snippet.focusStart ? ' focus' : '';
    html += `<span class="tok ${role}${focus}">${escapeHtml(snippet.text.slice(start, end))}</span>`;
  }
  return `<pre class="source-code"><code>${html}</code></pre>`;
}
function tokenClass(role = '') {
  if (role.startsWith('keyword')) return 'keyword';
  if (role === 'function') return 'function';
  if (role === 'type') return 'type-token';
  if (role === 'variable' || role === 'parameter') return 'variable';
  if (role === 'property') return 'property';
  if (role === 'string') return 'string';
  if (role.includes('numeric')) return 'number';
  if (role === 'comment') return 'comment';
  if (role.includes('operator') || role.includes('punctuation')) return 'operator';
  if (role.includes('constant')) return 'constant';
  return 'plain';
}
function sourceLabel(ref) {
  if (!ref) return '';
  const label = ref.displayName || ref.name || displayTerm(ref.localName) || 'source';
  return `${inlineCode(label)}${ref.row ? ` at line ${ref.row}` : ''}`;
}
function inlineCode(value) { return `\`${String(value ?? '').replace(/`/g, '\\`')}\``; }
function displayTerm(value) {
  const raw = String(value ?? '').replace(/^ir-/, '');
  const labels = {
    'return-of': 'return value of the resolved function',
    'field-of': 'declared field type',
    'awaited-type': 'value produced after awaiting',
    'protocol-return': 'protocol method return type',
    'static-method': 'static method',
    'instance-method': 'instance method',
    'operator-callee': 'operator implementation',
    'closure-decay': 'function converted to a closure',
    'nullable-widen': 'nullable conversion',
    'variant-to-enum': 'enum variant conversion',
    binding: 'declared type',
    declared: 'type annotation',
    known: 'known type',
    identity: 'same type as its value',
    literal: 'literal type',
    operator: 'resolved operator result',
    confluence: 'type shared by all branches',
    tail: 'final value of the block',
    predicate: 'boolean condition',
    closure: 'closure signature',
    argument: 'function argument',
    assign: 'assignment target',
    field: 'declared field',
    return: 'function return value',
    condition: 'boolean condition',
    fn: 'function',
    'fn-name': 'function',
    ident: 'name reference',
    let: 'local variable',
    lit: 'literal',
    binary: 'binary expression',
    unary: 'unary expression',
    'field-access': 'field access',
    'export-main': 'exported main function',
    'self-param': 'self parameter',
    param: 'parameter',
  };
  return labels[raw] ?? raw.replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}
function escapeMarkdown(text) { return String(text ?? '').replace(/[\\`*_{}\[\]()#+\-.!]/g, '\\$&'); }
function escapeHtml(text) { return String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

function firstErrorLine(error) {
  return String(error?.message ?? error).split('\n').find(line => line.trim())?.trim() || 'Compilation failed';
}
function clampOffset(value, length) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.min(Number(value), length)) : 0;
}
function fullRange(document) {
  return new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
}
function rangeFromRows(ref) {
  const start = new vscode.Position(Math.max(0, (ref.row ?? 1) - 1), Math.max(0, (ref.col ?? 1) - 1));
  const end = new vscode.Position(
    Math.max(start.line, (ref.endRow ?? ref.row ?? 1) - 1),
    Math.max(start.character + 1, (ref.endCol ?? ref.col ?? 1) - 1),
  );
  return new vscode.Range(start, end);
}
function displayName(document) {
  return document.fileName?.split(/[\\/]/u).pop() || document.uri.toString();
}
function validationMode() {
  return vscode.workspace.getConfiguration('utu').get('validation.mode', 'onType');
}
function isUtu(document) { return document?.languageId === LANGUAGE_ID; }
