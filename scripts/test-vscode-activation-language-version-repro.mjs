import { readFile } from 'node:fs/promises';
import * as treeSitter from 'web-tree-sitter';

import { UtuParserService, createSourceDocument } from '../packages/document/index.js';
import { UtuLanguageService, UtuWorkspaceSymbolIndex } from '../packages/language-platform/index.js';
import { getRepoRoot } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const expectedMessage = 'Incompatible language version 0. Compatibility range 13 through 15.';

async function main() {
  const [grammarWasmPath, runtimeWasmPath] = await Promise.all([
    readFile(new URL('../tree-sitter-utu.wasm', import.meta.url)),
    readFile(new URL('../web-tree-sitter.wasm', import.meta.url)),
  ]);

  const originalLoad = treeSitter.Language.load;
  treeSitter.Language.load = async (...args) => {
    const language = await originalLoad.apply(treeSitter.Language, args);
    language[0] = 0;
    return language;
  };

  const parserService = new UtuParserService({ grammarWasmPath, runtimeWasmPath });
  const languageService = new UtuLanguageService(parserService);
  const workspaceSymbols = new UtuWorkspaceSymbolIndex(languageService);
  const document = Object.assign(
    createSourceDocument('export fun main() i32 { 0 }', {
      uri: `file://${repoRoot}/examples/hello.utu`,
      version: 1,
    }),
    { languageId: 'utu' },
  );

  try {
    await workspaceSymbols.syncDocuments([document], { replace: true });
    throw new Error(`Expected activation-style workspace sync to throw "${expectedMessage}"`);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (message !== expectedMessage) {
      throw new Error(`Expected "${expectedMessage}", received "${message}"`);
    }

    const stack = String(error instanceof Error ? error.stack ?? error.message : error);
    const expectedStackGroups = [
      ['Parser.setLanguage', 'setLanguage'],
      ['createUtuTreeSitterParser', 'packages/document/index.js'],
    ];
    for (const group of expectedStackGroups) {
      if (!group.some((fragment) => stack.includes(fragment))) {
        throw new Error(`Expected stack to include one of ${JSON.stringify(group)}, received:\n${stack}`);
      }
    }

    console.log(`PASS vscode activation language-version repro (verified expected error: ${expectedMessage})`);
  } finally {
    treeSitter.Language.load = originalLoad;
    languageService.dispose();
    parserService.dispose();
  }
}

await main();
