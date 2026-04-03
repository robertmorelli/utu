import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { UtuParserService, createSourceDocument } from '../packages/document/index.js';
import { UtuLanguageService } from '../packages/language-platform/index.js';
import { UtuWorkspaceSession } from '../packages/workspace/index.js';
import {
  assertManagedTestModule,
  expectDeepEqual,
  expectEqual,
  getRepoRoot,
  loadNodeFileImport,
  runNamedCases,
} from './test-helpers.mjs';

assertManagedTestModule(import.meta.url);

const repoRoot = getRepoRoot(import.meta.url);
const workspaceRootUri = pathToFileURL(repoRoot).toString();
const examplesRoot = resolve(repoRoot, 'examples/multi_file');
const mainPath = resolve(examplesRoot, 'main.utu');
const testsPath = resolve(examplesRoot, 'tests.utu');
const boxesPath = resolve(examplesRoot, '_boxes.utu');
const opsPath = resolve(examplesRoot, '_ops.utu');

const failed = await runNamedCases([
  ['workspace editor diagnostics resolve imported modules without false errors', testCrossFileEditorDiagnostics],
  ['workspace definitions resolve imported modules types and members across files', testCrossFileDefinitions],
  ['workspace hover resolves imported modules types and members across files', testCrossFileHover],
  ['workspace references resolve imported modules types and members across files', testCrossFileReferences],
  ['workspace highlights resolve imported modules types and members inside the current file', testCrossFileHighlights],
  ['workspace semantic tokens highlight imported modules and opened types', testCrossFileSemanticTokens],
  ['workspace dependency graph tracks direct file-import edges', testFileImportDependencyGraph],
]);

if (failed)
  process.exit(1);

async function testCrossFileDefinitions() {
  await withWorkspaceSession(async (session) => {
    await openWorkspaceDocument(session, mainPath);
    await openWorkspaceDocument(session, testsPath);
    await openWorkspaceDocument(session, boxesPath);

    await expectDefinition(session, mainPath, 'Box.new', 1, boxesPath, 'struct Box', 'Box');
    await expectDefinition(session, testsPath, 'crate.Box.new', 2, boxesPath, 'mod boxes', 'boxes');
    await expectDefinition(session, testsPath, 'crate.Box.score', 'crate.Box.'.length, boxesPath, 'fun Box.score', 'score');
    await expectDefinition(session, boxesPath, 'ops.double', 'ops.'.length, opsPath, 'fun double', 'double');
  });
}

async function testCrossFileEditorDiagnostics() {
  await withWorkspaceSession(async (session) => {
    await openWorkspaceDocument(session, testsPath);
    await openWorkspaceDocument(session, boxesPath);
    await openWorkspaceDocument(session, opsPath);

    await expectNoDiagnostics(session, testsPath, 'editor');
    await expectNoDiagnostics(session, boxesPath, 'editor');
  });
}

async function testFileImportDependencyGraph() {
  await withWorkspaceSession(async (session) => {
    await openWorkspaceDocument(session, mainPath);
    await openWorkspaceDocument(session, boxesPath);
    const dependents = session.dependencies.getDependents(pathToFileURL(boxesPath).toString()).sort();
    expectDeepEqual(dependents, [pathToFileURL(mainPath).toString()]);
  });
}

async function testCrossFileHover() {
  await withWorkspaceSession(async (session) => {
    await openWorkspaceDocument(session, testsPath);
    await openWorkspaceDocument(session, boxesPath);
    await expectHoverContains(session, testsPath, 'crate.Box.new', 2, 'mod boxes');
    await expectHoverContains(session, testsPath, 'crate.Box.score', 'crate.Box.'.length, 'fun Box.score(self: Box) i32');
  });
}

async function testCrossFileReferences() {
  await withWorkspaceSession(async (session) => {
    await openWorkspaceDocument(session, mainPath);
    await openWorkspaceDocument(session, testsPath);
    await openWorkspaceDocument(session, boxesPath);
    await openWorkspaceDocument(session, opsPath);

    await expectReferencesInclude(session, opsPath, 'double(value', 1, [
      tokenLocation(opsPath, 'fun double', 'double'),
      tokenLocation(boxesPath, 'ops.double', 'double'),
    ]);
    await expectReferencesInclude(session, mainPath, 'Box.score', 'Box.'.length, [
      tokenLocation(boxesPath, 'fun Box.score', 'score'),
      tokenLocation(mainPath, 'Box.score(Box.new', 'score'),
      tokenLocation(testsPath, 'assert Box.score(box)', 'score'),
      tokenLocation(testsPath, 'assert crate.Box.score(box)', 'score'),
    ]);
  });
}

