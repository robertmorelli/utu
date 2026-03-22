export const UTU_GLOB = '**/*.utu', UTU_EXCLUDE = '**/node_modules/**', UTU_LANGUAGE_ID = 'utu';
export function createDebouncedUriScheduler(delay, run) {
    const pending = new Map(), clear = (uri) => (clearTimeout(pending.get(uri.toString())), pending.delete(uri.toString()));
    return { schedule(uri) { clear(uri), pending.set(uri.toString(), setTimeout(() => (pending.delete(uri.toString()), void run(uri)), delay)); }, delete: clear, clear() { for (const timeout of pending.values())
            clearTimeout(timeout); pending.clear(); } };
}
export function appendOutputBlock(output, title, lines = [], result) { output.appendLine(title); for (const line of lines)
    output.appendLine(line); if (result !== undefined)
    output.appendLine(String(result)); output.show(true); }
export function formatError(error) { return error instanceof Error ? error.message : JSON.stringify(error); }
export function logOutputError(output, label, error) { appendOutputBlock(output, label, [formatError(error)]); }
