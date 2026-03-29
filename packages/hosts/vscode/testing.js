import * as vscode from 'vscode';
import { toVscodeRange } from './adapters/core.js';
import { DEFAULT_BENCHMARK_OPTIONS } from '../../runtime/index.js';
import { displayNameForUri } from './generatedDocuments.js';
import { collectRunnableEntries } from '../../language-platform/index.js';
import { createDebouncedUriScheduler, logOutputError, UTU_EXCLUDE, UTU_GLOB, UTU_LANGUAGE_ID } from './shared.js';
const TEST_TAG = new vscode.TestTag('utu-test'), BENCH_TAG = new vscode.TestTag('utu-bench');
const RUNNERS = { test: { label: 'UTU Tests', tag: TEST_TAG, run: (dependencies, source, ordinal, options) => dependencies.runtimeHost.runTest(source, ordinal, options) }, bench: { label: 'UTU Benchmarks', tag: BENCH_TAG, run: (dependencies, source, ordinal, options) => dependencies.runtimeHost.runBenchmark(source, ordinal, { ...getBenchmarkOptionsFromConfig(), ...options }) } };
export function registerTesting(context, dependencies) {
    const controller = vscode.tests.createTestController('utu', 'UTU');
    const itemData = new WeakMap();
    const refreshFile = async (uri) => {
        const id = uri.toString(), entries = collectRunnableEntries(await dependencies.languageService.getDocumentIndex(await vscode.workspace.openTextDocument(uri))).filter((entry) => entry.kind !== 'main');
        if (!entries.length) return controller.items.delete(id);
        const fileItem = controller.items.get(id) ?? controller.createTestItem(id, displayNameForUri(uri), uri);
        itemData.set(fileItem, { kind: 'file', uri });
        fileItem.children.replace(entries.map((entry) => {
            const item = controller.createTestItem(`${uri}#${entry.kind}:${entry.symbol.range.start.line}:${entry.symbol.range.start.character}`, entry.symbol.name, uri);
            item.description = entry.kind;
            item.range = toVscodeRange(entry.symbol.range);
            item.tags = [RUNNERS[entry.kind].tag];
            itemData.set(item, { kind: entry.kind, ordinal: entry.ordinal, uri });
            return item;
        }));
        if (!controller.items.get(fileItem.id)) controller.items.add(fileItem);
    };
    const refreshWorkspace = async () => { const liveIds = new Set(); await Promise.all((await vscode.workspace.findFiles(UTU_GLOB, UTU_EXCLUDE)).map(async (uri) => { liveIds.add(uri.toString()); await refreshFile(uri); })); controller.items.forEach((item) => !liveIds.has(item.id) && controller.items.delete(item.id)); };
    const collectRunnableItems = async (request, kind) => {
        const queue = request.include ? [...request.include] : Array.from(controller.items);
        const excluded = new Set(request.exclude?.map((item) => item.id));
        const grouped = new Map();
        while (queue.length) {
            const item = queue.pop();
            const data = item && itemData.get(item);
            if (!item || !data || excluded.has(item.id)) continue;
            if (data.kind === 'file') {
                if (item.children.size === 0) await refreshFile(data.uri);
                queue.push(...Array.from(item.children));
                continue;
            }
            if (data.kind !== kind) continue;
            (grouped.get(data.uri.toString()) ?? grouped.set(data.uri.toString(), []).get(data.uri.toString())).push(item);
        }
        return grouped;
    };
    const runItems = async (request, token, kind) => {
        const run = controller.createTestRun(request, RUNNERS[kind].label);
        try {
            for (const [uriString, items] of await collectRunnableItems(request, kind)) {
                if (token.isCancellationRequested) break;
                const uri = vscode.Uri.parse(uriString, true);
                try {
                    const source = (await vscode.workspace.openTextDocument(uri)).getText();
                    for (const item of items) {
                        const data = itemData.get(item);
                        if (!data || data.kind !== kind) continue;
                        run.started(item);
                        const result = await RUNNERS[kind].run(dependencies, source, data.ordinal, { uri: uri.toString() });
                        if (result.logs.length || result.summary) run.appendOutput(`${[...result.logs, ...(result.summary ? [result.summary] : [])].join('\r\n')}\r\n`);
                        if (kind === 'test' && !result.passed) run.failed(item, new vscode.TestMessage(result.error ?? 'Test failed.'), result.durationMs);
                        else run.passed(item, result.durationMs);
                    }
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : JSON.stringify(error);
                    logOutputError(dependencies.output, `[utu] ${uri.fsPath || uri.toString()}`, error);
                    for (const item of items) run.errored(item, new vscode.TestMessage(message));
                }
            }
        }
        finally { run.end(); }
    };
    const refreshScheduler = createDebouncedUriScheduler(150, refreshFile);
    const watcher = vscode.workspace.createFileSystemWatcher(UTU_GLOB);
    controller.resolveHandler = async (item) => !item ? refreshWorkspace() : itemData.get(item)?.kind === 'file' && refreshFile(itemData.get(item).uri);
    const testProfile = controller.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, (request, token) => runItems(request, token, 'test'));
    const benchProfile = controller.createRunProfile('Run Benchmarks', vscode.TestRunProfileKind.Run, (request, token) => runItems(request, token, 'bench'));
    testProfile.tag = TEST_TAG; benchProfile.tag = BENCH_TAG;
    context.subscriptions.push(controller, testProfile, benchProfile, watcher, { dispose: () => refreshScheduler.clear() }, vscode.workspace.onDidOpenTextDocument((document) => document.languageId === UTU_LANGUAGE_ID && void refreshFile(document.uri)), vscode.workspace.onDidChangeTextDocument((event) => event.document.languageId === UTU_LANGUAGE_ID && refreshScheduler.schedule(event.document.uri)), vscode.workspace.onDidSaveTextDocument((document) => document.languageId === UTU_LANGUAGE_ID && void refreshFile(document.uri)), watcher.onDidCreate((uri) => { void refreshFile(uri); }), watcher.onDidChange((uri) => refreshScheduler.schedule(uri)), watcher.onDidDelete((uri) => { refreshScheduler.delete(uri); controller.items.delete(uri.toString()); }));
    void refreshWorkspace();
}

export function getBenchmarkOptionsFromConfig(config = vscode.workspace.getConfiguration('utu')) {
    const seconds = config.get('bench.seconds', DEFAULT_BENCHMARK_OPTIONS.seconds);
    return { seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_BENCHMARK_OPTIONS.seconds, samples: clampBenchmarkCount(config.get('bench.samples', DEFAULT_BENCHMARK_OPTIONS.samples), 1), warmup: clampBenchmarkCount(config.get('bench.warmup', DEFAULT_BENCHMARK_OPTIONS.warmup), 0) };
}
function clampBenchmarkCount(value, minimum) { return Number.isFinite(value) ? Math.max(minimum, Math.floor(value ?? minimum)) : minimum; }
