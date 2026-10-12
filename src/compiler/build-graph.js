// build-graph.js — Pass 1
//
// buildModuleGraph(entryPath, env) → { graph, order, imports }
//
// Recursively reads and parses every file reachable via `using ... from "..."`.
// Returns the complete file graph and a topologically sorted order
// (dependencies before dependents). Throws on import cycles.

import { parseToIR, createIRDocument } from './parse.js';
import { clipFileIRTree } from './clip-file-ir-tree.js';
import { stampOriginFile } from './ir-helpers.js';
import { DIAGNOSTIC_KINDS, compilerError } from './diagnostics.js';

/**
 * @param {string} entryPath - absolute path or URL of the entry file
 * @param {{ parser, readFile, resolvePath, stdlib?, target?, debugAssertions? }} env
 *   parser      — initialised web-tree-sitter Parser with utu language set
 *   readFile    — (path: string) => Promise<string>
 *   resolvePath — (fromFile: string, importPath: string) => string
 *                 resolves a relative import path to an absolute key
 *   stdlib      — Map<string, string | Function>  platform URI → utu source
 *                 e.g. "std:Array" → "<source>". Defaults to empty map.
 * @returns {Promise<{ graph: Map<string, Document>, order: string[], imports: Array<object> }>}
 *   graph — filePath → linkedom Document (ir-source-file at body.firstChild)
 *   order — topological order, dependencies before dependents
 *   imports — normalized source import edges with blame nodes
 */
