import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compile } from '../compiler/index.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const options = parseArgs(process.argv.slice(2));
const manifestPath = resolve(process.cwd(), options.manifest ?? 'examples/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const wasmPath = resolve(repoRoot, manifest.wasmPath ?? 'cli_artifact/tree-sitter-utu.wasm');
const selectedTags = new Set(options.tags);

const cases = manifest.cases.filter((testCase) => {
    if (selectedTags.size === 0) return true;
    return testCase.tags?.some((tag) => selectedTags.has(tag));
});

if (cases.length === 0) {
    console.error(`No example cases matched for manifest ${manifestPath}`);
    process.exit(1);
}

const results = [];
for (const testCase of cases) {
    const startedAt = Date.now();
    const result = await runCase(testCase, wasmPath).catch((error) => makeFailureResult(testCase, error));
    result.durationMs = Date.now() - startedAt;
    results.push(result);

    const prefix = result.status === 'passed'
        ? 'PASS'
        : result.status === 'allowed-failure'
            ? 'WARN'
            : 'FAIL';
    const note = result.allowFailure && result.status !== 'failed' ? ' (allowed)' : '';
    console.log(`${prefix} ${result.name}${note} [${result.mode}] ${result.durationMs}ms`);
    if (result.error) console.log(`  ${firstLine(result.error)}`);
    if (result.logs?.length) console.log(`  logs: ${JSON.stringify(result.logs)}`);
}

const requiredFailures = results.filter((result) => result.status === 'failed' && !result.allowFailure);
const allowedFailures = results.filter((result) => result.status === 'allowed-failure');
const report = {
    generatedAt: new Date().toISOString(),
    manifestPath,
    wasmPath,
    summary: {
        total: results.length,
        passed: results.filter((result) => result.status === 'passed').length,
        requiredFailures: requiredFailures.length,
        allowedFailures: allowedFailures.length,
    },
    results,
};

if (options.reportFile) {
    const reportPath = resolve(process.cwd(), options.reportFile);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Report written to ${reportPath}`);
}

console.log('');
console.log(`Summary: ${report.summary.passed}/${report.summary.total} passed, ${report.summary.allowedFailures} allowed failures, ${report.summary.requiredFailures} required failures`);

process.exit(requiredFailures.length > 0 ? 1 : 0);

async function runCase(testCase, wasmPath) {
    const sourcePath = resolve(repoRoot, testCase.path);
    const source = await readFile(sourcePath, 'utf8');
    const compileOptions = {
        wasmUrl: pathToFileURL(wasmPath),
    };
    if (typeof testCase.optimize === 'boolean') compileOptions.optimize = testCase.optimize;

    const { js } = await compile(source, compileOptions);
    const result = {
        name: testCase.name,
        path: testCase.path,
        mode: testCase.mode ?? 'run',
        allowFailure: Boolean(testCase.allowFailure),
        logs: [],
        status: 'passed',
    };

    if ((testCase.mode ?? 'run') === 'compile') return result;

    const moduleDir = await mkdtemp(join(tmpdir(), 'utu-example-'));
    try {
        const modulePath = join(moduleDir, `${sanitizeName(testCase.name)}.mjs`);
        await writeFile(modulePath, js, 'utf8');
        const compiledModule = await import(pathToFileURL(modulePath).href);
        const imports = createHostImports(result.logs);
        const exports = await compiledModule.instantiate(imports);
        const entry = testCase.entry ?? 'main';

        if (typeof exports[entry] !== 'function') {
            throw new Error(`Export "${entry}" was not found on ${testCase.path}`);
        }

        const args = Array.isArray(testCase.args) ? testCase.args : [];
        const returnValue = exports[entry](...args);
        if ('expectedReturn' in testCase) {
            const actual = normalizeValue(returnValue);
            if (!valuesEqual(actual, testCase.expectedReturn)) {
                throw new Error(`Expected return ${JSON.stringify(testCase.expectedReturn)}, got ${JSON.stringify(actual)}`);
            }
            result.returnValue = actual;
        } else if (returnValue !== undefined) {
            result.returnValue = normalizeValue(returnValue);
        }

        if (Array.isArray(testCase.expectedLogs) && !valuesEqual(result.logs, testCase.expectedLogs)) {
            throw new Error(`Expected logs ${JSON.stringify(testCase.expectedLogs)}, got ${JSON.stringify(result.logs)}`);
        }

        return result;
    } finally {
        await rm(moduleDir, { force: true, recursive: true });
    }
}

function makeFailureResult(testCase, error) {
    if (testCase.allowFailure) {
        return {
            name: testCase.name,
            path: testCase.path,
            mode: testCase.mode ?? 'run',
            allowFailure: true,
            logs: [],
            status: 'allowed-failure',
            error: String(error?.message ?? error),
        };
    }

    return {
        name: testCase.name,
        path: testCase.path,
        mode: testCase.mode ?? 'run',
        allowFailure: false,
        logs: [],
        status: 'failed',
        error: String(error?.message ?? error),
    };
}

function createHostImports(logs) {
    return {
        console_log(value) {
            logs.push(String(value));
        },
        wrap(value) {
            return `[${value}]`;
        },
        i64_to_string(value) {
            return String(value);
        },
        f64_to_string(value) {
            return String(value);
        },
        math_sin(value) {
            return Math.sin(value);
        },
        math_cos(value) {
            return Math.cos(value);
        },
        math_sqrt(value) {
            return Math.sqrt(value);
        },
    };
}

function parseArgs(argv) {
    const options = {
        tags: [],
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--manifest':
                options.manifest = argv[++i];
                break;
            case '--report-file':
                options.reportFile = argv[++i];
                break;
            case '--tag':
                options.tags.push(argv[++i]);
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function normalizeValue(value) {
    if (typeof value === 'bigint') return value.toString();
    if (Array.isArray(value)) return value.map(normalizeValue);
    return value;
}

function valuesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function sanitizeName(name) {
    return name.replace(/[^a-z0-9_-]/gi, '_');
}

function firstLine(message) {
    return String(message).split('\n')[0];
}
