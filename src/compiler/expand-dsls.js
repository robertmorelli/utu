import { T } from './ir-tags.js';
import { nextNodeId, restampSubtree } from './parse.js';
import { collectDslArtifacts, createDslArtifactState, stampDslArtifacts } from './collect-dsl-artifacts.js';
import { createSyntheticNode, replaceNodeMeta } from './ir-helpers.js';

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
    collectDslArtifacts(root, artifacts, result, node => cloneForSite(node, site));
    if (result.replace) {
      const target = result.replace.target ?? node;
      const replacement = replaceRoot(cloneForSite(result.replace.node, site), target, result.replace.kind ?? 'dsl-replacement');
      target.replaceWith(replacement);
      continue;
    }
    if (result.node) {
      node.replaceWith(replaceRoot(cloneForSite(result.node, site), node, 'direct-node'));
      continue;
    }
    if (!result.fn) continue;
    if (result.fn.localName !== T.FN) throw new Error(`expand dsls (${name}): plugin must return ir-fn`);

    const helper = cloneForSite(result.fn, site);
    helper.dataset.synthetic = 'true';
    helper.dataset.rewritePass = 'expand-dsls';
    helper.dataset.rewriteKind = 'dsl-helper';
    helper.dataset.rewriteOf = node.dataset.originId ?? node.id ?? '';
    helper.dataset.dslName = name;
    const helperName = helper.getAttribute('name') || helper.querySelector(T.FN_NAME)?.getAttribute('raw');
    if (!helperName) throw new Error(`expand dsls (${name}): helper fn is missing a name`);

    root.insertBefore(helper, root.firstChild);
    node.replaceWith(buildCall(doc, node, site, helperName, result.inlineArgs ?? []));
  }

  stampDslArtifacts(root, artifacts);
  if (debugAssertions) assertExpanded(root, dsls);
  return doc;
}

function buildCall(doc, node, site, helperName, inlineArgs) {
  const call = replaceNodeMeta(doc.createElement(T.CALL), node, 'expand-dsls', 'dsl-call');
  const callee = createSyntheticNode(doc, T.IDENT, node, 'expand-dsls', 'dsl-callee');
  const args = createSyntheticNode(doc, T.ARG_LIST, node, 'expand-dsls', 'dsl-args');
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
    if (site.originFile) {
      node.dataset.originFile = site.originFile;
      node.dataset.sourceFile = site.originFile;
    }
    node.dataset.row ??= site.row;
    node.dataset.col ??= site.col;
    node.dataset.endRow ??= site.endRow;
    node.dataset.endCol ??= site.endCol;
    const start = num(node.dataset.start);
    const end = num(node.dataset.end);
    if (start == null || end == null || end > site.limit) continue;
    node.dataset.start = String(site.base + start);
    node.dataset.end = String(site.base + end);
  }
}

function replaceRoot(node, site, kind) {
  node.id = site.id ?? `n${nextNodeId()}`;
  node.dataset.row ??= site.dataset.row;
  node.dataset.col ??= site.dataset.col;
  node.dataset.endRow ??= site.dataset.endRow;
  node.dataset.endCol ??= site.dataset.endCol;
  node.dataset.sourceFile ??= site.dataset.sourceFile ?? site.dataset.originFile;
  node.dataset.synthetic = 'true';
  node.dataset.rewritePass = 'expand-dsls';
  node.dataset.rewriteKind = kind;
  node.dataset.rewriteOf = site.dataset.originId ?? site.id ?? '';
  return node;
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
    row: node.dataset.row,
    col: node.dataset.col,
    endRow: node.dataset.endRow,
    endCol: node.dataset.endCol,
  };
}

function assertExpanded(root, dsls) {
  for (const node of [...root.querySelectorAll(T.DSL)]) {
    const name = node.getAttribute('name');
    if (name && dsls[name] && !dsls[name].allowResidual) throw new Error(`expand dsls: registered DSL '${name}' survived expansion`);
  }
}
