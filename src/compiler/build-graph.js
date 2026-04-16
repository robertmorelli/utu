// build-graph.js — Pass 1
//
// buildGraph(entryPath, env) → { graph, order }
//
// Recursively reads and parses every file reachable via `using ... from "..."`.
// Returns the complete file graph and a topologically sorted order
// (dependencies before dependents). Throws on import cycles.

import { treeToIR, createIRDocument } from './parse.js';
import { clipFileIRTree } from './clip-file-ir-tree.js';

/**
 * @param {string} entryPath - absolute path or URL of the entry file
 * @param {{ parser, readFile, resolvePath, stdlib?, target?, debugAssertions? }} env
 *   parser      — initialised web-tree-sitter Parser with utu language set
 *   readFile    — (path: string) => Promise<string>
 *   resolvePath — (fromFile: string, importPath: string) => string
 *                 resolves a relative import path to an absolute key
 *   stdlib      — Map<string, string>  platform URI → utu source
 *                 e.g. "std:array" → "<source>". Defaults to empty map.
 * @returns {Promise<{ graph: Map<string, Document>, order: string[] }>}
 *   graph — filePath → linkedom Document (ir-source-file at body.firstChild)
 *   order — topological order, dependencies before dependents
 */
export async function buildGraph(entryPath, { parser, readFile, resolvePath, stdlib = new Map(), createDocument = createIRDocument, target = 'analysis', debugAssertions = false }) {
  /** @type {Map<string, Document>} */
  const graph = new Map();
  /** @type {string[]} */
  const order = [];
  // DFS colouring: undefined = unvisited, 'active' = on stack, 'done' = finished
  /** @type {Map<string, 'active' | 'done'>} */
  const color = new Map();

  async function visit(filePath) {
    return visitSource(filePath, await readFile(filePath));
  }

  async function visitSource(filePath, source) {
    const c = color.get(filePath);
    if (c === 'done')   return;
    if (c === 'active') throw new Error(`Import cycle detected at: ${filePath}`);

    color.set(filePath, 'active');

    const tree   = parser.parse(source);
    const doc    = treeToIR(tree, source, createDocument);
    // Every ir-source-file needs data-file so cloned nodes can trace back to
    // their origin. This is the one place we know the canonical path.
    const fileRoot = doc.body.firstChild;
    if (fileRoot) fileRoot.dataset.file = filePath;
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
        // Platform URIs (e.g. std:array, node:fs) are looked up in the stdlib
        // registry and kept as-is (the URI is the canonical key). Relative and
        // absolute file paths go through resolvePath as before.
        const isPlatformUri = isPlatformImportPath(raw);
        const abs = isPlatformUri ? raw : resolvePath(filePath, raw);
        u.setAttribute('from', abs);
        if (isPlatformUri) {
          if (!stdlib.has(abs)) throw new Error(`Unknown platform import: ${abs}`);
          await visitSource(abs, stdlib.get(abs));
        } else {
          await visit(abs);
        }
      }
    }

    color.set(filePath, 'done');
    order.push(filePath); // post-order → topological (deps before dependents)
  }

  await visit(entryPath);
  if (debugAssertions) assertBuildGraph(graph, order);
  return { graph, order };
}

function isPlatformImportPath(path) {
  return /^[a-z][a-zA-Z0-9_]*:[a-z][a-zA-Z0-9_]*$/.test(path);
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
