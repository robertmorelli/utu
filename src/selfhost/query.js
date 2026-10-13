// src/selfhost/query.js — what names mean, for an editor.
//
// After loadProgram, the compiler's tables say what declaration each name
// resolves to (node_decl), and where each declaration is (decl_node). Read
// straight from its memories: go to definition and find references cost a
// pass over the nodes, with no build.

/** Queries over the program loaded last (`files` is what loadProgram returned). */
export function programIndex(utu, files) {
  const view = (mem, Type) => new Type(mem.buffer);
  const first = view(utu.node_first, Int32Array);
  const last = view(utu.node_last, Int32Array);
  const tokStart = view(utu.tok_start, Int32Array);
  const tokEnd = view(utu.tok_end, Int32Array);
  const nodeDecl = view(utu.node_decl, Int32Array);
  const declNode = view(utu.decl_node, Int32Array);
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
  const named = n => nodeDecl[n] >= 0 && first[n] < last[n] && last[n] - first[n] === 1;

  return {
    /** The declaration the name at `offset` (UTF-16) of file `key` resolves to, or -1. */
    declarationAt(key, offset) {
      for (let n = 0; n < count; n++) {
        if (!named(n)) continue;
        const at = place(n);
        if (at && at.file === key && at.start <= offset && offset <= at.end) return nodeDecl[n];
      }
      return -1;
    },
    /** Where declaration `decl` names what it declares. */
    definition(decl) {
      const owner = declNode[decl];
      if (owner < 0) return null;
      const lo = tokStart[first[owner]];
      const hi = tokEnd[last[owner] - 1];
      let best = -1;
      for (let n = 0; n < count; n++) {
        if (nodeDecl[n] !== decl || !named(n)) continue;
        const s = tokStart[first[n]];
        if (s >= lo && s < hi && (best < 0 || s < tokStart[first[best]])) best = n;
      }
      return place(best >= 0 ? best : owner);
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
      return out;
    },
    /** The text of a place. */
    text(at) {
      const file = files.find(f => f.key === at.file);
      return file ? file.text.slice(at.start, at.end) : '';
    },
  };
}
