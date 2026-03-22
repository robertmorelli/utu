import { spawn } from 'node:child_process';
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { getRepoRoot } from './test-helpers.mjs';

const extensionRoot = getRepoRoot(import.meta.url);
const compilerSourceRoot = extensionRoot;
const cliEntry = resolve(extensionRoot, 'cli.mjs');
const cliPackageRoot = resolve(extensionRoot, 'dist/cli-package');
const cliBinaryPath = resolve(extensionRoot, 'utu');
const lspEntry = resolve(extensionRoot, 'lsp.mjs');
const lspBinaryPath = resolve(extensionRoot, 'utu-lsp');
const vsceBinaryPath = resolve(extensionRoot, 'node_modules/.bin/vsce');
const treeSitterBinaryPath = resolve(extensionRoot, 'node_modules/.bin/tree-sitter');
const treeSitterRuntimeSource = resolve(extensionRoot, 'node_modules/web-tree-sitter/web-tree-sitter.wasm');
const treeSitterRuntimeDest = resolve(extensionRoot, 'web-tree-sitter.wasm');
const grammarDest = resolve(extensionRoot, 'tree-sitter-utu.wasm');
const grammarSourcePath = resolve(extensionRoot, 'grammar.cjs');
const grammarCompatPath = resolve(extensionRoot, 'grammar.js');
const grammarSourceInputs = [grammarSourcePath];
const compilerInputRoots = [compilerSourceRoot];
const staticAssetInputs = [treeSitterRuntimeSource, grammarDest];
const ignoredWatchEntries = new Set([
  '.git',
  'node_modules',
  'dist',
  'tree-sitter-utu.wasm',
  'web-tree-sitter.wasm',
]);
const watchMode = process.argv.includes('--watch');
const watchMessages = { start: 'Watching UTU extension sources...', ready: 'UTU_EXTENSION_READY' };
const browserDefine = {
  ['global' + 'This.process']: 'undefined',
};

const sharedBuildOptions = {
  bundle: true,
  sourcemap: 'linked',
  sourcesContent: false,
  logLevel: 'info',
};
const activeTargets = [
  createTarget('extension', {
    platform: 'browser',
    target: 'esnext',
    entryPoints: [resolve(extensionRoot, 'extension/extension.web.js')],
    outfile: resolve(extensionRoot, 'dist/web/extension.js'),
    format: 'cjs',
    external: ['vscode', 'fs', 'fs/promises', 'module', 'os', 'path', 'url'],
    loader: {
      '.wasm': 'binary',
    },
  }),
  createTarget('compiler-web', {
    platform: 'browser',
    target: 'esnext',
    entryPoints: [resolve(compilerSourceRoot, 'index.js')],
    outfile: resolve(extensionRoot, 'dist/compiler.web.mjs'),
    format: 'esm',
    external: ['fs', 'fs/promises', 'module', 'path', 'url'],
    define: browserDefine,
    loader: {
      '.wasm': 'binary',
    },
  }),
  createTarget('compiler-node', {
    platform: 'node',
    target: 'esnext',
    entryPoints: [resolve(compilerSourceRoot, 'index.js')],
    outfile: resolve(extensionRoot, 'dist/compiler.mjs'),
    format: 'esm',
    external: ['binaryen', 'web-tree-sitter'],
    loader: {
      '.wasm': 'binary',
    },
  }),
];

if (watchMode) console.log(watchMessages.start);
if (!watchMode) await resetBuildArtifacts();
await syncAssets();

if (!watchMode) {
  await Promise.all(activeTargets.map(({ config }) => build(config)));
  await Promise.all(activeTargets.map(postprocessBundle));
  await buildAllArtifacts();
} else {
  const tracker = createWatchTracker(activeTargets.length, watchMessages.ready);
  const contexts = await Promise.all(activeTargets.map(({ label, config }) => context(withWatchReadyPlugin(config, label, tracker))));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  await Promise.all(activeTargets.map(postprocessBundle));
  await buildAllArtifacts();
  const stopWatching = await watchCompilerInputs(contexts.slice(1));
  const close = async () => {
    await stopWatching();
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
  };
  const signalHandler = async () => {
    await close();
    process.exit(0);
  };
  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);
  await new Promise(() => {});
}

