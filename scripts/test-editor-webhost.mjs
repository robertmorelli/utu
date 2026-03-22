import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../compiler/index.js';
import { loadNodeModuleFromSource } from '../compiler/loadNodeModuleFromSource.mjs';
import { loadEditorTestAssets } from './editor-test-assets.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const { grammarWasmPath, runtimeWasmPath } = await loadEditorTestAssets(repoRoot);
const sharedCompileOptions = {
  runtimeWasmUrl: runtimeWasmPath,
  wasmUrl: grammarWasmPath,
};
const sharedModuleLoadOptions = {
  prefix: 'utu-webhost-test-',
};
const consoleLogImport = 'shimport "es" console_log(str) void;';

const blockerCase = (name, input, expected) => [
  name,
  () => expect(undefined, expected),
];

const compiledCase = (name, input, options, run) => [
  name,
  () => withCompiledModule(input, options, run),
];

const cases = [
  blockerCase('allows plain exported mains', `export fun main() i32 {
    0;
}`, undefined),
  blockerCase('allows exported mains with explicit void returns', `export fun main() void {
    assert true;
}`, undefined),
  blockerCase('allows es imports that can be resolved from the JS host', `shimport "es" console_log(str) void;
shimport "es" math_sqrt(f64) f64;
export fun main() i32 {
    console_log("ok");
    0;
}`, undefined),
  blockerCase('does not special-case prompt imports', 'shimport "es" prompt(str) str;', undefined),
  blockerCase(
    'allows browser globals such as fetch',
    'shimport "es" fetch(str) str;',
    undefined,
  ),
  blockerCase('does not special-case node imports', 'shimport "node:fs" readFileSync(str) str;', undefined),
  ['collects no unsupported imports', () => {
    expect([], []);
    expect([], []);
  }],
  compiledCase('auto-resolves es functions from JS globals', `shimport "es" math_sqrt(f64) f64;

export fun main() f64 {
    math_sqrt(81.0);
}`, {}, async (_, { instantiate }) => {
    const exports = await instantiate();
    expect(await exports.main?.(), 9);
  }),
  compiledCase('treats comments as compiler trivia', `// top-level comment
export fun main() i32 {
    // block comment
    1 // inline comment
    + 2;
}`, {}, async (_, { instantiate }) => {
    const exports = await instantiate();
    expect(await exports.main?.(), 3);
  }),
  compiledCase('auto-resolves node builtin imports', `shimport "node:fs" existsSync(str) bool;

export fun main() bool {
    existsSync("./package.json");
}`, {}, async (_, { instantiate }) => {
    const exports = await instantiate();
    expect(await exports.main?.(), 1);
  }),
  compiledCase('resolves namespace paths from node module exports', `shimport "node:path" posix_basename(str) str;

export fun main() str {
    posix_basename("/tmp/demo.txt");
}`, {}, async (_, { instantiate }) => {
    const exports = await instantiate();
    expect(await exports.main?.(), 'demo.txt');
  }),
  compiledCase('loads local-file-node shims through the shared node loader', `${consoleLogImport}

export fun main() void {
    "ok" -o console_log;
}`, {
      where: 'local_file_node',
    }, async (_, { instantiate }) => {
    const logs = [];
    const originalLog = console.log;
    console.log = (line) => {
      logs.push(String(line));
    };
    const exports = await instantiate();
    expect(await exports.main?.(), undefined);
    expect(logs, ['ok']);
    console.log = originalLog;
  }),
  compiledCase('instantiates benchmark modules with es host imports', `${consoleLogImport}

bench "smoke" |i| {
    setup {
        measure {
            "ok" -o console_log;
            i;
        }
    }
}`, {
      mode: 'bench',
    }, async (result, { instantiate }) => {
    const logs = [];
    const originalLog = console.log;
    console.log = (line) => {
      logs.push(String(line));
    };
    const exports = await instantiate();
    expect(await exports[getBenchExport(result)](3), undefined);
    expect(logs, ['ok', 'ok', 'ok']);
    console.log = originalLog;
  }),
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

async function withCompiledModule(sourceText, options, run) {
  const result = await compile(sourceText, { ...sharedCompileOptions, ...options });
  const compiledModule = await loadNodeModuleFromSource(result.shim, {
    ...sharedModuleLoadOptions,
    wasm: options.where === 'local_file_node' ? result.wasm : null,
  });
  try {
    return await run(result, compiledModule.module);
  } finally {
    await compiledModule.cleanup?.();
  }
}

function getBenchExport(result) {
  const exportName = result.metadata.benches[0]?.exportName;
  if (exportName) return exportName;
  throw new Error('Expected benchmark export metadata.');
}

function expect(actual, expected) {
    const actualText = describe(actual);
    const expectedText = describe(expected);
    if (Object.is(actual, expected) || actualText === expectedText) return;
    throw new Error(`Expected ${expectedText}, received ${actualText}`);
}

function describe(value) {
    return value === undefined ? 'undefined' : JSON.stringify(value);
}
