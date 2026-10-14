// src/selfhost/query.js — what names mean, for an editor.
//
// After loadProgram, the compiler's tables say what declaration each name
// resolves to (node_decl), and where each declaration is (decl_node). Read
// straight from its memories: go to definition and find references cost a
// pass over the nodes, with no build.

const COMMENT = 8;  // lex.utu's Tok.Comment

// The characters of a WAT identifier after its `$`.
const WAT_ID = /[0-9A-Za-z!#$%&'*+\-./:<=>?@\\^_`|~]/;

// The words a declaration begins with, before what it names.
const DECLARING = new Set(['export', 'mod', 'struct', 'tag', 'enum', 'proto', 'fn', 'type', 'distinct', 'let', 'const', 'mem', 'vec', 'using']);

/** Queries over the program loaded last (`files` is what loadProgram returned). */
export function programIndex(utu, files) {
  const view = (mem, Type) => new Type(mem.buffer);
  const first = view(utu.node_first, Int32Array);
  const last = view(utu.node_last, Int32Array);
  const tokStart = view(utu.tok_start, Int32Array);
  const tokEnd = view(utu.tok_end, Int32Array);
  const tokKind = view(utu.tok_kind, Uint8Array);
  const nodeDecl = view(utu.node_decl, Int32Array);
  const declNode = view(utu.decl_node, Int32Array);
  const declOwner = view(utu.decl_owner, Int32Array);
  const count = utu.node_count();
  const units = new Map();

  const fileOf = byte => {
    for (let f = files.length - 1; f >= 0; f--) if (files[f].offset <= byte) return byte < files[f].offset + files[f].bytes.length ? files[f] : null;
    return null;
  };
  // A byte of `src` as a UTF-16 offset in its file's text.
  const toUnits = (file, byte) => {
    let table = units.get(file);
    if (!table) {
      table = new Int32Array(file.bytes.length + 1);
      let u = 0;
      for (let b = 0; b < file.bytes.length;) {
        const c = file.bytes[b];
        const n = c < 0x80 ? 1 : c < 0xe0 ? 2 : c < 0xf0 ? 3 : 4;
        for (let k = 0; k < n; k++) table[b + k] = u;
        b += n;
        u += n === 4 ? 2 : 1;
      }
      table[file.bytes.length] = u;
      units.set(file, table);
    }
    return table[byte - file.offset];
  };
  const place = node => {
    const start = tokStart[first[node]];
    const file = fileOf(start);
    if (!file) return null;
    return { file: file.key, start: toUnits(file, start), end: toUnits(file, tokEnd[last[node] - 1]) };
  };
  // By declaration: the first name inside it that resolves to it (its own
  // name), or -1. One pass over the nodes, made when first asked.
  let namingNodes = null;
  const naming = () => {
    if (namingNodes) return namingNodes;
    namingNodes = new Int32Array(utu.decl_count()).fill(-1);
    for (let n = 0; n < count; n++) {
      const d = nodeDecl[n];
      if (d < 0 || d >= namingNodes.length || !named(n) || declNode[d] < 0) continue;
      const s = tokStart[first[n]];
      if (s < tokStart[first[declNode[d]]] || s >= tokEnd[last[declNode[d]] - 1]) continue;
      const best = namingNodes[d];
      if (best < 0 || s < tokStart[first[best]]) namingNodes[d] = n;
    }
    return namingNodes;
  };
  const named = n => nodeDecl[n] >= 0 && first[n] < last[n] && last[n] - first[n] === 1;
  // A @wat function's parameters, used in its text as `$x`: by declaration,
  // the places of those names (after the `$`). Found when first asked.
  let watPlaces = null;
  const watUses = () => {
    if (watPlaces) return watPlaces;
    watPlaces = new Map();
    const src = new Uint8Array(utu.src.buffer);
    for (let k = 0, n = utu.wat_count?.() ?? 0; k < n; k++) {
      const fnNode = utu.wat_function(k);
      let fn = -1;
      for (let d = 0, count = utu.decl_count(); d < count && fn < 0; d++) if (declNode[d] === fnNode) fn = d;
      const params = new Map();
      for (let d = 0, count = utu.decl_count(); d < count; d++) {
        if (declOwner[d] !== fn || utu.decl_kind_name(d) !== 'Param') continue;
        const at = place(naming()[d] >= 0 ? naming()[d] : declNode[d]);
        if (at) params.set(files.find(f => f.key === at.file)?.text.slice(at.start, at.end), d);
      }
      const start = utu.wat_text_start(k);
      const end = utu.wat_text_end(k);
      const file = fileOf(start);
      if (!file || !params.size) continue;
      for (let b = start; b < end; b++) {
        const c = src[b];
        // Comments: `;; …` to the line's end, `(; … ;)` nested.
        if (c === 59 && src[b + 1] === 59) { while (b < end && src[b] !== 10) b++; continue; }
        if (c === 40 && src[b + 1] === 59) {
          let depth = 0;
          for (; b < end; b++) {
            if (src[b] === 40 && src[b + 1] === 59) { depth++; b++; } else if (src[b] === 59 && src[b + 1] === 41) { depth--; b++; if (!depth) break; }
          }
          continue;
        }
        if (c !== 36) continue;
        let e = b + 1;
        while (e < end && WAT_ID.test(String.fromCharCode(src[e]))) e++;
        const decl = params.get(new TextDecoder().decode(src.subarray(b + 1, e)));
        if (decl !== undefined) {
          if (!watPlaces.has(decl)) watPlaces.set(decl, []);
          watPlaces.get(decl).push({ file: file.key, start: toUnits(file, b + 1), end: toUnits(file, e) });
        }
        b = e - 1;
      }
    }
    return watPlaces;
  };
  // A declaration with no name node resolving to it (`struct &:`): the
  // first token after its keywords, when that is a name or `&`.
  const decoder = new TextDecoder();
  const nameToken = node => {
    for (let t = first[node]; t < last[node]; t++) {
      if (tokKind[t] === COMMENT) continue;
      const file = fileOf(tokStart[t]);
      if (!file) return null;
      const text = decoder.decode(file.bytes.subarray(tokStart[t] - file.offset, tokEnd[t] - file.offset));
      if (DECLARING.has(text)) continue;
      if (text !== '&' && !/^[A-Za-z_]\w*$/.test(text)) return null;
      return { file: file.key, start: toUnits(file, tokStart[t]), end: toUnits(file, tokEnd[t]) };
    }
    return null;
  };

  return {
    /** Where node `n` is: its file key and UTF-16 offsets, or null (a node of no file). */
    at: place,
    /** The declaration the name at `offset` (UTF-16) of file `key` resolves to, or -1. */
    declarationAt(key, offset) {
      for (let n = 0; n < count; n++) {
        if (!named(n)) continue;
        const at = place(n);
        if (at && at.file === key && at.start <= offset && offset <= at.end) return nodeDecl[n];
      }
      for (const [decl, places] of watUses()) {
        // (On its `$` too.)
        if (places.some(at => at.file === key && at.start - 1 <= offset && offset <= at.end)) return decl;
      }
      return -1;
    },
    /** Where declaration `decl` names what it declares. */
    definition(decl) {
      const owner = declNode[decl];
      if (owner < 0) return null;
      const best = naming()[decl];
      return best >= 0 ? place(best) : nameToken(owner) ?? place(owner);
    },
    /** Every name resolving to `decl`, the declaring one first when `includeDeclaration`. */
    references(decl, { includeDeclaration = true } = {}) {
      const definition = this.definition(decl);
      const out = [];
      for (let n = 0; n < count; n++) {
        if (nodeDecl[n] !== decl || !named(n)) continue;
        const at = place(n);
        if (!at) continue;
        const declaring = definition && at.file === definition.file && at.start === definition.start;
        if (declaring && !includeDeclaration) continue;
        if (declaring) out.unshift(at); else out.push(at);
      }
      return [...out, ...watUses().get(decl) ?? []];
    },
    /** Where the whole of declaration `decl` is (its node), or null. */
    span(decl) {
      return declNode[decl] >= 0 ? place(declNode[decl]) : null;
    },
    /** What declaration `decl` declares: `Fn`, `Struct`, `Local`, … (resolve.utu's Decl). */
    kind(decl) {
      return utu.decl_kind_name(decl);
    },
    /** The declaration `decl` is part of (module, struct, enum, function), or -1. */
    owner(decl) {
      return declOwner[decl];
    },
    /** A local's or parameter's type as the last build checked it, or ''. */
    type(decl) {
      return utu.decl_checked_type(decl);
    },
    /** The declaration of a local's type (what `x.` names the members of), or -1. */
    typeDeclaration(decl) {
      return utu.decl_checked_type_decl(decl);
    },
    /** Every declaration made in file `key` (in every file, for null), each with its kind and owner. */
    declarations(key = null) {
      const out = [];
      for (let d = 0, n = utu.decl_count(); d < n; d++) {
        if (declNode[d] < 0) continue;
        const at = place(declNode[d]);
        if (at && (key == null || at.file === key)) out.push({ decl: d, kind: utu.decl_kind_name(d), owner: declOwner[d], span: at });
      }
      return out;
    },
    /** Every name in file `key` that resolves, with its declaration, in source order. */
    names(key) {
      const out = [];
      for (let n = 0; n < count; n++) {
        if (!named(n)) continue;
        const at = place(n);
        if (at && at.file === key) out.push({ decl: nodeDecl[n], at });
      }
      for (const [decl, places] of watUses()) for (const at of places) if (at.file === key) out.push({ decl, at });
      // A name node may wrap another of the same token: each place once.
      out.sort((a, b) => a.at.start - b.at.start);
      return out.filter((name, i) => i === 0 || name.at.start !== out[i - 1].at.start);
    },
    /** The token of file `key` that `offset` (UTF-16) is inside: { kind (lex.utu's Tok), start, end }, or null. */
    tokenAt(key, offset) {
      const f = files.findIndex(file => file.key === key);
      if (f < 0) return null;
      for (let t = utu.file_first_token(f), end = utu.file_end_token(f); t < end; t++) {
        const start = toUnits(files[f], tokStart[t]);
        if (start >= offset) return null;
        const stop = toUnits(files[f], tokEnd[t]);
        if (offset < stop || (offset === stop && tokKind[t] === COMMENT)) return { kind: tokKind[t], start, end: stop };
      }
      return null;
    },
    /** The text of a place. */
    text(at) {
      const file = files.find(f => f.key === at.file);
      return file ? file.text.slice(at.start, at.end) : '';
    },
  };
}
