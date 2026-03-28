import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import textmate from 'vscode-textmate';
import oniguruma from 'vscode-oniguruma';
import { assertManagedTestModule, getRepoRoot } from './test-helpers.mjs';

const { Registry } = textmate;
const { loadWASM, OnigScanner, OnigString } = oniguruma;

assertManagedTestModule(import.meta.url);

const repoRoot = getRepoRoot(import.meta.url);
const grammarPath = resolve(repoRoot, 'jsondata/utu.tmLanguage.json');
const fixturePath = resolve(repoRoot, 'scripts/fixtures/textmate_escape.utu');
const onigurumaPath = resolve(repoRoot, 'node_modules/vscode-oniguruma/release/onig.wasm');

const [grammarText, fixture, onigurumaWasm] = await Promise.all([
  readFile(grammarPath, 'utf8'),
  readFile(fixturePath, 'utf8'),
  readFile(onigurumaPath),
]);

await loadWASM(onigurumaWasm.buffer);

const registry = new Registry({
  onigLib: Promise.resolve({
    createOnigScanner(patterns) {
      return new OnigScanner(patterns);
    },
    createOnigString(text) {
      return new OnigString(text);
    },
  }),
  loadGrammar: async (scopeName) => {
    if (scopeName === 'source.utu') return JSON.parse(grammarText);
    if (scopeName === 'source.js') {
      return {
        scopeName: 'source.js',
        patterns: [
          {
            match: '[^|]+',
            name: 'source.js',
          },
        ],
      };
    }
    return null;
  },
});

const grammar = await registry.loadGrammar('source.utu');
if (!grammar) throw new Error('Failed to load UTU TextMate grammar.');

const line = fixture.trimEnd();
const { tokens } = grammar.tokenizeLine(line);

const openMarker = line.indexOf('|');
const closeMarker = line.lastIndexOf('|');
if (openMarker < 0 || closeMarker <= openMarker) throw new Error('Fixture must contain |...| delimiters.');

assertEmbedded(openMarker + 1, true, 'first JS character should be embedded');
assertEmbedded(closeMarker - 1, true, 'last JS character should be embedded');
assertEmbedded(openMarker, false, 'opening | should not be embedded');
assertEmbedded(closeMarker, false, 'closing | should not be embedded');

assertOperatorScope('for (0..<3) |i| { };', '..<');
assertOperatorScope('for (0...3) |i| { };', '...');
assertOperatorScope('value += 1;', '+=');
assertOperatorScope('value >>= 1;', '>>=');
assertOperatorScope('flag and= other;', 'and=');

console.log('PASS textmate escape embedding');

function assertEmbedded(index, expected, label) {
  const token = tokenAt(index);
  const actual = token.scopes.includes('meta.embedded.inline.javascript');
  if (actual !== expected) {
    throw new Error(`${label}: expected embedded=${expected}, got embedded=${actual} at column ${index + 1} with scopes ${token.scopes.join(' ')}`);
  }
}

function tokenAt(index) {
  const token = tokens.find((entry) => entry.startIndex <= index && index < entry.endIndex);
  if (!token) throw new Error(`No token found at column ${index + 1}.`);
  return token;
}

function assertOperatorScope(lineText, operator) {
  const lineTokens = grammar.tokenizeLine(lineText).tokens;
  const start = lineText.indexOf(operator);
  if (start < 0) throw new Error(`Missing operator ${operator} in fixture line.`);
  const token = lineTokens.find((entry) => entry.startIndex <= start && start < entry.endIndex);
  if (!token) throw new Error(`No token found at operator ${operator}.`);
  if (!token.scopes.includes('keyword.operator.utu'))
    throw new Error(`Expected ${operator} to use keyword.operator.utu, got ${token.scopes.join(' ')}.`);
}