function createTarget(label, config) {
  return {
    label,
    outfile: config.outfile,
    config: {
      ...sharedBuildOptions,
      ...config,
    },
  };
}

async function postprocessBundle(target) {
  if (!target.outfile) return;
  const source = await readFile(target.outfile, 'utf8');
  if (!source.includes('Uint8Array.fromBase64(')) return;
  const helper = `const __utuFromBase64 = (input) => {
  if (typeof Uint8Array.fromBase64 === "function") return Uint8Array.fromBase64(input);
  const decode = typeof atob === "function"
    ? atob
    : (value) => Buffer.from(value, "base64").toString("binary");
  const binary = decode(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

`;
  await writeFile(target.outfile, helper + source.replaceAll('Uint8Array.fromBase64(', '__utuFromBase64('), 'utf8');
}


function createWatchTracker(expectedCount, readyMessage) {
  return {
    completedLabels: new Set(),
    expectedCount,
    readyLogged: false,
    readyMessage,
  };
}

function withWatchReadyPlugin(config, label, tracker) {
  return {
    ...config,
    plugins: [...(config.plugins ?? []), createWatchReadyPlugin(label, tracker)],
  };
}

function createWatchReadyPlugin(label, tracker) {
  return {
    name: `watch-ready:${label}`,
    setup(buildContext) {
      buildContext.onEnd(({ errors }) => {
        if (errors.length > 0 || tracker.readyLogged || tracker.completedLabels.has(label)) return;
        tracker.completedLabels.add(label);
        if (tracker.completedLabels.size === tracker.expectedCount) {
          tracker.readyLogged = true;
          console.log(tracker.readyMessage);
        }
      });
    },
  };
}

async function syncAssets() {
  await Promise.all([cp(treeSitterRuntimeSource, treeSitterRuntimeDest), syncGrammarArtifact()]);
}

async function resetBuildArtifacts() {
  await Promise.all([
    rm(resolve(extensionRoot, 'dist'), { recursive: true, force: true }),
    rm(cliBinaryPath, { force: true }),
    rm(lspBinaryPath, { force: true }),
    rm(treeSitterRuntimeDest, { force: true }),
    rm(grammarDest, { force: true }),
  ]);
}

async function buildCli() {
  await mkdir(resolve(extensionRoot, 'dist'), { recursive: true });
  await rm(cliPackageRoot, { recursive: true, force: true });
  await exec('bun', ['build', '--target=bun', '--outdir', cliPackageRoot, cliEntry]);
  await exec('bun', ['build', '--compile', '--target=bun', '--outfile', cliBinaryPath, cliEntry]);
}

async function buildLsp() {
  await mkdir(resolve(extensionRoot, 'dist'), { recursive: true });
  await exec('bun', ['build', '--compile', '--target=bun', '--outfile', lspBinaryPath, lspEntry]);
}

async function buildAllArtifacts() {
  await buildCli();
  await buildLsp();
  await packageVsix();
}

async function packageVsix() {
  try {
    const stats = await stat(vsceBinaryPath);
    if (!stats.isFile()) throw new Error('not a file');
  } catch {
    throw new Error('VSIX packaging is part of `bun run build`, but local `node_modules/.bin/vsce` is missing. Install `@vscode/vsce` locally so build can package without hanging on `npx`.');
  }

  await sanitizeVsceInputs();
  await exec(vsceBinaryPath, ['package', '--no-dependencies', '--out', resolve(extensionRoot, `dist/utu-vscode-${process.env.npm_package_version ?? '0.0.0'}.vsix`)]);
}

async function sanitizeVsceInputs() {
  if (process.platform !== 'darwin') return;

  try {
    await exec('xattr', ['-rc', resolve(extensionRoot, 'dist'), treeSitterRuntimeDest, grammarDest]);
  } catch (error) {
    console.warn('Failed to clear macOS extended attributes before VSIX packaging:', error);
  }
}

async function syncGrammarArtifact() {
  await ensureGrammarArtifact({ force: true });
  await findFreshestFile([grammarDest]);
}

