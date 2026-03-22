import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from '../index.js';
import { loadNodeModuleFromSource } from '../loadNodeModuleFromSource.mjs';
import { collectCompileJobs, collectUtuFiles, firstLine, getRepoRoot } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);

const options = parseArgs(process.argv.slice(2));
await (options.compileAll ? runCompileAll(options) : runManifestCases(options));

async function runCase(testCase, wasmPath) {
    const sourcePath = resolve(repoRoot, testCase.path);
    const source = await readFile(sourcePath, 'utf8');
    const mode = testCase.mode ?? 'run';
    const compileOptions = {
        wasmUrl: pathToFileURL(wasmPath),
        mode: mode === 'test' ? 'test' : 'program',
    };

    const { shim, metadata } = await compile(source, compileOptions);
    const result = {
        name: testCase.name,
        path: testCase.path,
        mode,
        allowFailure: Boolean(testCase.allowFailure),
        logs: [],
        status: 'passed',
    };

    if (mode === 'compile') return result;

    const compiledModule = await loadNodeModuleFromSource(shim, { prefix: 'utu-example-' });
    try {
        const exports = await compiledModule.module.instantiate();

        if (mode === 'test') {
            if (!metadata.tests.length) throw new Error(`No tests found in ${testCase.path}`);
            if ('expectedTests' in testCase && metadata.tests.length !== testCase.expectedTests) {
                throw new Error(`Expected ${testCase.expectedTests} tests, found ${metadata.tests.length}`);
            }

            for (const { name, exportName } of metadata.tests) {
                if (typeof exports[exportName] !== 'function') {
                    throw new Error(`Missing test export "${exportName}" on ${testCase.path}`);
                }
                try {
                    await exports[exportName]();
                } catch (error) {
                    throw new Error(`Test "${name}" failed: ${firstLine(error?.message ?? error)}`);
                }
            }

            result.testsRun = metadata.tests.length;
            result.testNames = metadata.tests.map((test) => test.name);
            return result;
        }

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
        await compiledModule.cleanup?.();
    }
}

function makeFailureResult(testCase, error) {
    return { name: testCase.name, path: testCase.path, mode: testCase.mode ?? 'run', allowFailure: Boolean(testCase.allowFailure), logs: [], status: testCase.allowFailure ? 'allowed-failure' : 'failed', error: String(error?.message ?? error) };
}

function parseArgs(argv) {
    const options = { tags: [], compileAll: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--compile-all':
                options.compileAll = true;
                break;
            case '--example-root':
                options.exampleRoot = argv[++i];
                break;
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

function normalizeValue(value) { return typeof value === 'bigint' ? value.toString() : Array.isArray(value) ? value.map(normalizeValue) : value; }
function valuesEqual(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

async function runManifestCases(options) {
    const manifestPath = resolve(process.cwd(), options.manifest ?? 'jsondata/examples.manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const wasmPath = resolve(repoRoot, manifest.wasmPath ?? 'tree-sitter-utu.wasm');
    const selectedTags = new Set(options.tags);
    const cases = manifest.cases.filter((testCase) => selectedTags.size === 0 || testCase.tags?.some((tag) => selectedTags.has(tag)));
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
    const report = { generatedAt: new Date().toISOString(), manifestPath, wasmPath, summary: { total: results.length, passed: results.filter((result) => result.status === 'passed').length, requiredFailures: requiredFailures.length, allowedFailures: allowedFailures.length }, results };
    if (options.reportFile) {
        const reportPath = resolve(process.cwd(), options.reportFile);
        await mkdir(dirname(reportPath), { recursive: true });
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        console.log(`Report written to ${reportPath}`);
    }
    console.log('');
    console.log(`Summary: ${report.summary.passed}/${report.summary.total} passed, ${report.summary.allowedFailures} allowed failures, ${report.summary.requiredFailures} required failures`);
    process.exit(requiredFailures.length > 0 ? 1 : 0);
}

async function runCompileAll(options) {
    const exampleRoot = resolve(repoRoot, options.exampleRoot ?? 'examples');
    const wasmUrl = pathToFileURL(resolve(repoRoot, 'tree-sitter-utu.wasm'));
    const files = (await collectUtuFiles(exampleRoot)).sort();
    let failed = false;

    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const rel = relative(repoRoot, file);

        for (const { mode } of collectCompileJobs(source)) {
            try {
                const { metadata } = await compile(source, { wasmUrl, mode });
                const details = mode === 'test'
                    ? ` ${metadata.tests.length} tests`
                    : mode === 'bench'
                        ? ` ${metadata.benches.length} benches`
                        : '';
                console.log(`PASS ${rel} [${mode}]${details}`);
            } catch (error) {
                failed = true;
                console.log(`FAIL ${rel} [${mode}]`);
                console.log(`  ${firstLine(error?.message ?? error)}`);
            }
        }
    }

    if (failed) process.exit(1);
}
