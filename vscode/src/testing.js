import * as vscode from 'vscode';
import { toVscodeRange } from './adapters/core.js';
import { formatError } from './compilerHost.js';
const TEST_TAG = new vscode.TestTag('utu-test');
const BENCH_TAG = new vscode.TestTag('utu-bench');
export function registerTesting(context, dependencies) {
    const controller = vscode.tests.createTestController('utu', 'UTU');
    const itemData = new WeakMap();
    const refreshWorkspace = async () => {
        const uris = await vscode.workspace.findFiles('**/*.utu', '**/node_modules/**');
        const liveIds = new Set();
        await Promise.all(uris.map(async (uri) => {
            liveIds.add(uri.toString());
            await refreshFile(uri);
        }));
        controller.items.forEach((item) => {
            if (!liveIds.has(item.id)) {
                controller.items.delete(item.id);
            }
        });
    };
    const refreshFile = async (uri) => {
        const document = await vscode.workspace.openTextDocument(uri);
        const symbols = (await dependencies.languageService.getDocumentIndex(document)).topLevelSymbols.filter(isRunnableSymbol);
        if (!symbols.length) {
            controller.items.delete(uri.toString());
            return;
        }
        const fileItem = controller.items.get(uri.toString()) ?? createFileItem(uri);
        const ordinalByKind = new Map([
            ['test', 0],
            ['bench', 0],
        ]);
        fileItem.children.replace(symbols.map((symbol) => {
            const kind = symbol.kind;
            const ordinal = ordinalByKind.get(kind) ?? 0;
            ordinalByKind.set(kind, ordinal + 1);
            const item = controller.createTestItem(`${uri.toString()}#${kind}:${symbol.range.start.line}:${symbol.range.start.character}`, symbol.name, uri);
            item.description = symbol.kind;
            item.range = toVscodeRange(symbol.range);
            item.tags = [kind === 'bench' ? BENCH_TAG : TEST_TAG];
            itemData.set(item, {
                kind,
                label: symbol.name,
                ordinal,
                uri,
            });
            return item;
        }));
        if (!controller.items.get(fileItem.id)) {
            controller.items.add(fileItem);
        }
    };
    const createFileItem = (uri) => {
        const fileItem = controller.createTestItem(uri.toString(), fileNameFromUri(uri), uri);
        itemData.set(fileItem, { kind: 'file', uri });
        return fileItem;
    };
    const collectRunnableItems = async (request, kind) => {
        const queue = request.include ? [...request.include] : collectRootItems(controller.items);
        const excluded = new Set(request.exclude?.map((item) => item.id) ?? []);
        const grouped = new Map();
        while (queue.length) {
            const item = queue.pop();
            if (!item || excluded.has(item.id))
                continue;
            const data = itemData.get(item);
            if (!data)
                continue;
            if (data.kind === 'file') {
                if (item.children.size === 0) {
                    await refreshFile(data.uri);
                }
                queue.push(...collectRootItems(item.children));
                continue;
            }
            if (data.kind !== kind)
                continue;
            const group = grouped.get(data.uri.toString()) ?? [];
            group.push(item);
            grouped.set(data.uri.toString(), group);
        }
        return grouped;
    };
    const runItems = async (request, token, kind) => {
        const run = controller.createTestRun(request, kind === 'test' ? 'UTU Tests' : 'UTU Benchmarks');
        try {
            const itemsByFile = await collectRunnableItems(request, kind);
            for (const [uriString, items] of itemsByFile) {
                if (token.isCancellationRequested)
                    break;
                const uri = vscode.Uri.parse(uriString, true);
                const document = await vscode.workspace.openTextDocument(uri);
                try {
                    if (kind === 'test') {
                        const results = await dependencies.runtimeHost.runTests(document.getText());
                        for (const item of items) {
                            const data = itemData.get(item);
                            if (!data || data.kind !== 'test')
                                continue;
                            const result = results[data.ordinal];
                            run.started(item);
                            if (!result) {
                                run.errored(item, new vscode.TestMessage(`Missing runtime result for "${data.label}".`));
                                continue;
                            }
                            appendLogs(run, item, result.logs);
                            if (result.passed) {
                                run.passed(item, result.durationMs);
                            }
                            else {
                                run.failed(item, new vscode.TestMessage(result.error ?? 'Test failed.'), result.durationMs);
                            }
                        }
                    }
                    else {
                        const results = await dependencies.runtimeHost.runBenchmarks(document.getText(), getBenchmarkOptions());
                        for (const item of items) {
                            const data = itemData.get(item);
                            if (!data || data.kind !== 'bench')
                                continue;
                            const result = results[data.ordinal];
                            run.started(item);
                            if (!result) {
                                run.errored(item, new vscode.TestMessage(`Missing benchmark result for "${data.label}".`));
                                continue;
                            }
                            appendLogs(run, item, result.logs, `${result.name}: mean ${formatMs(result.meanMs)}, min ${formatMs(result.minMs)}, max ${formatMs(result.maxMs)}, ${formatMs(result.perIterationMs)}/iter`);
                            run.passed(item, result.durationMs);
                        }
                    }
                }
                catch (error) {
                    const message = formatError(error);
                    dependencies.output.appendLine(`[utu] ${uri.fsPath || uri.toString()}`);
                    dependencies.output.appendLine(message);
                    for (const item of items) {
                        run.errored(item, new vscode.TestMessage(message));
                    }
                }
            }
        }
        finally {
            run.end();
        }
    };
    controller.resolveHandler = async (item) => {
        if (!item) {
            await refreshWorkspace();
            return;
        }
        const data = itemData.get(item);
        if (data?.kind === 'file') {
            await refreshFile(data.uri);
        }
    };
    const testProfile = controller.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, (request, token) => runItems(request, token, 'test'));
    testProfile.tag = TEST_TAG;
    const benchProfile = controller.createRunProfile('Run Benchmarks', vscode.TestRunProfileKind.Run, (request, token) => runItems(request, token, 'bench'));
    benchProfile.tag = BENCH_TAG;
    const scheduleRefresh = createRefreshScheduler(refreshFile);
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.utu');
    context.subscriptions.push(controller, testProfile, benchProfile, watcher, vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId === 'utu')
            void refreshFile(document.uri);
    }), vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === 'utu')
            scheduleRefresh(event.document.uri);
    }), vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.languageId === 'utu')
            void refreshFile(document.uri);
    }), watcher.onDidCreate((uri) => {
        void refreshFile(uri);
    }), watcher.onDidChange((uri) => {
        scheduleRefresh(uri);
    }), watcher.onDidDelete((uri) => {
        controller.items.delete(uri.toString());
    }));
    void refreshWorkspace();
}
function collectRootItems(collection) {
    const items = [];
    collection.forEach((item) => {
        items.push(item);
    });
    return items;
}
function isRunnableSymbol(symbol) {
    return symbol.kind === 'test' || symbol.kind === 'bench';
}
function appendLogs(run, item, logs, summary) {
    const lines = [...logs];
    if (summary)
        lines.push(summary);
    if (!lines.length)
        return;
    run.appendOutput(`${lines.join('\r\n')}\r\n`);
}
function fileNameFromUri(uri) {
    return uri.path.split('/').filter(Boolean).at(-1) ?? uri.toString();
}
function getBenchmarkOptions() {
    const config = vscode.workspace.getConfiguration('utu');
    return {
        iterations: clampCount(config.get('bench.iterations', 1000), 1),
        samples: clampCount(config.get('bench.samples', 10), 1),
        warmup: clampCount(config.get('bench.warmup', 2), 0),
    };
}
function formatMs(value) {
    if (value >= 1)
        return `${value.toFixed(3)}ms`;
    if (value >= 0.001)
        return `${(value * 1000).toFixed(3)}us`;
    return `${(value * 1_000_000).toFixed(0)}ns`;
}
function createRefreshScheduler(refreshFile) {
    const pending = new Map();
    return (uri) => {
        const key = uri.toString();
        clearTimeout(pending.get(key));
        pending.set(key, setTimeout(() => {
            pending.delete(key);
            void refreshFile(uri);
        }, 150));
    };
}
function clampCount(value, minimum) {
    return Number.isFinite(value) ? Math.max(minimum, Math.floor(value ?? minimum)) : minimum;
}
