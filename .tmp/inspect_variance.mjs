import { Parser, Language } from 'web-tree-sitter';
import { treeToIR } from '../src/compiler/parse.js';
import path from 'node:path';

await Parser.init({ locateFile: (name) => path.resolve('/Users/robertmorelli/Documents/personal-repos/utu', name) });
const parser = new Parser();
parser.setLanguage(await Language.load(path.resolve('/Users/robertmorelli/Documents/personal-repos/utu', 'tree-sitter-utu.wasm')));
const src = `mod Pair[out P1, in P2] {
    fn nope(a: P1) P2 {
        fatal;
    }
}
`;
const doc = treeToIR(parser.parse(src), src);
const root = doc.body.firstChild;
const mod = root.querySelector('ir-module');
console.log('params', [...mod.querySelectorAll('ir-module-param')].map(n => ({
  name: n.getAttribute('name'),
  variance: n.getAttribute('variance'),
  raw: n.getAttribute('raw'),
})));
const fn = mod.querySelector('ir-fn');
console.log('fn children', [...fn.children].map(n => ({
  name: n.localName,
  attrs: Object.fromEntries([...n.getAttributeNames()].map(k => [k, n.getAttribute(k)])),
})));
console.log('param types', [...mod.querySelectorAll('ir-param')].map(p => [...p.children].map(c => ({
  name: c.localName,
  attrs: Object.fromEntries([...c.getAttributeNames()].map(k => [k, c.getAttribute(k)])),
}))));
