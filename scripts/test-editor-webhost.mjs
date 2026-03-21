import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  collectUnsupportedRunMainImports,
  getRunMainBlockerMessage,
} from '../vscode/src/runMainSupport.js';
import { createDefaultHostImports } from '../vscode/src/webHostImports.js';
import { compile } from '../compiler/index.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const cases = [
  ['allows plain exported mains', () => {
    expectUndefined(getRunMainBlockerMessage([
      'export fn main() i32 {',
      '    0',
      '}',
    ].join('\n')));
  }],
  ['allows supported built-in es imports', () => {
    expectUndefined(getRunMainBlockerMessage([
      'import extern "es" console_log(str)',
      'import extern "es" math_sqrt(value) f64',
      'export fn main() i32 {',
      '    console_log("ok")',
      '    0',
      '}',
    ].join('\n')));
  }],
  ['blocks synchronous prompt', () => {
    expectEqual(
      getRunMainBlockerMessage('import extern "es" prompt(str) str'),
      'UTU Run Main in the VS Code web host cannot provide synchronous `prompt()`. Use the CLI to run this file.',
    );
  }],
  ['blocks node imports', () => {
    expectEqual(
      getRunMainBlockerMessage('import extern "node:fs" read_file(path) str'),
      'UTU Run Main in the VS Code web host cannot auto-load `node:fs`. Use the CLI to run this file.',
    );
  }],
  ['reports other unsupported imports', () => {
    expectEqual(
      getRunMainBlockerMessage('import extern "es" fetch(url) str'),
      'UTU Run Main in the VS Code web host only supports built-in host imports. This file needs `es:fetch`. Use the CLI to run this file.',
    );
  }],
  ['collects unsupported imports precisely', () => {
    expectDeepEqual(
      collectUnsupportedRunMainImports([
        'import extern "es" console_log(str)',
        'import extern "es" prompt(str) str',
        'import extern "node:fs" read_file(path) str',
      ].join('\n')),
      [
        { module: 'es', name: 'prompt' },
        { module: 'node:fs', name: 'read_file' },
      ],
    );
  }],
  ['instantiates benchmark modules with module-shaped es imports', async () => {
    const logs = [];
    const source = [
      'import extern "es" console_log(str)',
      '',
      'bench "smoke" |i| {',
      '    setup {',
      '        measure {',
      '            "ok" -o console_log',
      '            i',
      '        }',
      '    }',
      '}',
    ].join('\n');

    const result = await compile(source, {
      mode: 'bench',
      runtimeWasmUrl: await readFile(resolve(repoRoot, 'vscode/web-tree-sitter.wasm')),
      wasmUrl: await readFile(resolve(repoRoot, 'vscode/tree-sitter-utu.wasm')),
    });
    const module = await importGeneratedModule(result.js);
    const exports = await module.instantiate(createDefaultHostImports((line) => {
      logs.push(line);
    }));
    const benchExport = result.metadata.benches[0]?.exportName;

    if (!benchExport) {
      throw new Error('Expected benchmark export metadata.');
    }

    const value = await exports[benchExport](3);
    expectUndefined(value);
    expectDeepEqual(logs, ['ok', 'ok', 'ok']);
  }],
];

let failed = false;

for (const [name, run] of cases) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL ${name}`);
    console.log(`  ${String(error instanceof Error ? error.message : error)}`);
  }
}

if (failed) {
  process.exit(1);
}

function expectUndefined(value) {
  if (value !== undefined) {
    throw new Error(`Expected undefined, received ${JSON.stringify(value)}`);
  }
}

function expectEqual(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function expectDeepEqual(actual, expected) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}

async function importGeneratedModule(source) {
  const dir = await mkdtemp(resolve(tmpdir(), 'utu-webhost-test-'));
  const file = resolve(dir, 'module.mjs');

  try {
    await writeFile(file, source, 'utf8');
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}
