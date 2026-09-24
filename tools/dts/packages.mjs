import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createPackageResolver } from '../../src/bindings/packages.js';
import { LINK_REVISION } from '../../src/bindings/link.js';

const stat = file => { try { return fs.statSync(file); } catch { return null; } };

/**
 * `resolvePackage` for Node/Bun hosts: links `npm:` and `node:` imports from
 * `node_modules` and caches each declaration graph in `node_modules/.utu/abi`.
 */
export function nodePackageResolver({ root = process.cwd(), cacheDir = path.join(root, 'node_modules/.utu/abi') } = {}) {
  const resolve = createPackageResolver({ ts, root: path.resolve(root), fs: {
    readFile: file => { try { return fs.readFileSync(file, 'utf8'); } catch { return undefined; } },
    fileExists: file => !!stat(file)?.isFile(),
    directoryExists: dir => !!stat(dir)?.isDirectory(),
    realpath: file => fs.realpathSync.native(file),
  } });
  return async (specifier, { prefix }) => {
    const key = crypto.createHash('sha256').update(`${LINK_REVISION}\0${ts.version}\0${specifier}\0${prefix}`).digest('hex').slice(0, 24);
    const file = path.join(cacheDir, `${key}.json`);
    try {
      const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (cached.files.every(entry => { const s = stat(entry.path); return s && s.mtimeMs === entry.mtimeMs && s.size === entry.size; })) return cached.abi;
    } catch {}
    const { abi, files } = resolve(specifier, { prefix });
    fs.mkdirSync(cacheDir, { recursive: true });
    const record = files.map(entry => ({ path: entry, mtimeMs: stat(entry)?.mtimeMs, size: stat(entry)?.size }));
    fs.writeFileSync(file, JSON.stringify({ specifier, typescript: ts.version, files: record, abi }));
    return abi;
  };
}
