import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { compile } from '../index.js';
import { loadNodeModuleFromSource } from '../loadNodeModuleFromSource.mjs';
import { collectCompileJobs, collectUtuFiles, firstLine, getRepoRoot, runCli, runNamedCases } from './test-helpers.mjs';

const repoRoot = getRepoRoot(import.meta.url);
const CLI_CASES = [
    ['assert-pass', ['run', 'examples/ci/assert_pass.utu'], 0, 'ok'], ['assert-fail', ['run', 'examples/ci/assert_fail.utu'], 1, 'Unreachable code'],
    ['tests-basic', ['test', 'examples/ci/tests_basic.utu'], 0, 'PASS adds two numbers'], ['tests-codegen-surface', ['test', 'examples/ci/codegen_test_surface.utu'], 0, 'PASS top-level tests become synthesized exports'],
    ['tests-nullable', ['test', 'examples/ci/codegen_nullable.utu'], 0, 'PASS else fallback runs on null'], ['tests-string-builtins', ['test', 'examples/ci/node_builtin_imports.utu'], 0, 'PASS string helpers work without legacy builtins'],
    ['tests-globals', ['test', 'examples/ci/codegen_globals.utu'], 0, 'PASS top-level numeric globals lower to global.get'], ['tests-scalar-match', ['test', 'examples/ci/codegen_scalar_match.utu'], 0, 'PASS float match can take a specific arm'],
    ['tests-alt-fallback', ['test', 'examples/ci/codegen_alt_fallback.utu'], 0, 'PASS alt fallback can bind and forward the unmatched value'], ['tests-fail', ['test', 'examples/ci/tests_fail.utu'], 1, 'FAIL fails'],
    ['compile-bad-return-type', ['compile', 'scripts/fixtures/compile_bad_return_type.utu'], 1, 'function at index 0'], ['compile-bad-call-args', ['compile', 'scripts/fixtures/compile_bad_call_args.utu'], 1, 'call param types must match'],
    ['compile-nullability-mismatch', ['compile', 'scripts/fixtures/compile_nullability_mismatch.utu'], 1, 'function body type must match'], ['compile-illegal-global-init', ['compile', 'scripts/fixtures/compile_illegal_global_init.utu'], 1, 'global init must be constant'],
    ['compile-bad-pipe-placeholders', ['compile', 'scripts/fixtures/compile_bad_pipe_placeholders.utu'], 1, 'Parse errors:'], ['run-break-and-call', ['run', 'examples/ci/codegen_break_and_call.utu'], 0, '42'],
    ['run-call-simple', ['run', 'examples/call_simple.utu'], 0, '177280'], ['run-fannkuch', ['run', 'examples/fannkuch.utu'], 0, '10'],
    ['run-float', ['run', 'examples/float.utu'], 0, '0.8944271901453098'], ['run-hello-name', ['run', 'examples/hello_name.utu'], 0, 'hello utu'],
    ['run-spectralnorm', ['run', 'examples/spectralnorm.utu'], 0, '1.2742222097429006'], ['run-deltablue', ['run', 'examples/deltablue.utu'], 0, '0'],
    ['bench-basic', ['bench', 'examples/bench/bench_basic.utu', '--seconds', '0.01', '--samples', '1', '--warmup', '0'], 0, 'sum loop:'], ['bench-codegen-surface', ['bench', 'examples/ci/codegen_test_surface.utu', '--seconds', '0.01', '--samples', '1', '--warmup', '0'], 0, 'increment loop:'],
];
const CLI_BENCH_EXAMPLE_CASES = [['call-simple', 'examples/call_simple.utu', ['call-simple chain:']], ['deltablue', 'examples/deltablue.utu', ['deltablue_chain:', 'deltablue_projection:']], ['fannkuch', 'examples/fannkuch.utu', ['fannkuch:']], ['float', 'examples/float.utu', ['float normalize:']], ['hello-name', 'examples/hello_name.utu', ['hello-name format:']], ['spectralnorm', 'examples/spectralnorm.utu', ['spectralnorm:']]];

const options = parseArgs(process.argv.slice(2));
await (options.cliSmoke ? runCliCases(options.cliBenchExamples) : options.compileAll ? runCompileAll(options) : runManifestCases(options));

