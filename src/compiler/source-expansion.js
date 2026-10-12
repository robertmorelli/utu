// Parse compiler-generated Utu through the same frontend as user code. Splices
// retain their original source ranges; generated scaffolding points at its site.
import { parseToIR, restampSubtree } from './parse.js';
const PREFIX = 'fn __expansion() void { ';

export function expressionFromSource(parser, source, site, splices = new Map(), { sourceStart = null, createDocument } = {}) {
  const parsed = parseToIR(parser, `${PREFIX}${source}; }`, createDocument);
  if (parsed.querySelector('[data-parse-errors]')) {
    throw new Error(sourceStart == null ? 'Invalid expression in syntax expansion'
      : `Invalid Utu interpolation at offset ${sourceStart}: ${source.slice(0, 100)}`);
  }
  const expr = parsed.querySelector('ir-fn > ir-block').firstElementChild;
  if (!expr) throw new Error('Expected a Utu expression');
  const original = site.ownerDocument.__utuSourceText ?? '';
  const lines = [0];
  if (sourceStart != null) for (let i = 0; i < original.length; i++) if (original[i] === '\n') lines.push(i + 1);
  function location(offset) {
    let low = 0, high = lines.length;
    while (low + 1 < high) { const mid = (low + high) >> 1; if (lines[mid] <= offset) low = mid; else high = mid; }
    return [low + 1, offset - lines[low] + 1];
  }
  for (const node of [expr, ...expr.querySelectorAll('*')]) {
    for (const key of ['originFile', 'sourceFile']) if (site.dataset[key] != null) node.dataset[key] = site.dataset[key];
    if (sourceStart != null) {
      // Utu islands retain exact token spans, including definition/member spans.
      for (const attr of [...node.attributes]) if (/^data-(?:.*-)?(?:start|end)$/.test(attr.name)) {
        node.setAttribute(attr.name, String(Number(attr.value) - PREFIX.length + sourceStart));
      }
      [node.dataset.row, node.dataset.col] = location(Number(node.dataset.start));
      [node.dataset.endRow, node.dataset.endCol] = location(Number(node.dataset.end));
      delete node.dataset.originId;
    } else {
      for (const key of ['start', 'end', 'row', 'col', 'endRow', 'endCol']) if (site.dataset[key] != null) node.dataset[key] = site.dataset[key];
      // Template token offsets have no corresponding spelling in the source.
      for (const attr of [...node.attributes]) if (/^data-.+-(start|end)$/.test(attr.name)) node.removeAttribute(attr.name);
      node.dataset.originId = site.dataset.originId ?? site.id;
      node.dataset.rewriteOf = site.dataset.originId ?? site.id;
      node.dataset.synthetic = 'true';
      node.dataset.rewritePass = 'syntax-expansion';
    }
  }
  for (const ident of [...expr.querySelectorAll('ir-ident')]) {
    const value = splices.get(ident.getAttribute('name'));
    if (value) ident.replaceWith(value.cloneNode(true));
  }
  const result = site.ownerDocument.importNode(expr, true);
  restampSubtree(result, site.dataset.originFile, site.ownerDocument);
  if (sourceStart != null) for (const node of [result, ...result.querySelectorAll('*')]) node.dataset.originId = node.id;
  return result;
}

/**
 * Parse compiler-generated top-level declarations (structs, functions,
 * globals). Every node points at `site`, the source construct that needed them.
 */
export function declarationsFromSource(parser, source, site, { createDocument } = {}) {
  const parsed = parseToIR(parser, source, createDocument);
  const broken = parsed.querySelector('[data-parse-errors]');
  if (broken) throw new Error(`Invalid declarations in syntax expansion near: ${(broken.textContent || source).slice(0, 120)}`);
  const root = parsed.body.firstChild;
  return [...root.children].map(declaration => {
    for (const node of [declaration, ...declaration.querySelectorAll('*')]) {
      for (const key of ['start', 'end', 'row', 'col', 'endRow', 'endCol', 'originFile', 'sourceFile']) {
        if (site.dataset[key] != null) node.dataset[key] = site.dataset[key];
      }
      for (const attr of [...node.attributes]) if (/^data-.+-(start|end)$/.test(attr.name)) node.removeAttribute(attr.name);
      node.dataset.originId = site.dataset.originId ?? site.id;
      node.dataset.rewriteOf = site.dataset.originId ?? site.id;
      node.dataset.synthetic = 'true';
      node.dataset.rewritePass = 'syntax-expansion';
    }
    const result = site.ownerDocument.importNode(declaration, true);
    restampSubtree(result, site.dataset.originFile, site.ownerDocument);
    return result;
  });
}