async function testCrossFileHighlights() {
  await withWorkspaceSession(async (session) => {
    await openWorkspaceDocument(session, testsPath);
    await openWorkspaceDocument(session, boxesPath);
    const testsUri = pathToFileURL(testsPath).toString();
    const testsText = await readFile(testsPath, 'utf8');

    await expectHighlightsInclude(session, testsPath, 'Box.new(4)', 1, [
      tokenRange(testsUri, testsText, 'let box: Box =', 'Box'),
      tokenRange(testsUri, testsText, 'Box.new(4)', 'Box'),
      tokenRange(testsUri, testsText, 'assert Box.score(box)', 'Box'),
      tokenRange(testsUri, testsText, 'crate.Box =', 'Box'),
      tokenRange(testsUri, testsText, 'crate.Box.new(5)', 'Box'),
      tokenRange(testsUri, testsText, 'crate.Box.score(box)', 'Box'),
    ]);
  });
}

async function testCrossFileSemanticTokens() {
  await withWorkspaceSession(async (session) => {
    await openWorkspaceDocument(session, testsPath);
    await openWorkspaceDocument(session, boxesPath);
    await openWorkspaceDocument(session, opsPath);

    await expectSemanticToken(session, testsPath, 'import boxes |crate|', 'boxes', 'namespace');
    await expectSemanticToken(session, testsPath, 'import boxes |crate|', 'crate', 'namespace');
    await expectSemanticToken(session, testsPath, 'let box: Box =', 'Box', 'type');
    await expectSemanticToken(session, boxesPath, 'ops.double', 'ops', 'namespace');
    await expectSemanticToken(session, boxesPath, 'ops.double', 'double', 'function');
  });
}

async function withWorkspaceSession(run) {
  const parserService = new UtuParserService({
    grammarWasmPath: resolve(repoRoot, 'tree-sitter-utu.wasm'),
    runtimeWasmPath: resolve(repoRoot, 'web-tree-sitter.wasm'),
  });
  const languageService = new UtuLanguageService(parserService, { loadImport: loadNodeFileImport });
  const session = new UtuWorkspaceSession({
    workspaceFolders: [workspaceRootUri],
    parserService,
    languageService,
  });
  try {
    await run(session);
  } finally {
    session.dispose();
  }
}

async function openWorkspaceDocument(session, filePath) {
  const uri = pathToFileURL(filePath).toString();
  await session.openDocument({
    uri,
    version: 1,
    text: await readFile(filePath, 'utf8'),
  });
}

async function expectDefinition(session, sourcePath, marker, offset, targetPath, targetSnippet, targetToken) {
  const sourceUri = pathToFileURL(sourcePath).toString();
  const sourceText = await readFile(sourcePath, 'utf8');
  const targetText = await readFile(targetPath, 'utf8');
  const location = await session.getDefinition(
    sourceUri,
    positionForMarker(sourceUri, sourceText, marker, offset),
  );
  if (!location)
    throw new Error(`Expected a definition for ${JSON.stringify(marker)} in ${sourcePath}`);
  expectEqual(location.uri, pathToFileURL(targetPath).toString());
  const expectedRange = tokenRange(location.uri, targetText, targetSnippet, targetToken);
  expectDeepEqual(location.range, expectedRange);
}

async function expectHoverContains(session, sourcePath, marker, offset, fragment) {
  const sourceUri = pathToFileURL(sourcePath).toString();
  const sourceText = await readFile(sourcePath, 'utf8');
  const hover = await session.getHover(
    sourceUri,
    positionForMarker(sourceUri, sourceText, marker, offset),
  );
  const value = hover?.contents?.value;
  if (!value?.includes(fragment))
    throw new Error(`Expected hover for ${JSON.stringify(marker)} to include ${JSON.stringify(fragment)}, received ${JSON.stringify(value)}`);
}