async function runCase(testCase) {
    const source = await readFile(resolve(repoRoot, testCase.path), 'utf8');
    const mode = testCase.mode ?? 'run';
    const { shim, metadata } = await compile(source, { mode: mode === 'test' ? 'test' : 'program' });
    const result = { name: testCase.name, path: testCase.path, mode, allowFailure: Boolean(testCase.allowFailure), logs: [], status: 'passed' };
    if (mode === 'compile') return result;
    const compiledModule = await loadNodeModuleFromSource(shim, { prefix: 'utu-example-' });
    try {
        const exports = await compiledModule.module.instantiate();
        if (mode === 'test') {
            if (!metadata.tests.length) throw new Error(`No tests found in ${testCase.path}`);
            if ('expectedTests' in testCase && metadata.tests.length !== testCase.expectedTests)
                throw new Error(`Expected ${testCase.expectedTests} tests, found ${metadata.tests.length}`);
            for (const { name, exportName } of metadata.tests) {
                if (typeof exports[exportName] !== 'function')
                    throw new Error(`Missing test export "${exportName}" on ${testCase.path}`);
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
        if (typeof exports[entry] !== 'function')
            throw new Error(`Export "${entry}" was not found on ${testCase.path}`);
        const args = Array.isArray(testCase.args) ? testCase.args : [];
        const returnValue = exports[entry](...args);
        if ('expectedReturn' in testCase) {
            const actual = normalizeValue(returnValue);
            if (!valuesEqual(actual, testCase.expectedReturn))
                throw new Error(`Expected return ${JSON.stringify(testCase.expectedReturn)}, got ${JSON.stringify(actual)}`);
            result.returnValue = actual;
        } else if (returnValue !== undefined)
            result.returnValue = normalizeValue(returnValue);
        if (Array.isArray(testCase.expectedLogs) && !valuesEqual(result.logs, testCase.expectedLogs))
            throw new Error(`Expected logs ${JSON.stringify(testCase.expectedLogs)}, got ${JSON.stringify(result.logs)}`);
        return result;
    } finally {
        await compiledModule.cleanup?.();
    }
}

function makeFailureResult(testCase, error) {
    return { name: testCase.name, path: testCase.path, mode: testCase.mode ?? 'run', allowFailure: Boolean(testCase.allowFailure), logs: [], status: testCase.allowFailure ? 'allowed-failure' : 'failed', error: String(error?.message ?? error) };
}

function parseArgs(argv) {
    const options = { tags: [], compileAll: false, cliSmoke: false, cliBenchExamples: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--compile-all': options.compileAll = true; break;
            case '--cli-smoke': options.cliSmoke = true; break;
            case '--cli-bench-examples': options.cliBenchExamples = true; break;
            case '--example-root': options.exampleRoot = argv[++i]; break;
            case '--manifest': options.manifest = argv[++i]; break;
            case '--report-file': options.reportFile = argv[++i]; break;
            case '--tag': options.tags.push(argv[++i]); break;
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
    const selectedTags = new Set(options.tags);
    const cases = manifest.cases.filter((testCase) => selectedTags.size === 0 || testCase.tags?.some((tag) => selectedTags.has(tag)));
    if (cases.length === 0) return void (console.error(`No example cases matched for manifest ${manifestPath}`), process.exit(1));
    const results = [];
    for (const testCase of cases) {
        const startedAt = Date.now();
        const result = await runCase(testCase).catch((error) => makeFailureResult(testCase, error));
        result.durationMs = Date.now() - startedAt;
        results.push(result);
        const prefix = result.status === 'passed' ? 'PASS' : result.status === 'allowed-failure' ? 'WARN' : 'FAIL';
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
    console.log(`\nSummary: ${report.summary.passed}/${report.summary.total} passed, ${report.summary.allowedFailures} allowed failures, ${report.summary.requiredFailures} required failures`);
    process.exit(requiredFailures.length ? 1 : 0);
}

async function runCompileAll(options) {
    const exampleRoot = resolve(repoRoot, options.exampleRoot ?? 'examples');
    const files = (await collectUtuFiles(exampleRoot)).sort();
    let failed = false;

    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const rel = relative(repoRoot, file);

        for (const { mode } of collectCompileJobs(source)) {
            try {
                const { metadata } = await compile(source, { mode });
                const details = mode === 'test' ? ` ${metadata.tests.length} tests` : mode === 'bench' ? ` ${metadata.benches.length} benches` : '';
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

async function runCliCases(includeBenchExamples) {
    const cases = [...CLI_CASES.map(([name, args, code, text, stdin]) => [name, async () => {
        const { output, exitCode } = await runCli(args, stdin);
        if (exitCode !== code || !output.includes(text)) throw new Error(output.trim());
    }]), ...(includeBenchExamples ? CLI_BENCH_EXAMPLE_CASES.map(([name, path, labels]) => [name, async () => {
        const { output, exitCode } = await runCli(['bench', path, '--seconds', '0.01', '--samples', '1', '--warmup', '0']);
        if (exitCode !== 0 || !labels.every((label) => output.includes(label))) throw new Error(output.trim());
    }]) : [])];
    if (await runNamedCases(cases))
        process.exit(1);
}
