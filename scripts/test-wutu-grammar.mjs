// tree-sitter-wutu (editors/) against every Wutu template in the repository,
// nested ones included: each parses without error nodes.
import { Parser, Language } from 'web-tree-sitter';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
process.chdir(new URL('..', import.meta.url).pathname);
await Parser.init();
const utu = await Language.load('./tree-sitter-utu.wasm');
const wutu = await Language.load('./editors/tree-sitter-wutu/tree-sitter-wutu.wasm');
const pu = new Parser(); pu.setLanguage(utu);
const pw = new Parser(); pw.setLanguage(wutu);
const files = execSync('git ls-files "*.utu" "editors/**/*.utu"', { encoding: 'utf8' }).split('\n').filter(f => f && !f.startsWith('baselines/') && !f.startsWith('selfhost/'));
let total = 0, bad = 0; const shown = [];
const check = (f, text) => {
  total++; const t = pw.parse(text);
  if (!t.rootNode.hasError) return;
  bad++;
  if (shown.length < 8) { const e = []; const find = m => { if (m.type === 'ERROR' || m.isMissing) e.push(m); else for (const k of m.children) find(k); }; find(t.rootNode); const x = e[0]; shown.push(`${f}: ${x?.isMissing ? 'missing ' + x.type : 'ERROR'} at ${JSON.stringify(text.slice(Math.max(0, x?.startIndex - 40), x?.startIndex + 30))}`); }
};
for (const f of [...new Set(files)]) {
  const src = fs.readFileSync(f, 'utf8');
  const walk = (n, lang) => { for (const c of n.children) {
    if (c.type === 'dsl_expr') {
      const name = c.children.find(k => k.type === 'identifier' || k.type === 'dsl_name')?.text;
      const text = c.children.find(k => k.type === 'dsl_body')?.children.find(k => k.type === 'dsl_text');
      if (name === 'wutu' && text) { check(f, text.text); walk(pw.parse(text.text).rootNode, 'wutu'); }
    }
    walk(c, lang); } };
  walk(pu.parse(src).rootNode, 'utu');
}
console.log(`${total - bad}/${total} templates (nested ones included) parse without errors`);
for (const s of shown) console.log(s);
if (bad) process.exit(1);
