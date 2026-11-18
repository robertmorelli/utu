// tree-sitter-wutu (editors/) against every Wutu template in the repository,
// nested ones included: each parses without error nodes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Parser, Language, Query } from 'web-tree-sitter';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
await Parser.init();
const utu = await Language.load('./editors/tree-sitter-utu/tree-sitter-utu.wasm');
const wutu = await Language.load('./editors/tree-sitter-wutu/tree-sitter-wutu.wasm');
const pu = new Parser();
pu.setLanguage(utu);
const pw = new Parser();
pw.setLanguage(wutu);
// The error catalog contains intentionally invalid templates.
const files = execFileSync('git', ['ls-files', '-z', '*.utu'], { encoding: 'utf8' })
  .split('\0')
  .filter(file => file && !file.startsWith('baselines/') && !file.startsWith('selfhost/')
    && !/^examples\/error_demo\/[^/]+\//.test(file));
let total = 0;
let bad = 0;
const shown = [];

function firstError(node) {
  if (node.type === 'ERROR' || node.isMissing) return node;
  for (const child of node.children) {
    if (child.hasError || child.isMissing) return firstError(child);
  }
}

function check(file, text) {
  total++;
  const tree = pw.parse(text);
  if (!tree.rootNode.hasError) return tree;
  bad++;
  if (shown.length < 8) {
    const error = firstError(tree.rootNode);
    const at = error?.startIndex ?? 0;
    const detail = error?.isMissing ? `missing ${error.type}` : 'ERROR';
    shown.push(`${file}: ${detail} at ${JSON.stringify(text.slice(Math.max(0, at - 40), at + 30))}`);
  }
  return tree;
}
check('computed CSS blocks', `div {
  width: { percent.str() + "%" }
  color: { if ready { "green" } else { "red" } }
  --value: { let value = "10px"; value }
}`);
const componentInsertions = `main {
  | labels
  |> if expanded { full_labels } else { short_labels }
  |> { let chosen = labels; chosen }
  |> labels map |label| { label } collect(Label)
  = title
  | other
  for labels |label| {
    | label
  }
}`;
const highlights = new Query(wutu, fs.readFileSync('editors/helix/queries/wutu/highlights.scm', 'utf8'));
const componentTree = check('component insertion expressions', componentInsertions);
const pipes = new Map();
for (const { name, node } of highlights.captures(componentTree.rootNode)) {
  if (node.text === '|' || node.text === '|>') pipes.set(node.startIndex, [node.text, name]);
}
assert.deepEqual([...pipes.values()], [
  ['|', 'operator'],
  ['|>', 'operator'],
  ['|>', 'operator'],
  ['|>', 'operator'],
  ['|', 'punctuation.delimiter'],
  ['|', 'punctuation.delimiter'],
  ['|', 'operator'],
  ['|', 'punctuation.delimiter'],
  ['|', 'punctuation.delimiter'],
  ['|', 'operator'],
]);
componentTree.delete();

function walk(file, node) {
  for (const child of node.children) {
    let text;
    if (child.type === 'dsl_expr') {
      const name = child.children.find(part => part.type === 'identifier' || part.type === 'dsl_name');
      if (name?.text === 'wutu') {
        text = child.children.find(part => part.type === 'dsl_body')?.children.find(part => part.type === 'dsl_text');
      }
    } else if (child.type === 'wutu_body') {
      text = child.children.find(part => part.type === 'wutu_text');
    }
    if (text) {
      const tree = check(file, text.text);
      walk(file, tree.rootNode);
      tree.delete();
    }
    walk(file, child);
  }
}

for (const file of new Set(files)) {
  const tree = pu.parse(fs.readFileSync(file, 'utf8'));
  walk(file, tree.rootNode);
  tree.delete();
}
console.log(`${total - bad}/${total} templates (nested ones included) parse without errors`);
for (const s of shown) console.log(s);
if (bad) process.exit(1);
