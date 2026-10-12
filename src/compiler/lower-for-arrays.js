// `for (xs) |x| { ... }` iterates an array's elements. It is syntax over the
// existing counted loop, lowered before name resolution:
//
//   for (xs, 0..<n) |x, i| { body }
//     ⇒ { let src = xs; for (0..<src.len(), 0..<n) |k, i| { let x = src[k]; body } }
//
// The array is evaluated once, before the loop. Zipped sources stop at the
// shortest, as counted sources already do; break and continue keep working.
import { expressionFromSource } from './source-expansion.js';
import { compilerError, DIAGNOSTIC_KINDS } from './diagnostics.js';

const isArraySource = source => source.children.length === 1 && !source.getAttribute('op');

export function lowerForArrays(doc, parser, createDocument) {
  let serial = 0;
  // Splices are cloned into the rewrite, so re-query after each loop instead
  // of holding a snapshot that nested loops would fall out of.
  for (;;) {
    const loop = [...doc.querySelectorAll('ir-for')]
      .find(node => node.closest('ir-source-file') && [...node.querySelectorAll(':scope > ir-for-source')].some(isArraySource));
    if (!loop) return;
    try {
      loop.replaceWith(rewrite(loop, `__for${serial++}_`, parser, createDocument));
    } catch (error) {
      throw compilerError(DIAGNOSTIC_KINDS.INVALID_FOR_SOURCE, error.message, loop);
    }
  }
}

function rewrite(loop, prefix, parser, createDocument) {
  const sources = [...loop.querySelectorAll(':scope > ir-for-source')];
  const names = (loop.querySelector(':scope > ir-capture')?.getAttribute('names') ?? '').split(',').filter(Boolean);
  const body = loop.querySelector(':scope > ir-block');
  if (names.length && names.length !== sources.length) {
    throw new Error(`for has ${sources.length} source(s) but ${names.length} capture(s)`);
  }
  const splices = new Map();
  const splice = node => {
    const key = `${prefix}splice${splices.size}`;
    splices.set(key, node);
    return key;
  };
  const setup = [], ranges = [], captures = [], elements = [];
  sources.forEach((source, index) => {
    if (!isArraySource(source)) {
      const [start, end] = [...source.children];
      ranges.push(`${splice(start)} ${source.getAttribute('op')} ${splice(end)}`);
      captures.push(names[index] ?? `${prefix}unused${index}`);
      return;
    }
    const array = `${prefix}src${index}`, position = `${prefix}i${index}`;
    setup.push(`let ${array} = ${splice(source.firstElementChild)};`);
    ranges.push(`0 ..< ${array}.len()`);
    captures.push(position);
    if (names[index]) elements.push(`let ${names[index]} = ${array}[${position}];`);
  });
  const capture = names.length ? ` |${captures.join(', ')}|` : '';
  const code = `{ ${setup.join(' ')} for (${ranges.join(', ')})${capture} { ${elements.join(' ')} ${body ? splice(body) : ''}; }; }`;
  const lowered = expressionFromSource(parser, code, loop, splices, { createDocument });
  // A non-array source is reported once, at the source, by validate-analysis;
  // the generated `.len()` and `[k]` accesses stay quiet.
  sources.forEach((source, index) => {
    if (!isArraySource(source)) return;
    const array = `${prefix}src${index}`;
    lowered.querySelector(`ir-let[name="${array}"]`).setAttribute('data-for-array-source', 'true');
    for (const use of lowered.querySelectorAll(`ir-ident[name="${array}"]`)) {
      const access = use.parentElement?.closest('ir-call, ir-index');
      if (access) access.setAttribute('data-for-array-access', 'true');
    }
  });
  return lowered;
}
