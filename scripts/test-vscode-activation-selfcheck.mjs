import { access, readFile } from 'node:fs/promises';

import { createSourceDocument, UtuParserService } from '../parser.js';
import { UtuLanguageService, UtuWorkspaceSymbolIndex } from '../lsp_core/languageService.js';

const source = 'export fun main() i32 { 0; }';

async function main() {
  const packageMetadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  if (packageMetadata.browser !== './dist/web/extension.cjs') {
    throw new Error(`Expected package.json browser entry to target ./dist/web/extension.cjs, received ${JSON.stringify(packageMetadata.browser)}`);
  }
  await access(new URL('../dist/web/extension.cjs', import.meta.url));

  const compiler = await import('../dist/compiler.web.mjs');
  const metadata = await compiler.get_metadata(source);
  if (!metadata.hasMain) {
    throw new Error('Web compiler self-check failed: expected built compiler bundle to report a runnable main.');
  }

  const [grammarWasmPath, runtimeWasmPath] = await Promise.all([
    readFile(new URL('../tree-sitter-utu.wasm', import.meta.url)),
    readFile(new URL('../web-tree-sitter.wasm', import.meta.url)),
  ]);
  const parserService = new UtuParserService({ grammarWasmPath, runtimeWasmPath });
  const languageService = new UtuLanguageService(parserService);
  const workspaceSymbols = new UtuWorkspaceSymbolIndex(languageService);

  try {
    await workspaceSymbols.syncDocuments([
      Object.assign(
        createSourceDocument(source, { uri: 'file:///activation-selfcheck.utu', version: 1 }),
        { languageId: 'utu' },
      ),
    ], { replace: true });
  } finally {
    languageService.dispose();
    parserService.dispose();
  }

  console.log('PASS vscode activation selfcheck');
}

await main();
