// src/selfhost/catalog.js — the platform's host declarations, ready to read.
//
// std:Browser, std:JS, std:Web, and std:Worker declare thousands of types.
// `bun run build` writes them as the compiler reads them (writeCatalog, into
// dist/selfhost/catalog/): each document's JSON bytes and where each type
// starts, and each module's view, so a host only reads files (or fetches
// them, which HTTP compression makes small) and parses nothing.
//
//   catalog.json      { "std:Browser": { "document": "browser", "view": "Browser" }, … }
//   NAME.types.json   a document: [type, type, …]
//   NAME.offsets      where each type starts in it (little-endian I32s)
//   NAME.view.json    a view: { prefix, moduleSpecifier, exports, names, mutableGlobals }

import { typesDocument } from './compiler.js';

/**
 * The standard library with the catalog's modules ready: `stdlib` (the
 * platform sources) with each catalogued module given as { document, view }.
 * `read(name)` gives a catalog file's bytes.
 */
export function catalogStdlib(stdlib, read) {
  const documents = new Map();
  let manifest;
  const document = name => {
    if (!documents.has(name)) {
      documents.set(name, (async () => {
        const [bytes, offsets] = await Promise.all([read(`${name}.types.json`), read(`${name}.offsets`)]);
        return { bytes, offsets: littleEndianI32s(offsets) };
      })());
    }
    return documents.get(name);
  };
  const modules = new Map(stdlib);
  const entries = new Map();
  for (const key of ['std:Browser', 'std:JS', 'std:Web', 'std:Worker']) {
    if (typeof stdlib.get(key) !== 'function') continue;
    modules.set(key, () => {
      if (!entries.has(key)) {
        entries.set(key, (async () => {
          manifest ??= JSON.parse(new TextDecoder().decode(await read('catalog.json')));
          const { document: doc, view } = manifest[key];
          const [d, v] = await Promise.all([document(doc), read(`${view}.view.json`)]);
          return { document: d, view: v };
        })());
      }
      return entries.get(key);
    });
  }
  return modules;
}

function littleEndianI32s(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Int32Array(bytes.byteLength / 4);
  for (let k = 0; k < out.length; k++) out[k] = view.getInt32(k * 4, true);
  return out;
}

/**
 * The catalog's files, from the platform sources (at build time): a map of
 * file name to bytes.
 */
export async function writeCatalog(stdlib) {
  const files = new Map();
  const manifest = {};
  const names = new Map();
  const encoder = new TextEncoder();
  for (const [key, view] of [['std:Browser', 'Browser'], ['std:JS', 'JS'], ['std:Web', 'Web'], ['std:Worker', 'Worker']]) {
    const source = stdlib.get(key);
    if (typeof source !== 'function') continue;
    const { abi } = await source();
    // Views of one ABI share its document.
    if (!names.has(abi.types)) {
      const name = key === 'std:Worker' ? 'worker' : 'browser';
      const { bytes, offsets } = typesDocument(abi.types);
      const le = new Uint8Array(offsets.length * 4);
      const dv = new DataView(le.buffer);
      offsets.forEach((offset, k) => dv.setInt32(k * 4, offset, true));
      files.set(`${name}.types.json`, bytes);
      files.set(`${name}.offsets`, le);
      names.set(abi.types, name);
    }
    const { prefix, moduleSpecifier, exports, names: typeNames, mutableGlobals, exportAssignment } = abi;
    files.set(`${view}.view.json`, encoder.encode(JSON.stringify({ prefix, moduleSpecifier, exports, names: typeNames, mutableGlobals, exportAssignment })));
    manifest[key] = { document: names.get(abi.types), view };
  }
  files.set('catalog.json', encoder.encode(JSON.stringify(manifest)));
  return files;
}
