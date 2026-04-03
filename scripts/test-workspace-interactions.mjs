import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateWat } from '../packages/compiler/index.js';
import { createSourceDocument, UtuParserService } from '../packages/document/index.js';
import { UtuLanguageService } from '../packages/language-platform/index.js';
import { UtuWorkspaceSession } from '../packages/workspace/index.js';
import {
  assertManagedTestModule,
  expectEqual,
  getRepoRoot,
  runNamedCases,
} from './test-helpers.mjs';

assertManagedTestModule(import.meta.url);

const repoRoot = getRepoRoot(import.meta.url);

const failed = await runNamedCases([
  ['workspace compile diagnostics track unsaved imported file edits', testWorkspaceCompileDiagnosticsFollowOpenImports],
  ['workspace references include same-module usages for open imported functions', testWorkspaceReferencesIncludeDefiningModuleUses],
  ['workspace definitions and references resolve imported method sugar through construct aliases', testWorkspaceMethodSugarResolvesThroughConstructAliases],
]);

if (failed)
  process.exit(1);

process.exitCode = 0;

async function testWorkspaceCompileDiagnosticsFollowOpenImports() {
  await withWorkspaceFixture(async ({ depPath, mainPath }) => {
    const parserService = new UtuParserService({
      grammarWasmPath: resolve(repoRoot, 'tree-sitter-utu.wasm'),
      runtimeWasmPath: resolve(repoRoot, 'web-tree-sitter.wasm'),
    });
    const languageService = new UtuLanguageService(parserService, { validateWat });
    const session = new UtuWorkspaceSession({
      workspaceFolders: [pathToFileURL(resolve(mainPath, '..')).toString()],
      parserService,
      languageService,
    });
    try {
      const depUri = pathToFileURL(depPath).toString();
      const mainUri = pathToFileURL(mainPath).toString();
      const depV1 = await Bun.file(depPath).text();
      const mainSource = await Bun.file(mainPath).text();

      await session.openDocument({ uri: depUri, version: 1, text: depV1 });
      await session.openDocument({ uri: mainUri, version: 1, text: mainSource });

      expectEqual((await session.getDiagnostics(mainUri, { mode: 'compile' })).length, 0);

      const depBroken = depV1.replaceAll('Box', 'Crate');
      await session.saveDocument({
        uri: depUri,
        version: 2,
        text: depBroken,
      });

      const brokenDiagnostics = await session.getDiagnostics(mainUri, { mode: 'compile' });
      if (!brokenDiagnostics.some((diagnostic) => diagnostic.message.includes('unknown type identifier')))
        throw new Error(`Expected compile diagnostics to surface the imported type breakage, received ${JSON.stringify(brokenDiagnostics)}`);

      await session.closeDocument(depUri);
      expectEqual((await session.getDiagnostics(mainUri, { mode: 'compile' })).length, 0);
    } finally {
      session.dispose();
    }
  });
}

async function testWorkspaceReferencesIncludeDefiningModuleUses() {
  await withOpenImportFixture(async ({ depPath, mainPath, depSource, mainSource }) => {
    const parserService = new UtuParserService({
      grammarWasmPath: resolve(repoRoot, 'tree-sitter-utu.wasm'),
      runtimeWasmPath: resolve(repoRoot, 'web-tree-sitter.wasm'),
    });
    const languageService = new UtuLanguageService(parserService, { validateWat });
    const session = new UtuWorkspaceSession({
      workspaceFolders: [pathToFileURL(resolve(mainPath, '..')).toString()],
      parserService,
      languageService,
    });
    try {
      const depUri = pathToFileURL(depPath).toString();
      const mainUri = pathToFileURL(mainPath).toString();
      await session.openDocument({ uri: depUri, version: 1, text: depSource });
      await session.openDocument({ uri: mainUri, version: 1, text: mainSource });

      const mainDocument = createSourceDocument(mainSource, { uri: mainUri, version: 1 });
      const helperOffset = mainSource.indexOf('helper(1)') + 1;
      const references = await session.getReferences(mainUri, mainDocument.positionAt(helperOffset), true);
      const keys = new Set(references.map((reference) => `${reference.uri}:${reference.range.start.line}:${reference.range.start.character}`));
      const expected = [
        `${depUri}:1:8`,
        `${depUri}:6:8`,
        `${mainUri}:4:4`,
      ];
      for (const key of expected) {
        if (!keys.has(key))
          throw new Error(`Expected references to include ${key}, received ${JSON.stringify(references)}`);
      }
    } finally {
      session.dispose();
    }
  });
}

