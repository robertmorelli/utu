import { parseToIR } from './parse.js';

export function collectPreludeModules({ parser, stdlib, createDocument }) {
  const preludeSource = stdlib.get('std:Prelude');
  if (!preludeSource) return [];

  const preludeDoc = parseToIR(parser, preludeSource, createDocument);
  const preludeRoot = preludeDoc.body.firstChild;
  if (!preludeRoot) return [];

  const modules = [];
  for (const using of preludeRoot.querySelectorAll(':scope > ir-using[from^="std:"]')) {
    const stdPath = using.getAttribute('from');
    const moduleSource = stdlib.get(stdPath);
    if (!moduleSource) continue;
    const moduleDoc = parseToIR(parser, moduleSource, createDocument);
    const mod = moduleDoc.body.firstChild?.querySelector(':scope > ir-module');
    const modName = mod?.getAttribute('name');
    if (modName) modules.push({ module: modName, path: stdPath });
  }
  return modules;
}