async function ensureGrammarArtifact({ force = false } = {}) {
  const [freshestSource, freshestArtifact] = await Promise.all([
    findFreshestFile(grammarSourceInputs),
    findFreshestFile([grammarDest]).catch(() => null),
  ]);
  const sourceStats = await stat(freshestSource);
  const artifactStats = freshestArtifact ? await stat(freshestArtifact) : null;
  if (force || !artifactStats || artifactStats.mtimeMs < sourceStats.mtimeMs) {
    await buildGrammar();
  }
}

async function buildGrammar() {
  await writeFile(grammarCompatPath, "import grammarDefinition from './grammar.cjs';\nexport default grammarDefinition;\n", 'utf8');
  try {
    await exec(treeSitterBinaryPath, ['generate']);
    await exec(treeSitterBinaryPath, ['build', '--wasm']);
  } finally {
    await rm(grammarCompatPath, { force: true });
  }
}

async function findFreshestFile(paths) {
  const candidates = (await Promise.all(paths.map(async (path) => {
    try {
      const details = await stat(path);
      return details.isFile() ? { path, mtimeMs: details.mtimeMs } : null;
    } catch {
      return null;
    }
  }))).filter(Boolean);
  if (!candidates.length) throw new Error('Could not find tree-sitter-utu.wasm. Run `bun run build` from the repo root.');
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0].path;
}

async function watchCompilerInputs(compilerContexts) {
  let compilerState = await snapshotState(compilerInputRoots, { recursive: true });
  let assetState = await snapshotState(staticAssetInputs);
  let grammarSourceState = await snapshotState(grammarSourceInputs);
  let syncTimer;
  let polling = false;
  let grammarBuild = Promise.resolve();

  const poller = setInterval(() => {
    if (polling) return;
    polling = true;

    void (async () => {
      try {
        const [nextCompilerState, nextAssetState, nextGrammarSourceState] = await Promise.all([
          snapshotState(compilerInputRoots, { recursive: true }),
          snapshotState(staticAssetInputs),
          snapshotState(grammarSourceInputs),
        ]);

        if (nextGrammarSourceState !== grammarSourceState) {
          grammarSourceState = nextGrammarSourceState;
          grammarBuild = grammarBuild.then(async () => {
            await ensureGrammarArtifact();
          }).catch((error) => {
            console.error('Grammar rebuild failed:', error);
          });
          await grammarBuild;
        }

        if (nextCompilerState !== compilerState) {
          compilerState = nextCompilerState;
          if (syncTimer) clearTimeout(syncTimer);
          syncTimer = setTimeout(() => {
            void Promise.all([...compilerContexts.map((ctx) => ctx.rebuild()), buildAllArtifacts()]).catch((error) => {
              console.error('Compiler bundle rebuild failed:', error);
            });
          }, 75);
        }

        if (nextAssetState !== assetState) {
          assetState = nextAssetState;
          await syncAssets();
          await buildAllArtifacts();
        }
      } catch (error) {
        console.error('Compiler input polling failed:', error);
      } finally {
        polling = false;
      }
    })();
  }, 250);

  return async () => {
    clearInterval(poller);
    if (syncTimer) clearTimeout(syncTimer);
  };
}

async function snapshotState(paths, options) {
  return (await snapshotPaths(paths, options)).join('|');
}

async function snapshotPaths(paths, { recursive = false } = {}) {
  return (await Promise.all(paths.map((path) => snapshotPath(path, recursive)))).flat();
}

async function snapshotPath(path, recursive) {
  try {
    const details = await stat(path);
    if (details.isDirectory()) {
      if (!recursive) return [];
      const entries = await readdir(path, { withFileTypes: true });
      return (await Promise.all(entries
        .sort((left, right) => left.name.localeCompare(right.name))
        .filter((entry) => !ignoredWatchEntries.has(entry.name))
        .map((entry) => snapshotPath(resolve(path, entry.name), true)))).flat();
    }
    return details.isFile() ? [`${path}:${details.size}:${details.mtimeMs}`] : [];
  } catch {
    return [];
  }
}

function exec(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', rejectPromise);
    child.on('exit', (code) => code === 0 ? resolvePromise() : rejectPromise(new Error(`${command} exited with code ${code ?? 1}`)));
  });
}