async function testWorkspaceMethodSugarResolvesThroughConstructAliases() {
  await withConstructAliasMethodFixture(async ({ depPath, mainPath, depSource, mainSource }) => {
    const parserService = new UtuParserService({
      grammarWasmPath: resolve(repoRoot, 'tree-sitter-utu.wasm'),
      runtimeWasmPath: resolve(repoRoot, 'web-tree-sitter.wasm'),
    });
    const languageService = new UtuLanguageService(parserService, { validateWat });
    const session = new UtuWorkspaceSession({
      workspaceFolders: [pathToFileURL(resolve(mainPath, '..')).toString()],
      parserService,
      languageService,
    });
    try {
      const depUri = pathToFileURL(depPath).toString();
      const mainUri = pathToFileURL(mainPath).toString();
      await session.openDocument({ uri: depUri, version: 1, text: depSource });
      await session.openDocument({ uri: mainUri, version: 1, text: mainSource });

      const mainDocument = createSourceDocument(mainSource, { uri: mainUri, version: 1 });
      const getOffset = mainSource.indexOf('get();') + 1;
      const definition = await session.getDefinition(mainUri, mainDocument.positionAt(getOffset));
      expectEqual(definition?.uri, depUri);
      expectEqual(definition?.range.start.line, 5);
      expectEqual(definition?.range.start.character, 12);

      const hover = await session.getHover(mainUri, mainDocument.positionAt(getOffset));
      if (!hover?.contents?.value?.includes('fun Box.get(self: Box) T'))
        throw new Error(`Expected hover to describe the imported method, received ${JSON.stringify(hover)}`);

      const references = await session.getReferences(mainUri, mainDocument.positionAt(getOffset), true);
      const keys = new Set(references.map((reference) => `${reference.uri}:${reference.range.start.line}:${reference.range.start.character}`));
      const expected = [
        `${depUri}:5:12`,
        `${mainUri}:4:8`,
      ];
      for (const key of expected) {
        if (!keys.has(key))
          throw new Error(`Expected references to include ${key}, received ${JSON.stringify(references)}`);
      }
    } finally {
      session.dispose();
    }
  });
}

async function withWorkspaceFixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'utu-workspace-interactions-'));
  const depPath = join(dir, '_dep.utu');
  const mainPath = join(dir, 'main.utu');
  try {
    await writeFile(depPath, `mod dep {
    struct Box {
        value: i32,
    }

    fun Box.new(value: i32) Box {
        Box { value: value };
    }
}
`, 'utf8');
    await writeFile(mainPath, `import dep from "./_dep.utu";
construct dep;

fun main() i32 {
    let box: Box = Box.new(1);
    box.value;
}
`, 'utf8');
    await run({ depPath, mainPath });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withOpenImportFixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'utu-workspace-open-imports-'));
  const depPath = join(dir, '_dep.utu');
  const mainPath = join(dir, 'main.utu');
  const depSource = `mod dep {
    fun helper(value: i32) i32 {
        value + 1;
    }

    fun use_helper() i32 {
        helper(4);
    }
}
`;
  const mainSource = `import dep from "./_dep.utu";
construct dep;

fun main() i32 {
    helper(1) + use_helper();
}
`;
  try {
    await writeFile(depPath, depSource, 'utf8');
    await writeFile(mainPath, mainSource, 'utf8');
    await run({ depPath, mainPath, depSource, mainSource });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withConstructAliasMethodFixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'utu-workspace-construct-methods-'));
  const depPath = join(dir, '_dep.utu');
  const mainPath = join(dir, 'main.utu');
  const depSource = `mod boxy[T] {
    struct Box {
        value: T,
    }

    fun Box.get(self: Box) T {
        self.value;
    }
}
`;
  const mainSource = `import boxy from "./_dep.utu";
construct box_i32 = boxy[i32];

fun main(box: box_i32.Box) i32 {
    box.get();
}
`;
  try {
    await writeFile(depPath, depSource, 'utf8');
    await writeFile(mainPath, mainSource, 'utf8');
    await run({ depPath, mainPath, depSource, mainSource });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
