import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createPackageResolver } from '../../src/bindings/packages.js';
import { LINK_REVISION } from '../../src/bindings/link.js';

const stat = file => { try { return fs.statSync(file); } catch { return null; } };
const require = createRequire(import.meta.url);
const fresh = files => files.every(entry => { const s = stat(entry.path); return s && s.mtimeMs === entry.mtimeMs && s.size === entry.size; });

/**
 * `resolvePackage` for Node/Bun hosts: links `npm:` and `node:` imports from
 * `node_modules` and caches each declaration graph in `node_modules/.utu/abi`.
 * TypeScript loads only when a graph is not cached.
 *
 * With `ready`, it gives the declarations as the self-hosted compiler reads
 * them ({ document, view }, as the platform catalog does), cached beside the
 * graph in `ready/` as bytes, so a cached package is read, not parsed.
 */
export function nodePackageResolver({ root = process.cwd(), cacheDir = path.join(root, 'node_modules/.utu/abi'), ready = false } = {}) {
  let resolve;
  const linked = (specifier, request) => {
    if (!resolve) {
      const ts = require('typescript');
      resolve = createPackageResolver({ ts, root: path.resolve(root), fs: {
        readFile: file => { try { return fs.readFileSync(file, 'utf8'); } catch { return undefined; } },
        fileExists: file => !!stat(file)?.isFile(),
        directoryExists: dir => !!stat(dir)?.isDirectory(),
        realpath: file => fs.realpathSync.native(file),
      } });
    }
    return resolve(specifier, request);
  };
  // TypeScript's version without loading it: its package's.
  let version;
  // In memory too, so a process that builds again (an editor, a watcher, a
  // test run) reads and parses nothing while the declarations are unchanged,
  // and gets the same graph, which compilers cache by identity.
  const memory = new Map();
  const graph = async (key, specifier, prefix) => {
    const file = path.join(cacheDir, `${key}.json`);
    try {
      const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (fresh(cached.files)) return cached;
    } catch {}
    const { abi, files } = linked(specifier, { prefix });
    fs.mkdirSync(cacheDir, { recursive: true });
    const record = files.map(entry => ({ path: entry, mtimeMs: stat(entry)?.mtimeMs, size: stat(entry)?.size }));
    fs.writeFileSync(file, JSON.stringify({ specifier, typescript: version, files: record, abi }));
    return { files: record, abi };
  };
  return async (specifier, { prefix }) => {
    version ??= require('typescript/package.json').version;
    const key = crypto.createHash('sha256').update(`${LINK_REVISION}\0${version}\0${specifier}\0${prefix}`).digest('hex').slice(0, 24);
    const known = memory.get(key);
    if (known && fresh(known.files)) return known.abi;
    const entry = ready ? await readyEntry(cacheDir, key, () => graph(key, specifier, prefix)) : await graph(key, specifier, prefix);
    memory.set(key, entry);
    return entry.abi;
  };
}

// A package's declarations ready to read ({ files, abi: { document, view } }):
// from `ready/KEY.*` while its files are as recorded, else made from the graph
// and written there.
async function readyEntry(cacheDir, key, graph) {
  const base = path.join(cacheDir, 'ready', key);
  try {
    const { files } = JSON.parse(fs.readFileSync(`${base}.files.json`, 'utf8'));
    if (fresh(files)) {
      const offsets = fs.readFileSync(`${base}.offsets`);
      return { files, abi: {
        document: { bytes: fs.readFileSync(`${base}.types.json`), offsets: new Int32Array(offsets.buffer.slice(offsets.byteOffset, offsets.byteOffset + offsets.byteLength)) },
        view: fs.readFileSync(`${base}.view.json`),
      } };
    }
  } catch {}
  const { files, abi } = await graph();
  const { typesDocument } = await import('../../src/selfhost/compiler.js');
  const document = typesDocument(abi.types);
  const { prefix, moduleSpecifier, exports, names, mutableGlobals } = abi;
  const view = new TextEncoder().encode(JSON.stringify({ prefix, moduleSpecifier, exports, names, mutableGlobals }));
  try {
    fs.mkdirSync(path.dirname(base), { recursive: true });
    const write = (name, bytes) => {
      const partial = `${base}${name}.${process.pid}.tmp`;
      fs.writeFileSync(partial, bytes);
      fs.renameSync(partial, `${base}${name}`);
    };
    write('.types.json', document.bytes);
    write('.offsets', new Uint8Array(document.offsets.buffer, document.offsets.byteOffset, document.offsets.byteLength));
    write('.view.json', view);
    // Last: the record says the rest is there.
    write('.files.json', JSON.stringify({ files }));
  } catch {}
  return { files, abi: { document, view } };
}