export async function buildModuleGraph(entryPath, { parser, readFile, resolvePath, resolvePackage = null, stdlib = new Map(), createDocument = createIRDocument, target = 'analysis', debugAssertions = false, collectAnalysisTokens = target === 'analysis' }) {
  /** @type {Map<string, Document>} */
  const graph = new Map();
  /** @type {string[]} */
  const order = [];
  const imports = [];
  const lazy = new Map();
  const foreign = new Map();
  // DFS colouring: undefined = unvisited, 'active' = on stack, 'done' = finished
  /** @type {Map<string, 'active' | 'done'>} */
  const color = new Map();

  // `via` is the importing `using` node and its spelling; problems reading an
  // import are reported there. A missing entry file is the host's to report.
  async function visitSource(filePath, source, via = null) {
    const c = color.get(filePath);
    if (c === 'done')   return;
    if (c === 'active') throw compilerError(DIAGNOSTIC_KINDS.IMPORT_CYCLE, `Import cycle detected at: ${filePath}`, via?.node);

    color.set(filePath, 'active');
    // Check visitation before I/O: diamond imports read and parse a file once.
    if (source == null) {
      try {
        source = await readFile(filePath);
      } catch (error) {
        if (!via) throw error;
        const reason = error.code === 'ENOENT' ? 'file not found' : error.message;
        throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_IMPORT, `Cannot import "${via.raw}": ${reason} (${filePath})`, via.node, {
          importPath: filePath,
          importKind: 'file',
        });
      }
    }
    if (filePath.endsWith('.abi.json')) {
      let abi = null;
      try { abi = JSON.parse(source); } catch { /* reported below */ }
      if (abi?.version !== 1 || !Array.isArray(abi.types) || !abi.exports || !abi.names || !/^[A-Z][A-Za-z0-9_]*$/.test(abi.prefix)) {
        throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_IMPORT, `Invalid declaration ABI: ${filePath}`, via?.node, { importPath: filePath, importKind: 'file' });
      }
      foreign.set(filePath, abi);
      source = `mod ${abi.prefix} {}`;
    }
    const doc    = parseToIR(parser, source, filePath, createDocument, { collectAnalysisTokens });
    // Every ir-source-file needs data-file so cloned nodes can trace back to
    // their origin. This is the one place we know the canonical path.
    const fileRoot = doc.body.firstChild;
    if (fileRoot) {
      fileRoot.setAttribute('data-file', filePath);
      stampOriginFile(fileRoot, filePath);
    }
    clipFileIRTree(doc, {
      target,
      isEntryFile: filePath === entryPath,
      filePath,
      debugAssertions,
    });
    graph.set(filePath, doc);

    // Normalise every from="..." to an absolute key, then recurse.
    const root = doc.body.firstChild; // <ir-source-file>
    if (root) {
      for (const u of [...root.querySelectorAll('ir-using[from]')]) {
        const raw = u.getAttribute('from');
        // `"npm:pkg"` and `"node:mod"` link a package's declarations through the host.
        if (/^npm:/.test(raw) || /^node:/.test(raw) && !stdlib.has(raw)) {
          imports.push({ from: filePath, to: raw, node: u, raw, kind: 'package' });
          if (!foreign.has(raw)) {
            if (!resolvePackage) throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_IMPORT,
              `Package import "${raw}" needs a host package resolver`, u, { importPath: raw, importKind: 'package' });
            try {
              foreign.set(raw, await resolvePackage(raw, { prefix: u.getAttribute('module'), from: filePath }));
            } catch (error) {
              throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_IMPORT, error.message, u, { importPath: raw, importKind: 'package' });
            }
          }
          await visitSource(raw, `mod ${foreign.get(raw).prefix} {}`);
          continue;
        }
        // Platform URIs (e.g. std:Array, node:fs) are looked up in the stdlib
        // registry and kept as-is (the URI is the canonical key). Relative and
        // absolute file paths go through resolvePath as before.
        const isPlatformUri = isPlatformImportPath(raw);
        const abs = isPlatformUri ? raw : resolvePath(filePath, raw);
        u.setAttribute('from', abs);
        imports.push({ from: filePath, to: abs, node: u, raw, kind: isPlatformUri ? 'platform' : 'file' });
        if (isPlatformUri) {
          if (!stdlib.has(abs)) {
            throw compilerError(DIAGNOSTIC_KINDS.UNKNOWN_IMPORT, `Unknown platform import: ${abs}`, u, {
              importPath: abs,
              importKind: 'platform',
            });
          }
          const source = stdlib.get(abs);
          if (typeof source === 'function') {
            lazy.set(abs, source);
            await visitSource(abs, '');
          } else await visitSource(abs, source);
        } else {
          await visitSource(abs, undefined, { node: u, raw });
        }
      }
    }

    color.set(filePath, 'done');
    order.push(filePath); // post-order → topological (deps before dependents)
  }

  await visitSource(entryPath);
  for (const [filePath, generate] of lazy) {
    const generated = await generate({ documents: graph, imports });
    const source = typeof generated === "string" ? generated : generated.source;
    if (generated.abi) foreign.set(filePath, generated.abi);
    const doc = parseToIR(parser, source, filePath, createDocument, { collectAnalysisTokens });
    doc.body.firstChild.setAttribute('data-file', filePath);
    stampOriginFile(doc.body.firstChild, filePath);
    if (doc.querySelector('ir-using')) throw new Error(`Lazy platform source ${filePath} must be self-contained`);
    graph.set(filePath, doc);
  }
  if (debugAssertions) assertBuildGraph(graph, order);
  return { graph, order, imports, foreign };
}

// Historical public name retained for standalone consumers.
export const buildGraph = buildModuleGraph;

function isPlatformImportPath(path) {
  return /^[a-z][a-zA-Z0-9_]*:[A-Za-z][a-zA-Z0-9_]*$/.test(path);
}

function assertBuildGraph(graph, order) {
  if (!(graph instanceof Map)) {
    throw new Error('buildGraph: expected graph to be a Map');
  }
  if (!Array.isArray(order) || order.length === 0) {
    throw new Error('buildGraph: expected non-empty topological order');
  }
  if (graph.size !== order.length) {
    throw new Error(`buildGraph: graph/order size mismatch (${graph.size} vs ${order.length})`);
  }

  for (const filePath of order) {
    if (!graph.has(filePath)) {
      throw new Error(`buildGraph: order references missing graph entry '${filePath}'`);
    }
    const root = graph.get(filePath)?.body?.firstChild;
    if (!root || root.localName !== 'ir-source-file') {
      throw new Error(`buildGraph (${filePath}): missing ir-source-file root`);
    }
    for (const using of [...root.querySelectorAll('ir-using[from]')]) {
      const target = using.getAttribute('from');
      if (!graph.has(target)) {
        throw new Error(`buildGraph (${filePath}): unresolved import target '${target}' after graph build`);
      }
    }
  }
}
