import { parseToIR, treeToIR } from '../src/compiler/parse.js';
import { buildModuleGraph } from '../src/compiler/build-graph.js';

export function registerParserLifecycleTests({ test, assertEq, assertThrows, assert }) {
  test('parser: owned trees are released after IR conversion and conversion failure', ({ parser }) => {
    let deleted = 0;
    const tracked = { parse(source) {
      const tree = parser.parse(source);
      return { get rootNode() { return tree.rootNode; }, delete() { deleted++; tree.delete(); } };
    } };
    // A valid program parses without tree-sitter.
    parseToIR(tracked, 'fn answer() I32 { 42; }');
    assertEq(deleted, 0);
    // A syntax error goes to tree-sitter, whose tree is released.
    const broken = 'fn answer() I32 { 42; ';
    const doc = parseToIR(tracked, broken);
    assertEq(doc.querySelector('ir-lit').getAttribute('value'), '42');
    assertEq(deleted, 1);
    assertThrows(() => parseToIR(tracked, broken, () => { throw new Error('factory failure'); }), 'factory failure');
    assertEq(deleted, 2);
    assertThrows(() => parseToIR({ parse: () => null }, broken), 'no syntax tree');
  });

  test('parser: treeToIR leaves borrowed syntax trees alive', ({ parser }) => {
    const tree = parser.parse('fn answer() I32 { 42; }');
    try {
      treeToIR(tree, 'fn answer() I32 { 42; }');
      assertEq(tree.rootNode.type, 'source_file');
    } finally {
      tree.delete();
    }
  });

  test('module graph: diamond imports read and parse each file once', async ({ parser }) => {
    const files = new Map([
      ['/main', 'using Left from "left"; using Right from "right";'],
      ['/left', 'using Shared from "shared"; module Left {}'],
      ['/right', 'using Shared from "shared"; module Right {}'],
      ['/shared', 'module Shared {}'],
    ]);
    const reads = new Map();
    const { graph, order, imports } = await buildModuleGraph('/main', {
      parser,
      readFile: async file => { reads.set(file, (reads.get(file) ?? 0) + 1); return files.get(file); },
      resolvePath: (_, relative) => `/${relative}`,
    });
    assertEq(graph.size, 4);
    assertEq(imports.length, 4);
    assert([...reads.values()].every(count => count === 1));
    assertEq(order.join(','), '/shared,/left,/right,/main');
  });

  test('module graph: cycles fail before rereading an active source', async ({ parser }) => {
    let reads = 0;
    try {
      await buildModuleGraph('/a', {
        parser,
        readFile: async file => { reads++; return file === '/a' ? 'using B from "b";' : 'using A from "a";'; },
        resolvePath: (_, relative) => `/${relative}`,
      });
      throw new Error('expected import cycle');
    } catch (error) {
      assert(error.message.includes('Import cycle'), error.message);
      assertEq(reads, 2);
    }
  });
}
