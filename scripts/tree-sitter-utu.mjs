// tree-sitter-utu (editors/tree-sitter-utu), the editors' grammar, as the
// reference the self-hosted lexer and parser are held to.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'editors', 'tree-sitter-utu');

/**
 * A function from source text to its tree-sitter tree, or null when the
 * grammar finds an error. Each tree lives until the next call.
 */
export async function treeSitterUtu() {
  const { Parser, Language } = await import('web-tree-sitter');
  await Parser.init({ locateFile: name => path.join(DIR, name) });
  const parser = new Parser();
  parser.setLanguage(await Language.load(path.join(DIR, 'tree-sitter-utu.wasm')));
  let last = null;
  return text => {
    last?.delete();
    last = parser.parse(text);
    return last.rootNode.hasError ? null : last;
  };
}
