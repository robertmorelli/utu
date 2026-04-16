// bring-target-to-top-level.js — entry target normalization
//
// Rewrites the retained target surface in the entry file into ordinary
// top-level declarations with annotations for later codegen.

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
  const fn = doc.createElement('ir-fn');
  copySpan(fn, node);
  fn.dataset.export = 'main';

  const fnName = doc.createElement('ir-fn-name');
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
  const fn = doc.createElement('ir-fn');
  copySpan(fn, node);
  fn.dataset.role = role;
  if (node.getAttribute('label')) fn.dataset.label = node.getAttribute('label');

  const fnName = doc.createElement('ir-fn-name');
  fnName.setAttribute('kind', 'free');
  fnName.setAttribute('name', name);
  fnName.setAttribute('raw', name);
  fn.appendChild(fnName);

  const ret = doc.createElement('ir-type-void');
  fn.appendChild(ret);

  const block = doc.createElement('ir-block');
  copySpan(block, node);
  for (const child of [...node.children]) block.appendChild(child);
  fn.appendChild(block);

  node.replaceWith(fn);
}

function rewriteBenchDecl(node, doc, name) {
  const fn = doc.createElement('ir-fn');
  copySpan(fn, node);
  fn.dataset.role = 'bench';
  if (node.getAttribute('label')) fn.dataset.label = node.getAttribute('label');

  const fnName = doc.createElement('ir-fn-name');
  fnName.setAttribute('kind', 'free');
  fnName.setAttribute('name', name);
  fnName.setAttribute('raw', name);
  fn.appendChild(fnName);

  const ret = doc.createElement('ir-type-void');
  fn.appendChild(ret);

  const block = doc.createElement('ir-block');
  copySpan(block, node);

  for (const child of [...node.children]) {
    if (child.localName !== 'ir-measure') {
      block.appendChild(child);
      continue;
    }
    const measureBlock = child.firstElementChild?.cloneNode(true) ?? doc.createElement('ir-block');
    measureBlock.dataset.role = 'measure';
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

function copySpan(to, from) {
  if (from.dataset.start != null) to.dataset.start = from.dataset.start;
  if (from.dataset.end != null) to.dataset.end = from.dataset.end;
}
