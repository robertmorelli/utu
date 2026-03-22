import * as vscode from 'vscode';
import { toVscodeRange } from './adapters/core.js';
import { getBenchmarkOptionsFromConfig } from './benchmarking.js';
import { displayNameForUri } from './documentNames.js';
import { collectRunnableEntries } from '../compiler/lsp_core/languageService.js';
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
        const entries = collectRunnableEntries(await dependencies.languageService.getDocumentIndex(document))
            .filter((entry) => entry.kind !== 'main');
        if (!entries.length) {
            controller.items.delete(uri.toString());
            return;
        }
        const fileItem = controller.items.get(uri.toString()) ?? createFileItem(uri);
        fileItem.children.replace(entries.map((entry) => {
            const item = controller.createTestItem(`${uri.toString()}#${entry.kind}:${entry.symbol.range.start.line}:${entry.symbol.range.start.character}`, entry.symbol.name, uri);
            item.description = entry.kind;
            item.range = toVscodeRange(entry.symbol.range);
            item.tags = [entry.kind === 'bench' ? BENCH_TAG : TEST_TAG];
            itemData.set(item, {
                kind: entry.kind,
                label: entry.symbol.name,
                ordinal: entry.ordinal,
                uri,
            });
            return item;
        }));
        if (!controller.items.get(fileItem.id)) {
            controller.items.add(fileItem);
        }
    };
    const createFileItem = (uri) => {
        const fileItem = controller.createTestItem(uri.toString(), displayNameForUri(uri), uri);
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
                        for (const item of items) {
                            const data = itemData.get(item);
                            if (!data || data.kind !== 'test')
                                continue;
                            run.started(item);
                            const result = await dependencies.runtimeHost.runTest(document.getText(), data.ordinal);
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
                        for (const item of items) {
                            const data = itemData.get(item);
                            if (!data || data.kind !== 'bench')
                                continue;
                            run.started(item);
                            const result = await dependencies.runtimeHost.runBenchmark(document.getText(), data.ordinal, getBenchmarkOptionsFromConfig());
                            appendLogs(run, item, result.logs, result.summary);
                            run.passed(item, result.durationMs);
                        }
                    }
                }
                catch (error) {
                    const message = JSON.stringify(error);
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
function appendLogs(run, item, logs, summary) {
    const lines = [...logs];
    if (summary)
        lines.push(summary);
    if (!lines.length)
        return;
    run.appendOutput(`${lines.join('\r\n')}\r\n`);
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
