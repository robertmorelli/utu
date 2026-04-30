// inline-imports.js — Pass 2
//
// inlineImports(graph, order) → Document
//
// Processes files in topological order (dependencies first). For each
// `<ir-using from="...">`, clones the named `<ir-module>` from the target
// file into the current file, then either removes the using node (if it had
// no alias or type args) or strips the `from` attribute so pass 3 sees it as
// a plain within-file using.
//
// After this pass every module referenced across files is physically present
// in the entry file. No `from` attributes remain anywhere.

import { restampSubtree } from './parse.js';

/**
 * @param {Map<string, Document>} graph
 * @param {string[]} order - topological order (deps first, entry last)
 * @param {object} [opts]
 * @param {boolean} [opts.debugAssertions]
 * @returns {Document} the entry file document with all imports inlined
 */
export function inlineImports(graph, order, { debugAssertions = false } = {}) {
  for (const filePath of order) {
    const doc  = graph.get(filePath);
    const root = doc.body.firstChild; // <ir-source-file>
    if (!root) continue;

    for (const using of [...root.querySelectorAll('ir-using[from]')]) {
      const targetPath = using.getAttribute('from');
      const moduleName = using.getAttribute('module');
      const targetDoc  = graph.get(targetPath);
      const targetRoot = targetDoc?.body.firstChild;

      if (!targetRoot) throw new Error(
        `No IR for '${targetPath}' (imported by '${filePath}')`
      );

      // Find the exported module by name in the target file.
      const srcModule = targetRoot.querySelector(`ir-module[name="${moduleName}"]`);
      if (!srcModule) throw new Error(
        `Module '${moduleName}' not found in '${targetPath}' (imported by '${filePath}')`
      );

      // Clone, re-stamp ids (cloneNode copies them — they'd collide), and
      // record which file the ranges belong to for source-location resolution.
      const clone = srcModule.cloneNode(true);
      restampSubtree(clone, targetPath);
      clone.dataset.synthetic = 'true';
      clone.dataset.rewritePass = 'inline-imports';
      clone.dataset.rewriteKind = 'imported-module';
      clone.dataset.rewriteOf = srcModule.dataset.originId ?? srcModule.id ?? '';
      clone.dataset.importedFrom = targetPath;
      clone.dataset.importedVia = using.dataset.originId ?? using.id ?? '';
      clone.dataset.importedModule = moduleName ?? '';
      clone.dataset.importKind = using.dataset.importKind ?? '';
      if (using.dataset.importFromRaw) clone.dataset.importFromRaw = using.dataset.importFromRaw;
      using.parentNode.insertBefore(clone, using);

      // If the using has an alias or type args, pass 3 needs to see it — just
      // drop the `from` so it looks like a within-file using.
      // If it was a bare `using M from "..."` (no alias, no type args) the
      // module is now in scope by name and the using node is dead.
      if (using.getAttribute('alias') || using.querySelector(':scope > ir-type-args')) using.removeAttribute('from');
      else using.remove();
    }
  }

  // Entry file is last in topological order.
  const doc = graph.get(order[order.length - 1]);
  if (debugAssertions) assertInlineImports(doc);
  return doc;
}

function assertInlineImports(doc) {
  const root = doc?.body?.firstChild;
  if (!root || root.localName !== 'ir-source-file') {
    throw new Error('pass2: missing ir-source-file root');
  }
  const danglingImport = root.querySelector('ir-using[from]');
  if (danglingImport) {
    throw new Error('pass2: found ir-using[from] after inlineImports');
  }
}
