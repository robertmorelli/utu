import { parseHTML } from 'linkedom';
import { treeToIR } from './parse.js';

export function createStandardDsls({ parser, createDocument }) {
  return {
    // @es and @wat are first-class but not yet implemented.
    // Return null so expand-dsls skips the node rather than throwing.
    es:  { expand() { return null; } },
    wat: { expand() { return null; } },
    utu: {
      expand({ body }) {
        const inner = stripDslDelims(body);
        const prefix = 'fn __dsl() void { ';
        const src = `${prefix}${inner}; }`;
        const doc = treeToIR(parser.parse(src), src, createDocument);
        const expr = doc.body.firstChild?.querySelector('ir-fn > ir-block')?.firstElementChild;
        if (!expr) throw new Error('standard dsls (utu): could not parse DSL body as expression');
        localizeRanges(expr, prefix.length);
        return { node: expr };
      },
    },
    ir: {
      expand({ body }) {
        const inner = stripDslDelims(body).trim();
        const { document } = parseHTML(`<!doctype html><html><body>${inner}</body></html>`);
        const node = document.body.firstElementChild;
        if (!node) throw new Error('standard dsls (ir): expected one IR node');
        return { node };
      },
    },
  };
}

function stripDslDelims(body) {
  return body.startsWith('\\|') && body.endsWith('|/') ? body.slice(2, -2) : body;
}

function localizeRanges(root, offset) {
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (node.dataset.start != null) node.dataset.start = String(Number(node.dataset.start) - offset);
    if (node.dataset.end != null) node.dataset.end = String(Number(node.dataset.end) - offset);
  }
}
