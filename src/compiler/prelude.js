import { parseToIR } from './parse.js';

// Parsed prelude modules, per parser and standard library. Compiles clone the
// cached IR instead of re-parsing the standard library every time.
const parsed = new WeakMap();

/**
 * The standard modules `std:Prelude` brings into every program, each with its
 * parsed `ir-module` element (clone it before inserting it into a document).
 * @returns {{ module: string, path: string, element: Element }[]}
 */
export function collectPreludeModules({ parser, stdlib, createDocument }) {
  let byStdlib = parsed.get(parser);
  if (!byStdlib) parsed.set(parser, byStdlib = new WeakMap());
  if (byStdlib.has(stdlib)) return byStdlib.get(stdlib);

  const modules = [];
  const preludeSource = stdlib.get('std:Prelude');
  const preludeRoot = typeof preludeSource === 'string' ? parseToIR(parser, preludeSource, createDocument).body.firstChild : null;
  for (const using of preludeRoot?.querySelectorAll(':scope > ir-using[from^="std:"]') ?? []) {
    const stdPath = using.getAttribute('from');
    const moduleSource = stdlib.get(stdPath);
    if (typeof moduleSource !== 'string') continue;
    const moduleDoc = parseToIR(parser, moduleSource, stdPath, createDocument, { collectAnalysisTokens: false });
    const element = moduleDoc.body.firstChild?.querySelector(':scope > ir-module');
    const name = element?.getAttribute('name');
    if (name) modules.push({ module: name, path: stdPath, element });
  }
  byStdlib.set(stdlib, modules);
  return modules;
}