async function expectNoDiagnostics(session, sourcePath, mode) {
  const sourceUri = pathToFileURL(sourcePath).toString();
  const document = session.documents.get(sourceUri);
  if (!document)
    throw new Error(`Expected open workspace document for ${sourcePath}`);
  const diagnostics = await session.getFreshDiagnostics(document, { mode });
  if (diagnostics.length > 0)
    throw new Error(`Expected no diagnostics for ${sourcePath}, received ${JSON.stringify(diagnostics)}`);
}

async function expectReferencesInclude(session, sourcePath, marker, offset, expectedLocations) {
  const sourceUri = pathToFileURL(sourcePath).toString();
  const sourceText = await readFile(sourcePath, 'utf8');
  const references = await session.getReferences(
    sourceUri,
    positionForMarker(sourceUri, sourceText, marker, offset),
    true,
  );
  const actualKeys = new Set(references.map(locationKey));
  for (const expected of expectedLocations) {
    if (!actualKeys.has(locationKey(expected)))
      throw new Error(`Expected references for ${JSON.stringify(marker)} to include ${JSON.stringify(expected)}, received ${JSON.stringify(references)}`);
  }
}

async function expectHighlightsInclude(session, sourcePath, marker, offset, expectedRanges) {
  const sourceUri = pathToFileURL(sourcePath).toString();
  const sourceText = await readFile(sourcePath, 'utf8');
  const highlights = await session.getDocumentHighlights(
    sourceUri,
    positionForMarker(sourceUri, sourceText, marker, offset),
  );
  const actualKeys = new Set(highlights.map((highlight) => rangeKey(highlight.range)));
  for (const expected of expectedRanges) {
    if (!actualKeys.has(rangeKey(expected)))
      throw new Error(`Expected highlights for ${JSON.stringify(marker)} to include ${JSON.stringify(expected)}, received ${JSON.stringify(highlights)}`);
  }
}

async function expectSemanticToken(session, sourcePath, snippet, token, type) {
  const sourceUri = pathToFileURL(sourcePath).toString();
  const sourceText = await readFile(sourcePath, 'utf8');
  const expectedRange = tokenRange(sourceUri, sourceText, snippet, token);
  const tokens = await session.getDocumentSemanticTokens(sourceUri);
  const match = tokens.find((candidate) => rangeKey(candidate.range) === rangeKey(expectedRange));
  if (!match)
    throw new Error(`Expected semantic token for ${JSON.stringify(token)} in ${sourcePath}, received ${JSON.stringify(tokens)}`);
  expectEqual(match.type, type);
}

function positionForMarker(uri, sourceText, marker, offset) {
  const markerOffset = sourceText.indexOf(marker);
  if (markerOffset < 0)
    throw new Error(`Could not find marker ${JSON.stringify(marker)} in ${uri}`);
  return createSourceDocument(sourceText, { uri, version: 1 }).positionAt(markerOffset + resolveOffset(marker, offset));
}

function tokenRange(uri, sourceText, snippet, token) {
  const snippetOffset = sourceText.indexOf(snippet);
  if (snippetOffset < 0)
    throw new Error(`Could not find target snippet ${JSON.stringify(snippet)} in ${uri}`);
  const tokenOffset = sourceText.indexOf(token, snippetOffset);
  if (tokenOffset < 0)
    throw new Error(`Could not find token ${JSON.stringify(token)} after ${JSON.stringify(snippet)} in ${uri}`);
  const document = createSourceDocument(sourceText, { uri, version: 1 });
  return {
    start: document.positionAt(tokenOffset),
    end: document.positionAt(tokenOffset + token.length),
  };
}

function tokenLocation(targetPath, snippet, token) {
  const uri = pathToFileURL(targetPath).toString();
  return {
    uri,
    range: tokenRange(uri, readFileSync(targetPath, 'utf8'), snippet, token),
  };
}

function resolveOffset(marker, offset) {
  return typeof offset === 'number' ? offset : offset.length;
}

function locationKey(location) {
  return `${location.uri}:${rangeKey(location.range)}`;
}

function rangeKey(range) {
  return `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
}
