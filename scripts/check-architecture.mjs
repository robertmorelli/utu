import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { getRepoRoot } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const SOFT_LIMIT = 800;
const PACKAGE_LAYER_ORDER = new Map([
  ['document', 0],
  ['language-spec', 0],
  ['compiler', 1],
  ['workspace', 2],
  ['language-platform', 3],
  ['hosts', 4],
]);

const trackedFiles = [
  'packages/compiler/pipeline.js',
  'packages/compiler/expansion-session.js',
  'packages/language-platform/core/document-index/build.js',
  'packages/language-platform/core/documentIndex.js',
  'packages/document/index.js',
  'packages/workspace/session.js',
];
const forbiddenLegacyPaths = [
  'cli.mjs',
  'expand-utils.js',
  'expand.js',
  'extension/activate.js',
  'extension/adapters/core.js',
  'extension/commands.js',
  'extension/diagnostics.js',
  'extension/extension.web.js',
  'extension/generatedDocuments.js',
  'extension/languageProviders.js',
  'extension/shared.js',
  'extension/testing.js',
  'index.js',
  'jsgen.js',
  'loadCompiledRuntime.mjs',
  'loadNodeModuleFromSource.mjs',
  'lsp.mjs',
  'lsp_core/hoverDocs.js',
  'lsp_core/languageService.js',
  'lsp_core/types.js',
  'lsp_server/index.js',
  'moduleSourceLoader.mjs',
  'parser.js',
  'tree.js',
  'watgen.js',
];
const vscodeDesktopShimPath = resolve(repoRoot, 'packages/hosts/vscode/extension.node.js');

const results = await Promise.all(trackedFiles.map(async (relativePath) => {
  const source = await readFile(resolve(repoRoot, relativePath), 'utf8');
  return {
    relativePath,
    lines: source.split('\n').length,
  };
}));

const warnings = results.filter(({ lines }) => lines > SOFT_LIMIT);
const importViolations = await collectImportViolations();
const forbiddenPathViolations = await collectForbiddenPathViolations();
const desktopShimViolation = await collectDesktopShimViolation();

for (const { relativePath, lines } of results) {
  const status = lines > SOFT_LIMIT ? 'WARN' : 'OK';
  console.log(`${status.padEnd(4)} ${String(lines).padStart(4)} ${relativePath}`);
}

if (warnings.length) {
  console.log('');
  console.log('Architecture warning: the files above exceed the 800-line soft limit.');
}

if (importViolations.length) {
  console.log('');
  console.log('Architecture error: upward package imports were found.');
  for (const violation of importViolations) {
    console.log(`ERR  import ${violation.importer} -> ${violation.imported}`);
  }
  process.exitCode = 1;
}

if (forbiddenPathViolations.length) {
  console.log('');
  console.log('Architecture error: forbidden entrypoints still exist.');
  for (const violation of forbiddenPathViolations) {
    console.log(`ERR  forbidden ${violation}`);
  }
  process.exitCode = 1;
}

if (desktopShimViolation) {
  console.log('');
  console.log('Architecture error: the desktop VS Code entrypoint must remain a thin shim over the web host.');
  console.log(`ERR  desktop-shim ${desktopShimViolation}`);
  process.exitCode = 1;
}

async function collectImportViolations() {
  const packageFiles = await listPackageSourceFiles(resolve(repoRoot, 'packages'));
  const violations = [];
  for (const filePath of packageFiles) {
    const source = await readFile(filePath, 'utf8');
    for (const specifier of collectRelativeImportSpecifiers(source)) {
      const resolved = resolve(dirname(filePath), specifier);
      const importerPackage = packageNameForPath(filePath);
      const importedPackage = packageNameForPath(resolved);
      if (!importerPackage || !importedPackage || importerPackage === importedPackage) {
        continue;
      }
      const importerRank = PACKAGE_LAYER_ORDER.get(importerPackage);
      const importedRank = PACKAGE_LAYER_ORDER.get(importedPackage);
      if (importerRank === undefined || importedRank === undefined || importedRank <= importerRank) {
        continue;
      }
      violations.push({
        importer: relative(repoRoot, filePath),
        imported: relative(repoRoot, resolved),
      });
    }
  }
  return violations;
}

async function collectForbiddenPathViolations() {
  const violations = [];
  for (const relativePath of forbiddenLegacyPaths) {
    try {
      await readFile(resolve(repoRoot, relativePath), 'utf8');
      violations.push(relativePath);
    } catch {}
  }
  return violations;
}

async function collectDesktopShimViolation() {
  const source = await readFile(vscodeDesktopShimPath, 'utf8');
  const normalized = source.replace(/\s+/g, ' ').trim();
  const expected = `import { activate as activateWeb, deactivate as deactivateWeb, } from './extension.web.js'; export async function activate(context) { return activateWeb(context); } export function deactivate() { return deactivateWeb(); }`;
  return normalized === expected ? null : relative(repoRoot, vscodeDesktopShimPath);
}

async function listPackageSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listPackageSourceFiles(entryPath));
      continue;
    }
    if (['.js', '.mjs', '.cjs'].includes(extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

function collectRelativeImportSpecifiers(source) {
  const matches = source.matchAll(/(?:from\s+|import\s*\()(['"])(\.[^'"]+)\1/g);
  return [...matches].map((match) => match[2]);
}

function packageNameForPath(filePath) {
  const parts = relative(repoRoot, filePath).split('/');
  return parts[0] === 'packages' ? parts[1] : null;
}
