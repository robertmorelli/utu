// Parse compiler-generated Utu through the same frontend as user code. Splices
// retain their original source ranges; generated scaffolding points at its site.
import { parseToIR, restampSubtree } from './parse.js';

const SPAN_NAMES = ['data-start', 'data-end', 'data-row', 'data-col', 'data-end-row', 'data-end-col'];
const PREFIX = 'fn __expansion() void { ';

export function expressionFromSource(parser, source, site, splices = new Map(), { sourceStart = null, createDocument } = {}) {
  const parsed = parseToIR(parser, `${PREFIX}${source}; }`, createDocument);
  if (parsed.hasAttributeBelowRoot('data-parse-errors')) {
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
    for (const name of ['data-origin-file', 'data-source-file']) if (site.attr(name) != null) node.setAttribute(name, site.attr(name));
    if (sourceStart != null) {
      // Utu islands retain exact token spans, including definition/member spans.
      for (const attr of [...node.attributes]) if (/^data-(?:.*-)?(?:start|end)$/.test(attr.name)) {
        node.setAttribute(attr.name, String(Number(attr.value) - PREFIX.length + sourceStart));
      }
      const [row, col] = location(Number(node.attr('data-start')));
      const [endRow, endCol] = location(Number(node.attr('data-end')));
      node.setAttribute('data-row', row);
      node.setAttribute('data-col', col);
      node.setAttribute('data-end-row', endRow);
      node.setAttribute('data-end-col', endCol);
      node.removeAttribute('data-origin-id');
    } else {
      for (const name of SPAN_NAMES) if (site.attr(name) != null) node.setAttribute(name, site.attr(name));
      // Template token offsets have no corresponding spelling in the source.
      for (const attr of [...node.attributes]) if (/^data-.+-(start|end)$/.test(attr.name)) node.removeAttribute(attr.name);
      node.setAttribute('data-origin-id', site.attr('data-origin-id') ?? site.id);
      node.setAttribute('data-rewrite-of', site.attr('data-origin-id') ?? site.id);
      node.setAttribute('data-synthetic', 'true');
      node.setAttribute('data-rewrite-pass', 'syntax-expansion');
    }
  }
  for (const ident of [...expr.querySelectorAll('ir-ident')]) {
    const value = splices.get(ident.getAttribute('name'));
    if (value) ident.replaceWith(value.cloneNode(true));
  }
  const result = site.ownerDocument.importNode(expr, true);
  restampSubtree(result, site.attr('data-origin-file'), site.ownerDocument);
  if (sourceStart != null) for (const node of [result, ...result.querySelectorAll('*')]) node.setAttribute('data-origin-id', node.id);
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
      for (const name of [...SPAN_NAMES, 'data-origin-file', 'data-source-file']) {
        if (site.attr(name) != null) node.setAttribute(name, site.attr(name));
      }
      for (const attr of [...node.attributes]) if (/^data-.+-(start|end)$/.test(attr.name)) node.removeAttribute(attr.name);
      node.setAttribute('data-origin-id', site.attr('data-origin-id') ?? site.id);
      node.setAttribute('data-rewrite-of', site.attr('data-origin-id') ?? site.id);
      node.setAttribute('data-synthetic', 'true');
      node.setAttribute('data-rewrite-pass', 'syntax-expansion');
    }
    const result = site.ownerDocument.importNode(declaration, true);
    restampSubtree(result, site.attr('data-origin-file'), site.ownerDocument);
    return result;
  });
}
