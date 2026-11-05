import * as vscode from 'vscode';
import { cssProjection } from '../compiler/css-stencil.js';
import { formatUtuSource, wutuCompletions } from '../compiler/wutu-tooling.js';

const LANGUAGE_ID = 'utu';
const DOCUMENT_SELECTOR = Object.freeze({ language: LANGUAGE_ID, scheme: '*' });
const COMPILER_MODULE = '../utu.js';
const decoder = new TextDecoder('utf-8');

let activeService;
let compilerModuleSpecifier = COMPILER_MODULE;
let extensionRoot;

export async function activate(context) {
  extensionRoot = context.extensionUri;
  compilerModuleSpecifier = context.extensionUri
    ? vscode.Uri.joinPath(context.extensionUri, 'dist', 'utu.js').toString()
    : COMPILER_MODULE;
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
      service.invalidate(document.uri);
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
      provideDocumentFormattingEdits(document) {
        const source = document.getText();
        let formatted;
        try {
          formatted = formatUtuSource(source);
        } catch {
          // Keep incomplete source intact; diagnostics identify the syntax error.
          return [];
        }
        if (source === formatted) return [];
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
    const analysis = await service.analyze(document, 'normal');
    throwOnDiagnostics(analysis.artifacts.diagnostics);
    const { emitText } = await loadUtu();
    await revealGenerated(generated, document, 'wat', emitText(analysis.doc), 'wat');
  });

  registerCommand(context, output, 'utu.showSyntaxTree', async target => {
    const document = await utuDocument(target);
    if (!document) return;
    const parser = await service.parser();
    const tree = parser.parse(document.getText());
    try {
      await revealGenerated(generated, document, 'syntax', tree.rootNode.toString(), 'plaintext');
    } finally {
      tree.delete?.();
    }
  });

  registerCommand(context, output, 'utu.showCompilerIR', async target => {
    const document = await utuDocument(target);
    if (!document) return;
    const analysis = await service.analyze(document, 'analysis');
    await revealGenerated(generated, document, 'ir', analysis.doc?.body?.firstChild?.outerHTML ?? '', 'html');
  });

  registerCommand(context, output, 'utu.showSemanticXray', async target => {
    const editor = target?.document ? target : vscode.window.activeTextEditor;
    if (!isUtu(editor?.document)) return utuDocument(target);
    await xray.show(editor);
  });

  registerCommand(context, output, 'utu.showCompilerGraphs', async target => {
    const document = await utuDocument(target?.document ?? target);
    if (!document) return;
    const analysis = await service.analyze(document, 'analysis');
    const { renderGraphHtml } = await loadUtu();
    const panel = vscode.window.createWebviewPanel(
      'utuCompilerGraphs',
      `UTU Graphs — ${displayName(document)}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = renderGraphHtml(analysis.doc, document.getText(), document.uri.toString());
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
 * Diagnostics, builds, runs, definitions and references come from the
 * self-hosted compiler (dist/utu.wasm): a build takes milliseconds. Hover,
 * inlay hints, call hierarchy, the X-Ray and the IR and graph views read
 * stage 0's semantic analysis, loaded the first time one is used. When the
 * engine cannot run the self-hosted compiler (it needs WasmGC and the JS
 * string builtins), stage 0 does everything.
 */
export function createCompilerService(output = null) {
  let parserPromise;
  const compilers = new Map();
  const analyses = new Map();
  const parser = () => (parserPromise ??= loadUtu().then(({ initParser }) => initParser()));
  const selfhost = createSelfhostService(output);

  async function compiler(target) {
    if (!compilers.has(target)) {
      compilers.set(target, parser().then(async parserInstance => {
        const { createCompiler } = await loadUtu();
        return createCompiler({
          parser: parserInstance,
          target,
          readFile: readWorkspaceFile,
          resolvePath: resolveImport,
        });
      }));
    }
    return compilers.get(target);
  }

  // Stage 0's build of a document, as the self-hosted one is: its module and spec.
  async function stage0Build(document) {
    const analysis = await analyze(document, 'normal');
    throwOnDiagnostics(analysis.artifacts.diagnostics);
    const { emitBinary } = await loadUtu();
    return { wasm: emitBinary(analysis.doc), doc: analysis.doc };
  }

  function analyze(document, target = 'analysis') {
    const key = `${target}\u0000${document.uri.toString()}\u0000${document.version}`;
    let pending = analyses.get(key);
    if (!pending) {
      pending = compiler(target).then(instance => instance.analyzeFile(document.uri.toString()));
      analyses.set(key, pending);
      pending.catch(() => analyses.delete(key));
    }
    return pending;
  }

  return {
    parser,
    selfhosted: () => selfhost.available(),
    async diagnostics(document) {
      if (await selfhost.available()) return selfhost.diagnostics(document);
      try {
        return (await analyze(document, 'analysis')).artifacts.diagnostics;
      } catch (error) {
        if (error?.artifacts?.diagnostics?.length) return error.artifacts.diagnostics;
        throw error;
      }
    },
    async build(document) {
      if (await selfhost.available()) return selfhost.build(document);
      return stage0Build(document);
    },
    async instantiate(document) {
      if (await selfhost.available()) return selfhost.instantiate(document);
      const { wasm, doc } = await stage0Build(document);
      const { buildImportObject, instantiateLowered } = await loadUtu();
      const { instance } = await instantiateLowered(wasm, await buildImportObject(doc));
      return { exports: instance.exports };
    },
    async definition(document, offset) {
      if (await selfhost.available()) return selfhost.query(document, index => index.definition(index.declarationAt(document.uri.toString(), offset)));
      return (await analyze(document)).snapshot.definitionAt(document.uri.toString(), offset);
    },
    async references(document, offset, includeDeclaration) {
      if (await selfhost.available()) {
        return selfhost.query(document, index => {
          const decl = index.declarationAt(document.uri.toString(), offset);
          return decl < 0 ? [] : index.references(decl, { includeDeclaration });
        });
      }
      return (await analyze(document)).snapshot.referencesAt(document.uri.toString(), offset, { includeDeclaration });
    },
    analyze,
    invalidate(uri) {
      const marker = `\u0000${uri.toString()}\u0000`;
      for (const key of analyses.keys()) if (key.includes(marker)) analyses.delete(key);
    },
    dispose() {
      parserPromise?.then(value => value.delete?.()).catch(() => {});
      analyses.clear();
      compilers.clear();
    },
  };
}

/** The self-hosted compiler, one program at a time (it holds the program in its memories). */
function createSelfhostService(output) {
  let loading;
  let queue = Promise.resolve();
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
    output?.appendLine(`[utu] The self-hosted compiler is not available here (${firstErrorLine(error)}); using stage 0.`);
    throw error;
  }));
  // Each use runs alone, after the ones before it.
  const exclusive = task => {
    const run = queue.then(() => load().then(task));
    queue = run.catch(() => {});
    return run;
  };
  const build = (document, target = 'normal') => exclusive(({ api, utu, host }) =>
    api.compile(utu, document.uri.toString(), { ...host, target }));
  const throwOn = ({ wasm, diagnostics }) => {
    if (!wasm) throw new Error(diagnostics[0]?.message ?? 'Compilation failed');
  };
  return {
    available: () => load().then(() => true, () => false),
    // What the program's exports and its tests need, in this file.
    async diagnostics(document) {
      const uri = document.uri.toString();
      const seen = new Set();
      const out = [];
      for (const target of ['normal', 'test']) {
        for (const d of (await build(document, target)).diagnostics) {
          const key = `${d.file}\u0000${d.start}\u0000${d.end}\u0000${d.message}`;
          if (d.file !== uri || seen.has(key)) continue;
          seen.add(key);
          // The diagnostic's own kind, its notes after the message, the other
          // places it is about, and its fix (a quick fix, below).
          out.push({
            severity: d.severity,
            message: [d.message, ...(d.notes ?? []).map(note => `note: ${note}`)].join('\n'),
            code: d.code ?? d.kind,
            primary: { start: d.focus?.start ?? d.start, end: d.focus?.end ?? d.end },
            related: (d.related ?? []).map(r => ({ file: r.file, start: r.start, end: r.end, label: r.label })),
            fix: d.fix && d.fix.file === uri ? { start: d.fix.start, end: d.fix.end, text: d.fix.text, label: d.fix.label } : null,
          });
        }
      }
      return out;
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
    // `answer(index)` over the document's program, its names resolved.
    query(document, answer) {
      return exclusive(async ({ api, utu, host }) => {
        const files = await api.loadProgram(utu, document.uri.toString(), host);
        return answer(api.programIndex(utu, files));
      });
    },
  };
}

let utuModulePromise;
function loadUtu() {
  return (utuModulePromise ??= import(compilerModuleSpecifier));
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
      const analysis = await service.analyze(document, 'analysis');
      const info = analysis.snapshot.explainAt(document.uri.toString(), document.offsetAt(position));
      if (!info) return null;
      const markdown = new vscode.MarkdownString(renderHover(info));
      markdown.isTrusted = { enabledCommands: ['utu.showSemanticXray'] };
      markdown.supportHtml = true;
      markdown.supportThemeIcons = true;
      return new vscode.Hover(markdown, rangeForRef(document, info.node));
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
      const analysis = await service.analyze(document, 'analysis');
      return analysis.snapshot.inlayHintsForFile(document.uri.toString())
        .filter(item => item.position >= document.offsetAt(range.start) && item.position <= document.offsetAt(range.end))
        .map(item => {
          const hint = new vscode.InlayHint(
            document.positionAt(item.position),
            item.label,
            item.kind === 'type' ? vscode.InlayHintKind.Type : vscode.InlayHintKind.Parameter,
          );
          hint.tooltip = item.tooltip;
          hint.paddingLeft = true;
          return hint;
        });
    },
  };
}

function callHierarchyProvider(service) {
  return {
    async prepareCallHierarchy(document, position) {
      const analysis = await service.analyze(document, 'analysis');
      const value = analysis.snapshot.prepareCallHierarchy(document.uri.toString(), document.offsetAt(position));
      return value ? callHierarchyItem(value, document) : null;
    },
    async provideCallHierarchyIncomingCalls(item) {
      const document = await vscode.workspace.openTextDocument(item.uri);
      const analysis = await service.analyze(document, 'analysis');
      return Promise.all(analysis.snapshot.incomingCalls(item._utuId).map(async group => {
        const targetDocument = await documentForRef(group.item, document);
        const target = callHierarchyItem(group.item, targetDocument);
        const ranges = await Promise.all(group.sites.map(async ref => {
          const source = await documentForRef(ref, document);
          return rangeForRef(source, ref);
        }));
        return new vscode.CallHierarchyIncomingCall(target, ranges);
      }));
    },
    async provideCallHierarchyOutgoingCalls(item) {
      const document = await vscode.workspace.openTextDocument(item.uri);
      const analysis = await service.analyze(document, 'analysis');
      return Promise.all(analysis.snapshot.outgoingCalls(item._utuId).map(async group => {
        const targetDocument = await documentForRef(group.item, document);
        const target = callHierarchyItem(group.item, targetDocument);
        const ranges = group.sites.map(ref => rangeForRef(document, ref));
        return new vscode.CallHierarchyOutgoingCall(target, ranges);
      }));
    },
  };
}

function callHierarchyItem(value, document) {
  const range = rangeForRef(document, value);
  const detail = [value.tag?.replace(/^ir-/, ''), value.effects?.length ? `effects: ${value.effects.join(', ')}` : 'pure']
    .filter(Boolean).join(' · ');
  const item = new vscode.CallHierarchyItem(
    vscode.SymbolKind.Function,
    value.displayName || value.name || 'function',
    detail,
    document.uri,
    range,
    range,
  );
  item._utuId = value.id;
  return item;
}

function renderHover(info) {
  const title = info.node.displayName || info.node.name || displayTerm(info.node.tag) || 'expression';
  const signature = info.actualType
    ? `\`\`\`utu\n${title}: ${info.actualType}\n\`\`\``
    : `### $(symbol-variable) ${escapeMarkdown(title)}`;
  const lines = [signature];
  if (info.loopCapture) {
    const bindings = info.loopCapture.bindings.map(binding => `${inlineCode(binding.name)} is ${inlineCode(binding.type || 'inferred at use sites')} · ${binding.uses} use${binding.uses === 1 ? '' : 's'}`);
    lines.push('', `$(symbol-variable) **Loop ${info.loopCapture.bindings.length === 1 ? 'binding' : 'bindings'}**  `, ...bindings.map(value => `${value}  `));
    if (info.loopCapture.sources?.length) {
      lines.push(`$(debug-start) **Produced by** ${info.loopCapture.sources.map(item => sourceLabel(item.node)).join(', ')}`);
    }
  }
  if (info.expectations?.length) {
    lines.push('', `$(type-hierarchy) **Expected** ${info.expectations.map(item => `${inlineCode(item.type)} as ${escapeMarkdown(displayTerm(item.site || 'context'))}`).join(' · ')}`);
  }
  if (info.declaration) lines.push(`$(references) **Resolves to** ${sourceLabel(info.declaration)}`);
  if (info.resolvedFunction) lines.push(`$(call-outgoing) **Call target** ${sourceLabel(info.resolvedFunction)}${info.resolvedFunction.resolvedAs ? ` · ${escapeMarkdown(displayTerm(info.resolvedFunction.resolvedAs))}` : ''}`);
  if (info.field) lines.push(`$(symbol-field) **Field** ${inlineCode(`${info.field.owner}.${info.node.displayName}: ${info.field.type}`)}${info.field.index != null ? ` · heap slot ${info.field.index}` : ''}`);
  if (info.coercions?.length) lines.push(`$(replace) **Conversion** ${info.coercions.map(item => `${inlineCode(`${item.from} → ${item.to}`)} (${displayTerm(item.kind)})`).join(', ')}`);
  if (info.effects?.length) lines.push(`$(zap) **Effects** ${info.effects.map(inlineCode).join(' ')}`);
  if (info.captures?.length) lines.push(`$(package) **Closure environment** ${info.captures.map(item => inlineCode(item.name)).join(', ')}`);
  if (info.actualTrace?.length > 1) {
    lines.push('', '$(question) **Why this type**');
    for (const step of info.actualTrace.slice(0, 4)) {
      lines.push(`- ${escapeMarkdown(displayTerm(step.reason))} — ${sourceLabel(step.node)}`);
    }
  }
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
      const analysis = await this.service.analyze(document, 'analysis');
      if (!this.panel || document.version !== version) return;
      const info = analysis.snapshot.explainAt(document.uri.toString(), document.offsetAt(editor.selection.active));
      this.panel.webview.html = renderXrayHtml(info, displayName(document));
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

function renderXrayHtml(info, fileName) {
  if (!info) return xrayShell(fileName, '<div class="empty"><b>NO SEMANTIC SIGNAL</b><span>Place the cursor on an expression, declaration, call, or field.</span></div>');
  const actual = info.actualType ? `<span class="type">${escapeHtml(info.actualType)}</span>` : '<span class="muted">untyped structural node</span>';
  const identity = [
    fact('Declaration', refLink(info.declaration)),
    fact('Call target', refLink(info.resolvedFunction, info.resolvedFunction?.resolvedAs)),
    fact('Field', info.field ? `${escapeHtml(info.field.owner)}.${escapeHtml(info.node.displayName)} · ${escapeHtml(info.field.type)}${info.field.index != null ? ` · slot ${info.field.index}` : ''}` : ''),
    fact('Effects', chips(info.effects)),
    fact('Representation', info.representation ? code(info.representation) : ''),
  ].join('');
  const expectations = info.expectations?.length
    ? info.expectations.map(item => `<article class="expect"><div>${code(item.type)}<small>${escapeHtml(displayTerm(item.site || item.mode || 'context'))}</small></div>${refLink(item.source)}</article>`).join('')
    : '<p class="muted">No contextual constraint. This value stands on its inferred type.</p>';
  const trace = info.actualTrace?.map((step, index) => `<li>
    <i>${String(index + 1).padStart(2, '0')}</i><div><strong>${escapeHtml(displayTerm(step.reason))}</strong><div class="trace-detail">${code(step.type)}${refLink(step.node)}</div></div>
  </li>`).join('') || '';
  const captures = info.loopCapture
    ? `<div class="capture-summary"><b>Loop ${info.loopCapture.bindings.length === 1 ? 'binding' : 'bindings'}</b><span>Values introduced by this loop and scoped to its body.</span></div>
      ${info.loopCapture.bindings.map(item => `<article class="capture"><div><b>${escapeHtml(item.name)}</b>${item.type ? code(item.type) : ''}<small>${item.uses} use${item.uses === 1 ? '' : 's'} in the loop body</small></div></article>`).join('')}
      ${info.loopCapture.sources.map(item => `<div class="capture-source"><small>PRODUCED BY</small>${refLink(item.node)}</div>`).join('')}`
    : info.captures?.length
      ? info.captures.map(item => `<article class="capture"><b>${escapeHtml(item.name)}</b>${refLink(item.declaration)}</article>`).join('')
      : '<p class="muted">No closure environment at this point.</p>';
  const coercions = info.coercions?.length
    ? info.coercions.map(item => `<article class="coercion">${code(item.from)}<b>→</b>${code(item.to)}<small>${escapeHtml(displayTerm(item.kind))}</small></article>`).join('')
    : '';
  const provenance = info.provenance?.length
    ? `<section><header><em>06</em><h2>Rewrite lineage</h2></header>${info.provenance.map(item => `<div class="rewrite"><b>${escapeHtml(displayTerm(item.pass || 'compiler'))}</b><span>${escapeHtml(displayTerm(item.kind || 'rewrite'))}</span>${refLink(item.source)}</div>`).join('')}</section>`
    : '';
  return xrayShell(fileName, `
    <div class="hero"><div class="kicker">SEMANTIC X-RAY / LIVE ANALYSIS</div><h1>${escapeHtml(info.node.displayName || displayTerm(info.node.tag))}</h1><div class="actual">${actual}</div><div class="tag">${escapeHtml(displayTerm(info.node.tag || ''))}</div></div>
    <main>
      <section><header><em>01</em><h2>Identity</h2></header><div class="facts">${identity || '<p class="muted">Structural node with no resolved identity.</p>'}</div></section>
      <section><header><em>02</em><h2>Why this type</h2></header><ol class="trace">${trace}</ol></section>
      <section><header><em>03</em><h2>Context demands</h2></header><div class="expectations">${expectations}</div>${coercions}</section>
      <section><header><em>04</em><h2>Closure environment</h2></header><div class="captures">${captures}</div></section>
      <section><header><em>05</em><h2>Emission</h2></header><div class="facts">${fact('Backend type', code(info.backend?.type))}${fact('Backend expectation', code(info.backend?.expected))}${fact('Call target ID', code(info.backend?.callTargetId))}</div></section>
      ${provenance}
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
