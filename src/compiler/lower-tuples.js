// Tuples: `.{a, b}` is several values at once, as a function's result
// (`fn f() .{I32, F64}`), and `let .{x, y} = f();` takes one apart.
//
//   let .{x, y} = value;   →   let __tuple_N = value;
//                              let x = <ir-tuple-get index="0">__tuple_N</…>;
//                              let y = <ir-tuple-get index="1">__tuple_N</…>;
//
// A tuple lives in a local or a wasm multi-value result; codegen emits
// tuple.make and tuple.extract. Tuples cannot be stored in struct fields or
// arrays (validateAnalysis reports that), so they never reach the heap.
import { createSyntheticNode } from './ir-helpers.js';

export function lowerTuples(doc) {
  const root = doc.body.firstChild;
  if (!root) return;
  let serial = 0;
  for (const destructure of [...root.querySelectorAll('ir-let[names]')]) {
    const temp = `__tuple_${serial++}`;
    const holder = createSyntheticNode(doc, 'ir-let', destructure, 'lower-tuples', 'tuple-value');
    holder.setAttribute('name', temp);
    for (const child of [...destructure.children]) holder.appendChild(child);
    const names = destructure.getAttribute('names').split(',');
    const lets = names.map((name, index) => {
      const element = createSyntheticNode(doc, 'ir-let', destructure, 'lower-tuples', 'tuple-element');
      element.setAttribute('name', name);
      const get = createSyntheticNode(doc, 'ir-tuple-get', destructure, 'lower-tuples', 'tuple-get');
      get.setAttribute('index', String(index));
      get.setAttribute('count', String(names.length));
      const ident = createSyntheticNode(doc, 'ir-ident', destructure, 'lower-tuples', 'tuple-temp');
      ident.setAttribute('name', temp);
      get.appendChild(ident);
      element.appendChild(get);
      return element;
    });
    destructure.replaceWith(holder, ...lets);
  }
}
