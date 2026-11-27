// src/selfhost/query.js — what names mean, for an editor.
//
// After loadProgram, the compiler's tables say what declaration each name
// resolves to, and where each declaration is: the tools (dist/utu-tools.wasm,
// loadNodeTools) answer from them (selfhost/tools/query.utu, lsp.utu,
// docs.utu), in JSON. Places are { file (key), start, end }, UTF-16 offsets
// in the file's text.

/** Queries over the program loaded last (`files` is what loadProgram returned), with the tools' exports. */
export function programIndex(utu, files) {
  if (!utu.query_open) throw new Error('programIndex needs the tools (loadNodeTools): the compiler has no queries');
  utu.query_open(files.map(f => f.key).join('\n'));
  const ids = new Map(files.map((f, i) => [f.key, i]));
  const id = key => key == null ? -1 : ids.get(key) ?? -2;
  const json = text => JSON.parse(text);

  return {
    /** Where node `n` is: its file key and UTF-16 offsets, or null (a node of no file). */
    at: n => json(utu.query_at(n)),
    /** The declaration the name at `offset` (UTF-16) of file `key` resolves to, or -1. */
    declarationAt: (key, offset) => utu.query_declaration_at(id(key), offset),
    /** Where declaration `decl` names what it declares. */
    definition: decl => json(utu.query_definition(decl)),
    /** Every name resolving to `decl`, the declaring one first when `includeDeclaration`. */
    references: (decl, { includeDeclaration = true } = {}) => json(utu.query_references(decl, includeDeclaration ? 1 : 0)),
    /** What declaration `decl` declares: `Fn`, `Struct`, `Local`, … (resolve.utu's Decl). */
    kind: decl => utu.decl_kind_name(decl),
    /** Every declaration made in file `key` (in every file, for null), each with its kind and owner. */
    declarations: (key = null) => json(utu.query_declarations(id(key))),
    /** Every name in file `key` (in every file, for null) that resolves, with its declaration, in source order. */
    names: key => json(utu.query_names(id(key))),
    /** The smallest typed syntax at a cursor, with facts from the checker. */
    explainAt: (key, offset) => json(utu.query_explain(id(key), offset)),
    /** Markdown for X-Ray at a cursor: the type there and the checker's facts, or null. */
    explainHover: (key, offset) => utu.query_explain_hover(id(key), offset) || null,
    /** Binding and callee facts behind the type at a cursor. */
    typeTrace(key, offset) { return this.explainAt(key, offset)?.trace ?? []; },
    /** Type, capture, conversion, and effect annotations for one file. */
    inlayHints: key => json(utu.query_inlay_hints(id(key))),
    /** Function containing the name at the cursor. */
    prepareCallHierarchy: (key, offset) => json(utu.query_prepare_calls(id(key), offset)),
    incomingCalls: decl => json(utu.query_incoming_calls(decl)),
    outgoingCalls: decl => json(utu.query_outgoing_calls(decl)),
    /** The text of a place. */
    text(at) {
      const file = files[ids.get(at.file)];
      return file ? file.text.slice(at.start, at.end) : '';
    },

    // The language server's (see lsp.utu).
    /** What hovering the name at a cursor shows: { value (Markdown), name (its place) }, or null. */
    hover: (key, offset) => json(utu.query_hover(id(key), offset)),
    /** Where `decl`, and the protocol member or functions one name with it, are named (spelled `spelling`, when given). */
    linkedReferences: (decl, includeDeclaration = true, spelling = '') => json(utu.query_linked_references(decl, includeDeclaration ? 1 : 0, spelling)),
    /** Where the first of `decl`'s family (a protocol's member, or `decl`) is named. */
    rootDefinition: decl => json(utu.query_root_definition(decl)),
    /** The places of file `key` naming `decl`'s family: { at, kind } (3 declared, 2 read). */
    highlights: (key, decl) => json(utu.query_highlights(id(key), decl)),
    /** Renaming the name at a cursor: { name, alias, defs, occurrences }, or null. */
    rename: (key, offset) => json(utu.query_rename(id(key), offset)),
    /** Whether the name at a cursor is the program's `main`. */
    entryPoint: (key, offset) => utu.query_entry_point(id(key), offset) === 1,
    /** Each name of file `key`: { at, meant (where what it means is named), kind }. */
    bindings: key => json(utu.query_bindings(id(key))),
    /** The declaration named at `start` of file `key` (declared there, when `own`), or -1. */
    declarationNamed: (key, start, own = false) => utu.query_declaration_named(id(key), start, own ? 1 : 0),
    /** The outline of file `key`: { decl, owner, kind (SymbolKind), name, span, selection }. */
    symbols: key => json(utu.query_symbols(id(key))),
    /** The names of file `key` an editor colors: { at, type, declaration }. */
    semanticTokens: key => json(utu.query_semantic(id(key))),
    /** Where the name typed at a cursor starts, or -1 where nothing is written. */
    completionStart: (key, offset) => utu.query_completion_start(id(key), offset),
    /** What may be written at `start` of file `key`, with `placeholder` written there: LSP completion items. */
    completions: (key, start, placeholder) => json(utu.query_completions(id(key), start, placeholder)),
  };
}

/**
 * Doc comments over the program the tools hold (`files` as the build
 * returned them): declaration(decl) and file(key), each the Typst text or
 * '', and sections(key), the file's other `//!` blocks ({ start, text }).
 */
export function docComments(utu, files) {
  utu.query_open(files.map(f => f.key).join('\n'));
  const ids = new Map(files.map((f, i) => [f.key, i]));
  return {
    declaration: decl => utu.query_doc_declaration(decl),
    file: key => ids.has(key) ? utu.query_doc_file(ids.get(key)) : '',
    sections: key => ids.has(key) ? JSON.parse(utu.query_doc_sections(ids.get(key))) : [],
  };
}

/** The paths of `text`'s `using … from "…"` (not in a comment or another string). */
export function importPaths(utu, text) {
  return JSON.parse(utu.query_import_paths(text)).flatMap(literal => { try { return [JSON.parse(literal)]; } catch { return []; } });
}

/** Whether a rename may give the name `name`: spelled as one, and no keyword. */
export const isNewName = (utu, name) => utu.query_new_name(name) === 1;
