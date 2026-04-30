// clip-file-ir-tree.js — per-file surface clipping
//
// Removes entry-only surfaces from imported files, and prunes non-selected
// surfaces from the entry file. This pass is purely local to one file IR tree.

import { DIAGNOSTIC_KINDS, compilerError, related } from './diagnostics.js';

const ENTRY_SURFACES = ['ir-export-lib', 'ir-export-main', 'ir-test', 'ir-bench'];
const ENTRY_SURFACE_SELECTOR = ENTRY_SURFACES.join(', ');

export function clipFileIRTree(doc, { target = 'analysis', isEntryFile, filePath = '', debugAssertions = false }) {
  const root = doc?.body?.firstChild;
  if (!root) return doc;

  if (isEntryFile) assertExportConflicts(root, filePath);

  if (!isEntryFile) {
    for (const node of root.querySelectorAll(ENTRY_SURFACE_SELECTOR)) node.remove();
  } else if (target !== 'analysis') {
    const keep = keepSelectorsForTarget(target);
    for (const node of root.querySelectorAll(ENTRY_SURFACES.filter(sel => !keep.has(sel)).join(', '))) node.remove();
  }

  if (debugAssertions) assertClipped(root, { target, isEntryFile, filePath });
  return doc;
}

function assertExportConflicts(root, filePath) {
  const exportLibs = root.querySelectorAll('ir-export-lib');
  const exportMains = root.querySelectorAll('ir-export-main');

  if (exportLibs.length > 1) {
    throw compilerError(
      DIAGNOSTIC_KINDS.ENTRY_SURFACE_CONFLICT,
      `entry surface (${filePath}): multiple export lib declarations`,
      exportLibs[0],
      { related: [...exportLibs].slice(1).map(n => related(n, 'conflicting export lib')) },
    );
  }
  if (exportMains.length > 1) {
    throw compilerError(
      DIAGNOSTIC_KINDS.ENTRY_SURFACE_CONFLICT,
      `entry surface (${filePath}): multiple export main declarations`,
      exportMains[0],
      { related: [...exportMains].slice(1).map(n => related(n, 'conflicting export main')) },
    );
  }
  if (exportLibs.length && exportMains.length) {
    throw compilerError(
      DIAGNOSTIC_KINDS.ENTRY_SURFACE_CONFLICT,
      `entry surface (${filePath}): export lib and export main are mutually exclusive`,
      exportLibs[0],
      { related: [related(exportMains[0], 'conflicting export main')] },
    );
  }
}

function keepSelectorsForTarget(target) {
  switch (target) {
    case 'normal': return new Set(['ir-export-lib', 'ir-export-main']);
    case 'test':   return new Set(['ir-test']);
    case 'bench':  return new Set(['ir-bench']);
    default:       return new Set();
  }
}

function assertClipped(root, { target, isEntryFile, filePath }) {
  if (!isEntryFile) {
    for (const sel of ENTRY_SURFACES) {
      if (root.querySelector(sel)) {
        throw new Error(`clip file (${filePath}): imported file still contains ${sel}`);
      }
    }
    return;
  }

  if (target === 'analysis') return;

  const keep = keepSelectorsForTarget(target);
  for (const sel of ENTRY_SURFACES.filter(sel => !keep.has(sel))) {
    if (root.querySelector(sel)) {
      throw new Error(`clip file (${filePath}): non-target surface ${sel} survived target '${target}'`);
    }
  }
}
