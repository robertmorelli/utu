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
import { hoistModule } from './hoist-modules.js';
import { lowerPipesIn } from './lower-pipe.js';

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

      // Imported modules close over their file's own module imports. Carry the
      // already-inlined support modules and within-file usings with the public
      // module; cloning only srcModule leaves aliases inside it unbound.
      for (const support of [...targetRoot.children]) {
        if (support === srcModule || !['ir-module', 'ir-using'].includes(support.localName)) continue;
        if (support.localName === 'ir-module'
          && root.querySelector(`:scope > ir-module[name="${support.getAttribute('name')}"]`)) continue;
        if (support.localName === 'ir-using' && hasEquivalentUsing(root, support)) continue;
        using.parentNode.insertBefore(cloneImportedNode(doc, support, targetPath, 'import-support'), using);
      }

      // Clone, re-stamp ids (cloneNode copies them — they'd collide), and
      // record which file the ranges belong to for source-location resolution.
      const clone = cloneImportedNode(doc, srcModule, targetPath, 'imported-module');
      using.parentNode.insertBefore(clone, using);

      // Aliased/generic imports remain templates for elaboration. Bare imports
      // materialize directly into the flat declaration namespace.
      if (using.getAttribute('alias') || using.querySelector(':scope > ir-type-args')) {
        using.removeAttribute('from');
      } else {
        if (filePath === order.at(-1) && !clone.querySelector(':scope > ir-module-params')) {
          lowerPipesIn(clone);
          hoistModule(clone, root);
        }
        using.remove();
      }
    }
  }

  // Entry file is last in topological order.
  const doc = graph.get(order[order.length - 1]);
  if (debugAssertions) assertInlineImports(doc);
  return doc;
}

function cloneImportedNode(doc, source, targetPath, kind) {
  const clone = doc.importNode?.(source, true) ?? source.cloneNode(true);
  restampSubtree(clone, targetPath, doc);
  clone.dataset.synthetic = 'true';
  clone.dataset.rewritePass = 'inline-imports';
  clone.dataset.rewriteKind = kind;
  clone.dataset.rewriteOf = source.dataset.originId ?? source.id ?? '';
  clone.dataset.importedFrom = targetPath;
  return clone;
}

function hasEquivalentUsing(root, candidate) {
  const module = candidate.getAttribute('module');
  const alias = candidate.getAttribute('alias');
  return [...root.querySelectorAll(':scope > ir-using:not([from])')].some(using =>
    using.getAttribute('module') === module
    && using.getAttribute('alias') === alias
    && (using.querySelector(':scope > ir-type-args')?.textContent ?? '')
      === (candidate.querySelector(':scope > ir-type-args')?.textContent ?? ''));
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
