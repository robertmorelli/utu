// bring-target-to-top-level.js — entry target normalization
//
// Rewrites the retained target surface in the entry file into ordinary
// top-level declarations with annotations for later codegen.

import { createSyntheticNode, replaceNodeMeta, setDataIfAbsent } from './ir-helpers.js';
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
  fn.setAttribute('name', 'main');
  fn.setAttribute('data-export', 'main');

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
    // A recovered parse error moves out unchanged so the parse-error check
    // after inlining still sees it and reports the syntax diagnostic.
    if (isRecoveredSyntax(child)) {
      node.parentNode.insertBefore(child, node);
      continue;
    }
    if (child.localName !== 'ir-fn') {
      throw new Error(`bring target: export lib only supports functions, found ${child.localName}`);
    }
    child.setAttribute('data-export', 'wasm');
    node.parentNode.insertBefore(child, node);
  }
  node.remove();
}

function isRecoveredSyntax(node) {
  return node.localName === 'ir-unknown'
    || node.attr('data-error') === 'parse-error'
    || node.attr('data-error-kind') === 'parse-error'
    || node.querySelector('[data-error="parse-error"], [data-error-kind="parse-error"]') != null;
}

function rewriteBlockDecl(node, doc, name, role) {
  const fn = replaceNodeMeta(doc.createElement('ir-fn'), node, 'bring-target', role);
  fn.setAttribute('name', name);
  fn.setAttribute('data-role', role);
  // The whole point of the test/bench targets is that the host can run these,
  // so they have to reach the wasm exports.  The description stays on the node
  // for a runner to report against.
  fn.setAttribute('data-export', role);
  if (node.querySelector(':scope > ir-lit[kind="string"]')) {
    fn.setAttribute('data-description', node.querySelector(':scope > ir-lit[kind="string"]').getAttribute('value') ?? '');
  }
  if (node.getAttribute('label')) fn.setAttribute('data-label', node.getAttribute('label'));

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
  fn.setAttribute('data-role', 'bench');
  if (node.getAttribute('label')) fn.setAttribute('data-label', node.getAttribute('label'));

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
    if (child.firstElementChild) restampSubtree(measureBlock, child.attr('data-origin-file'));
    measureBlock.setAttribute('data-role', 'measure');
    setDataIfAbsent(measureBlock, 'data-synthetic', 'true');
    setDataIfAbsent(measureBlock, 'data-rewrite-pass', 'bring-target');
    setDataIfAbsent(measureBlock, 'data-rewrite-kind', 'bench-measure');
    setDataIfAbsent(measureBlock, 'data-rewrite-of', child.attr('data-origin-id') ?? child.id ?? '');
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
