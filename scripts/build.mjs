import { build, context } from 'esbuild';
import { cp, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerSourceRoot = resolve(extensionRoot, 'compiler');
const treeSitterRuntimeSource = resolve(extensionRoot, 'node_modules/web-tree-sitter/web-tree-sitter.wasm');
const treeSitterRuntimeDest = resolve(extensionRoot, 'web-tree-sitter.wasm');
const grammarDest = resolve(extensionRoot, 'tree-sitter-utu.wasm');
const compilerInputRoots = [compilerSourceRoot];
const staticAssetInputs = [treeSitterRuntimeSource, grammarDest];
const watchMode = process.argv.includes('--watch');
const webOnlyMode = process.argv.includes('--web-only');
const watchMessages = webOnlyMode
  ? { start: 'Watching UTU web extension sources...', ready: 'UTU_WEB_EXTENSION_READY' }
  : { start: 'Watching UTU extension sources...', ready: 'UTU_EXTENSION_READY' };

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
    entryPoints: [resolve(extensionRoot, 'extension/extension.js')],
    outfile: resolve(extensionRoot, 'dist/web/extension.js'),
    format: 'cjs',
    external: ['vscode', 'fs', 'fs/promises', 'module', 'path', 'url'],
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
  }),
  !webOnlyMode && createTarget('compiler-node', {
    platform: 'node',
    target: 'esnext',
    entryPoints: [resolve(compilerSourceRoot, 'index.js')],
    outfile: resolve(extensionRoot, 'dist/compiler.mjs'),
    format: 'esm',
    external: ['binaryen', 'web-tree-sitter'],
  }),
].filter(Boolean);

if (watchMode) console.log(watchMessages.start);
await syncAssets();

if (!watchMode) {
  await Promise.all(activeTargets.map(({ config }) => build(config)));
} else {
  const tracker = createWatchTracker(activeTargets.length, watchMessages.ready);
  const contexts = await Promise.all(activeTargets.map(({ label, config }) => context(withWatchReadyPlugin(config, label, tracker))));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
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
    config: {
      ...sharedBuildOptions,
      ...config,
    },
  };
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
  await Promise.all([
    cp(treeSitterRuntimeSource, treeSitterRuntimeDest),
    syncGrammarArtifact(),
  ]);
}

async function syncGrammarArtifact() {
  await findFreshestFile([grammarDest]);
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

  if (!candidates.length) {
    throw new Error(
      'Could not find tree-sitter-utu.wasm. Run `bun run grammar` from the repo root.',
    );
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0].path;
}

async function watchCompilerInputs(compilerContexts) {
  let compilerState = await snapshotState(compilerInputRoots, { recursive: true });
  let assetState = await snapshotState(staticAssetInputs);
  let syncTimer;
  let polling = false;

  const poller = setInterval(() => {
    if (polling) return;
    polling = true;

    void (async () => {
      try {
        const [nextCompilerState, nextAssetState] = await Promise.all([
          snapshotState(compilerInputRoots, { recursive: true }),
          snapshotState(staticAssetInputs),
        ]);

        if (nextCompilerState !== compilerState) {
          compilerState = nextCompilerState;
          if (syncTimer) clearTimeout(syncTimer);
          syncTimer = setTimeout(() => {
            void Promise.all(compilerContexts.map((ctx) => ctx.rebuild())).catch((error) => {
              console.error('Compiler bundle rebuild failed:', error);
            });
          }, 75);
        }

        if (nextAssetState !== assetState) {
          assetState = nextAssetState;
          await syncAssets();
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
        .map((entry) => snapshotPath(resolve(path, entry.name), true)))).flat();
    }
    return details.isFile() ? [`${path}:${details.size}:${details.mtimeMs}`] : [];
  } catch {
    return [];
  }
}
