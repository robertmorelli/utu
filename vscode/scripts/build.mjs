import { context, build } from 'esbuild';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const extensionRoot = resolve(__dirname, '..');
const compilerSourceRoot = resolve(extensionRoot, '../compiler');
const generatedRoot = resolve(extensionRoot, '.generated');
const generatedCompilerRoot = resolve(generatedRoot, 'compiler');
const treeSitterRuntimeSource = resolve(extensionRoot, '../node_modules/web-tree-sitter/web-tree-sitter.wasm');
const treeSitterRuntimeDest = resolve(extensionRoot, 'web-tree-sitter.wasm');
const watchMode = process.argv.includes('--watch');
const webOnlyMode = process.argv.includes('--web-only');
const watchStartMessage = webOnlyMode
  ? 'Watching UTU web extension sources...'
  : 'Watching UTU extension sources...';
const watchReadyMessage = webOnlyMode
  ? 'UTU_WEB_EXTENSION_READY'
  : 'UTU_EXTENSION_READY';
const sharedBuildOptions = {
  bundle: true,
  sourcemap: 'linked',
  sourcesContent: false,
  logLevel: 'info',
};

function createWatchReadyPlugin(label, tracker) {
  return {
    name: `watch-ready:${label}`,
    setup(buildContext) {
      buildContext.onEnd((result) => {
        if (result.errors.length > 0 || tracker.readyLogged || tracker.completedLabels.has(label)) {
          return;
        }

        tracker.completedLabels.add(label);
        if (tracker.completedLabels.size === tracker.expectedCount) {
          tracker.readyLogged = true;
          console.log(tracker.readyMessage);
        }
      });
    },
  };
}

const extensionConfig = {
  ...sharedBuildOptions,
  platform: 'browser',
  target: 'esnext',
  entryPoints: [resolve(extensionRoot, 'src/extension.ts')],
  outfile: resolve(extensionRoot, 'dist/web/extension.js'),
  format: 'cjs',
  external: ['vscode', 'fs', 'fs/promises', 'module', 'path', 'url'],
};

const compilerWebConfig = {
  ...sharedBuildOptions,
  platform: 'browser',
  target: 'esnext',
  entryPoints: [resolve(generatedCompilerRoot, 'index.js')],
  outfile: resolve(extensionRoot, 'dist/compiler.web.mjs'),
  format: 'esm',
  external: ['fs', 'fs/promises', 'module', 'path', 'url'],
};

const compilerNodeConfig = {
  ...sharedBuildOptions,
  platform: 'node',
  target: 'esnext',
  entryPoints: [resolve(generatedCompilerRoot, 'index.js')],
  outfile: resolve(extensionRoot, 'dist/compiler.mjs'),
  format: 'esm',
  external: ['binaryen', 'web-tree-sitter'],
};

function createBuildConfigs() {
  if (!watchMode) {
    return webOnlyMode
      ? [extensionConfig, compilerWebConfig]
      : [extensionConfig, compilerWebConfig, compilerNodeConfig];
  }

  const watchTracker = {
    completedLabels: new Set(),
    expectedCount: webOnlyMode ? 2 : 3,
    readyLogged: false,
    readyMessage: watchReadyMessage,
  };

  const attachPlugin = (config, label) => ({
    ...config,
    plugins: [...(config.plugins ?? []), createWatchReadyPlugin(label, watchTracker)],
  });

  return webOnlyMode
    ? [
        attachPlugin(extensionConfig, 'extension'),
        attachPlugin(compilerWebConfig, 'compiler-web'),
      ]
    : [
        attachPlugin(extensionConfig, 'extension'),
        attachPlugin(compilerWebConfig, 'compiler-web'),
        attachPlugin(compilerNodeConfig, 'compiler-node'),
      ];
}

const configs = createBuildConfigs();

let compilerSyncTimer;

async function syncCompilerSources() {
  await mkdir(generatedRoot, { recursive: true });
  await rm(generatedCompilerRoot, { recursive: true, force: true });
  await cp(compilerSourceRoot, generatedCompilerRoot, { recursive: true });
}

async function syncParserRuntime() {
  await cp(treeSitterRuntimeSource, treeSitterRuntimeDest);
}

async function prepareAssets() {
  await syncParserRuntime();
  await syncCompilerSources();
}

async function rebuildCompilerSnapshot(compilerContexts) {
  await syncCompilerSources();
  await Promise.all(compilerContexts.map((compilerContext) => compilerContext.rebuild()));
}

async function snapshotCompilerSources(root = compilerSourceRoot) {
  const entries = await readdir(root, { withFileTypes: true });
  const snapshot = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = resolve(root, entry.name);

    if (entry.isDirectory()) {
      snapshot.push(...(await snapshotCompilerSources(entryPath)));
      continue;
    }

    if (!entry.isFile()) continue;

    const { mtimeMs, size } = await stat(entryPath);
    snapshot.push(`${entryPath}:${size}:${mtimeMs}`);
  }

  return snapshot;
}

if (watchMode) {
  console.log(watchStartMessage);
  await prepareAssets();
  const contexts = await Promise.all(configs.map((config) => context(config)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  const compilerContexts = webOnlyMode ? [contexts[1]] : [contexts[1], contexts[2]];
  let compilerSourceState = (await snapshotCompilerSources()).join('|');
  let compilerPollInFlight = false;
  const compilerPoller = setInterval(() => {
    if (compilerPollInFlight) return;
    compilerPollInFlight = true;

    void (async () => {
      try {
        const nextState = (await snapshotCompilerSources()).join('|');

        if (nextState !== compilerSourceState) {
          compilerSourceState = nextState;
          if (compilerSyncTimer) clearTimeout(compilerSyncTimer);
          compilerSyncTimer = setTimeout(() => {
            void rebuildCompilerSnapshot(compilerContexts).catch((error) => {
              console.error('Compiler snapshot rebuild failed:', error);
            });
          }, 75);
        }
      } catch (error) {
        console.error('Compiler snapshot polling failed:', error);
      } finally {
        compilerPollInFlight = false;
      }
    })();
  }, 250);

  const closeWatcher = async () => {
    clearInterval(compilerPoller);
    if (compilerSyncTimer) clearTimeout(compilerSyncTimer);
    for (const ctx of contexts) {
      await ctx.dispose();
    }
  };

  const signalHandler = async () => {
    await closeWatcher();
    process.exit(0);
  };

  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);

  await new Promise(() => {});
} else {
  await prepareAssets();
  await Promise.all(configs.map((config) => build(config)));
}
