// bring-target-to-top-level.js — entry target normalization
//
// Rewrites the retained target surface in the entry file into ordinary
// top-level declarations with annotations for later codegen.

import { createSyntheticNode, replaceNodeMeta } from './ir-helpers.js';
import { restampSubtree } from './parse.js';

export function bringTargetToTopLevel(doc, { target = 'analysis', filePath = '', debugAssertions = false } = {}) {
  if (target === 'analysis') return doc;

  const root = doc?.body?.firstChild;
  if (!root) return doc;

  if (target === 'normal') {
    for (const node of [...root.querySelectorAll('ir-export-main')]) rewriteExportMain(node, doc);
    for (const node of [...root.querySelectorAll('ir-export-lib')]) rewriteExportLib(node);
  } else {
    let i = 0;
    const selector = target === 'test' ? 'ir-test' : 'ir-bench';
    for (const node of [...root.querySelectorAll(selector)]) {
      target === 'test'
        ? rewriteBlockDecl(node, doc, `__test_${i++}`, 'test')
        : rewriteBenchDecl(node, doc, `__bench_${i++}`);
    }
  }

  if (debugAssertions) assertBroughtToTopLevel(root, { target, filePath });
  return doc;
}

function rewriteExportMain(node, doc) {
  const fn = replaceNodeMeta(doc.createElement('ir-fn'), node, 'bring-target', 'export-main');
  fn.dataset.export = 'main';

  const fnName = createSyntheticNode(doc, 'ir-fn-name', node, 'bring-target', 'export-main-name');
  fnName.setAttribute('kind', 'free');
  fnName.setAttribute('name', 'main');
  fnName.setAttribute('raw', 'main');
  fn.appendChild(fnName);

  for (const child of [...node.children]) fn.appendChild(child);
  node.replaceWith(fn);
}

function rewriteExportLib(node) {
  for (const child of [...node.children]) {
    if (child.localName !== 'ir-fn') {
      throw new Error(`bring target: export lib only supports functions, found ${child.localName}`);
    }
    child.dataset.export = 'wasm';
    node.parentNode.insertBefore(child, node);
  }
  node.remove();
}

function rewriteBlockDecl(node, doc, name, role) {
  const fn = replaceNodeMeta(doc.createElement('ir-fn'), node, 'bring-target', role);
  fn.dataset.role = role;
  if (node.getAttribute('label')) fn.dataset.label = node.getAttribute('label');

  const fnName = createSyntheticNode(doc, 'ir-fn-name', node, 'bring-target', `${role}-name`);
  fnName.setAttribute('kind', 'free');
  fnName.setAttribute('name', name);
  fnName.setAttribute('raw', name);
  fn.appendChild(fnName);

  const ret = createSyntheticNode(doc, 'ir-type-void', node, 'bring-target', `${role}-return`);
  fn.appendChild(ret);

  const block = createSyntheticNode(doc, 'ir-block', node, 'bring-target', `${role}-block`);
  for (const child of [...node.children]) block.appendChild(child);
  fn.appendChild(block);

  node.replaceWith(fn);
}

function rewriteBenchDecl(node, doc, name) {
  const fn = replaceNodeMeta(doc.createElement('ir-fn'), node, 'bring-target', 'bench');
  fn.dataset.role = 'bench';
  if (node.getAttribute('label')) fn.dataset.label = node.getAttribute('label');

  const fnName = createSyntheticNode(doc, 'ir-fn-name', node, 'bring-target', 'bench-name');
  fnName.setAttribute('kind', 'free');
  fnName.setAttribute('name', name);
  fnName.setAttribute('raw', name);
  fn.appendChild(fnName);

  const ret = createSyntheticNode(doc, 'ir-type-void', node, 'bring-target', 'bench-return');
  fn.appendChild(ret);

  const block = createSyntheticNode(doc, 'ir-block', node, 'bring-target', 'bench-block');

  for (const child of [...node.children]) {
    if (child.localName !== 'ir-measure') {
      block.appendChild(child);
      continue;
    }
    const measureBlock = child.firstElementChild?.cloneNode(true) ?? createSyntheticNode(doc, 'ir-block', child, 'bring-target', 'bench-measure');
    if (child.firstElementChild) restampSubtree(measureBlock, child.dataset.originFile);
    measureBlock.dataset.role = 'measure';
    measureBlock.dataset.synthetic ??= 'true';
    measureBlock.dataset.rewritePass ??= 'bring-target';
    measureBlock.dataset.rewriteKind ??= 'bench-measure';
    measureBlock.dataset.rewriteOf ??= child.dataset.originId ?? child.id ?? '';
    block.appendChild(measureBlock);
  }

  fn.appendChild(block);
  node.replaceWith(fn);
}

function assertBroughtToTopLevel(root, { target, filePath }) {
  for (const sel of ['ir-export-lib', 'ir-export-main', 'ir-test', 'ir-bench']) {
    if (root.querySelector(sel)) {
      throw new Error(`bring target (${filePath}): found ${sel} after target '${target}' normalization`);
    }
  }
  if (target === 'bench' && root.querySelector('ir-measure')) {
    throw new Error(`bring target (${filePath}): found ir-measure after bench normalization`);
  }
}
