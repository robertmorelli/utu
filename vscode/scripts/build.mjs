import { context, build } from 'esbuild';
import { cp, mkdir, rm, watch } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const extensionRoot = resolve(__dirname, '..');
const compilerSourceRoot = resolve(extensionRoot, '../compiler');
const generatedRoot = resolve(extensionRoot, '.generated');
const generatedCompilerRoot = resolve(generatedRoot, 'compiler');
const watchMode = process.argv.includes('--watch');

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  sourcemap: 'linked',
  sourcesContent: false,
  logLevel: 'info',
};

const configs = [
  {
    ...shared,
    entryPoints: [resolve(extensionRoot, 'src/extension.ts')],
    outfile: resolve(extensionRoot, 'dist/extension.js'),
    format: 'cjs',
    external: ['vscode', 'web-tree-sitter/web-tree-sitter.wasm'],
  },
  {
    ...shared,
    entryPoints: [resolve(generatedCompilerRoot, 'index.js')],
    outfile: resolve(extensionRoot, 'dist/compiler.mjs'),
    format: 'esm',
    external: ['binaryen', 'web-tree-sitter'],
  },
];

let compilerSyncTimer;

async function syncCompilerSources() {
  await mkdir(generatedRoot, { recursive: true });
  await rm(generatedCompilerRoot, { recursive: true, force: true });
  await cp(compilerSourceRoot, generatedCompilerRoot, { recursive: true });
}

async function rebuildCompilerSnapshot(compilerContext) {
  await syncCompilerSources();
  await compilerContext.rebuild();
}

if (watchMode) {
  await syncCompilerSources();
  const contexts = await Promise.all(configs.map((config) => context(config)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  const compilerContext = contexts[1];
  const compilerWatcher = watch(compilerSourceRoot, { recursive: true });

  const closeWatcher = async () => {
    await compilerWatcher.return?.();
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

  (async () => {
    for await (const _event of compilerWatcher) {
      if (compilerSyncTimer) clearTimeout(compilerSyncTimer);
      compilerSyncTimer = setTimeout(() => {
        void rebuildCompilerSnapshot(compilerContext);
      }, 75);
    }
  })().catch((error) => {
    console.error('Compiler snapshot watcher failed:', error);
  });

  console.log('Watching UTU extension sources...');
  await new Promise(() => {});
} else {
  await syncCompilerSources();
  await Promise.all(configs.map((config) => build(config)));
}
