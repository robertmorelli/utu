import { T } from './ir-tags.js';
import { nextNodeId, restampSubtree } from './parse.js';
import { collectDslArtifacts, createDslArtifactState, stampDslArtifacts } from './collect-dsl-artifacts.js';

export function expandDsls(doc, { dsls = {}, debugAssertions = false } = {}) {
  const root = doc?.body?.firstChild;
  if (!root) return doc;

  let nextId = 0;
  const artifacts = createDslArtifactState();
  for (const node of [...root.querySelectorAll(T.DSL)]) {
    const name = node.getAttribute('name');
    const plugin = name ? dsls[name] : null;
    if (!plugin) continue;
    const site = siteInfo(node, root);

    const result = plugin.expand({
      doc,
      root,
      node,
      name,
      body: node.getAttribute('body') ?? '',
      bodyStart: site.base,
      bodyInnerStart: site.innerBase,
      rebaseRange: (start, end, { inner = false } = {}) => rebase(start, end, inner ? site.innerBase : site.base),
      freshName: (prefix = '__dsl') => `${prefix}_${nextId++}`,
    });
    if (!result) continue;
    if (result.node) {
      node.replaceWith(cloneForSite(result.node, site));
      continue;
    }
    if (!result.fn) continue;
    if (result.fn.localName !== T.FN) throw new Error(`expand dsls (${name}): plugin must return ir-fn`);

    const helper = cloneForSite(result.fn, site);
    const helperName = helper.getAttribute('name') || helper.querySelector(T.FN_NAME)?.getAttribute('raw');
    if (!helperName) throw new Error(`expand dsls (${name}): helper fn is missing a name`);

    collectDslArtifacts(root, artifacts, result, node => cloneForSite(node, site));
    root.insertBefore(helper, root.firstChild);
    node.replaceWith(buildCall(doc, node, site, helperName, result.inlineArgs ?? []));
  }

  stampDslArtifacts(root, artifacts);
  if (debugAssertions) assertExpanded(root, dsls);
  return doc;
}

function buildCall(doc, node, site, helperName, inlineArgs) {
  const call = doc.createElement(T.CALL);
  const callee = doc.createElement(T.IDENT);
  const args = doc.createElement(T.ARG_LIST);
  stampSynthetic(call, node);
  stampSynthetic(callee, node);
  stampSynthetic(args, node);
  callee.setAttribute('name', helperName);
  for (const arg of inlineArgs) args.appendChild(cloneForSite(arg, site));
  call.appendChild(callee);
  call.appendChild(args);
  return call;
}

function cloneForSite(node, site) {
  const clone = node.cloneNode(true);
  restampSubtree(clone, site.originFile);
  rebaseSubtreeRanges(clone, site);
  return clone;
}

function rebaseSubtreeRanges(root, site) {
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (site.originFile) node.dataset.originFile = site.originFile;
    const start = num(node.dataset.start);
    const end = num(node.dataset.end);
    if (start == null || end == null || end > site.limit) continue;
    node.dataset.start = String(site.base + start);
    node.dataset.end = String(site.base + end);
  }
}

function stampSynthetic(node, site) {
  node.id = `n${nextNodeId()}`;
  if (site.dataset.start != null) node.dataset.start = site.dataset.start;
  if (site.dataset.end != null) node.dataset.end = site.dataset.end;
  if (site.dataset.originFile != null) node.dataset.originFile = site.dataset.originFile;
}

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rebase(start, end, base) {
  return { start: base + start, end: base + end };
}

function siteInfo(node, root) {
  return {
    base: num(node.dataset.bodyStart, num(node.dataset.start)),
    innerBase: num(node.dataset.bodyInnerStart, num(node.dataset.start)),
    limit: (node.getAttribute('body') ?? '').length,
    originFile: node.dataset.originFile ?? root.dataset.file,
  };
}

function assertExpanded(root, dsls) {
  for (const node of [...root.querySelectorAll(T.DSL)]) {
    const name = node.getAttribute('name');
    if (name && dsls[name]) throw new Error(`expand dsls: registered DSL '${name}' survived expansion`);
  }
}
